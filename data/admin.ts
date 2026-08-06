// 관리자용 데이터 — 카탈로그를 "관리하는 쪽"에서 보는 시선
//
// data/events.ts와 일부러 나눠 뒀다. 두 곳이 같은 events 표를 보지만 필요한 게 다르다:
//
//   data/events.ts  — 예매하는 사람이 보는 카탈로그. 숨긴 공연은 빼고, 회차는 예매용으로 쓴다.
//   여기            — 관리하는 사람이 보는 카탈로그. **숨긴 것까지 전부** 나와야 하고,
//                     "왜 목록에 안 보이는지"(회차 없음 / 숨김)를 알려줘야 한다.
//
// 쓰기 권한은 DB가 정한다(20260806150000_admin_role.sql). 여기서 화면을 감추는 건 편의일 뿐이고,
// 관리자가 아닌 사람이 이 함수를 불러 저장을 시도하면 서버가 거절한다.

import { Genre } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

// 지금 로그인한 사람이 관리자인가.
//
// admins 표를 직접 읽지 않는다 — 읽을 수도 없다(권한을 회수하고 정책도 두지 않았다).
// 대신 is_admin() 함수에게 물어본다. 이 함수만 SECURITY DEFINER라 그 표를 볼 수 있다.
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    throw error;
  }
  return data === true;
}

export type AdminEventItem = {
  id: string;
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date;
  showEndAt: Date | null; // 값이 있으면 전시(기간형), null이면 공연(회차형)
  posterUrl: string | null;
  description: string | null;
  isHidden: boolean;
  scheduleCount: number; // 등록된 회차 수 (전시는 항상 0)
  upcomingScheduleCount: number; // 그중 아직 안 지난 회차 수
};

type AdminEventRow = {
  id: string;
  title: string;
  genre: string;
  venue_name: string;
  price: number;
  show_at: string;
  show_end_at: string | null;
  poster_url: string | null;
  description: string | null;
  is_hidden: boolean;
  event_schedules: { id: string; starts_at: string }[] | null;
};

function mapRow(row: AdminEventRow, now: Date): AdminEventItem {
  const schedules = row.event_schedules ?? [];
  return {
    id: row.id,
    title: row.title,
    genre: row.genre as Genre,
    venueName: row.venue_name,
    price: row.price,
    showAt: new Date(row.show_at),
    showEndAt: row.show_end_at ? new Date(row.show_end_at) : null,
    posterUrl: row.poster_url,
    description: row.description,
    isHidden: row.is_hidden,
    scheduleCount: schedules.length,
    upcomingScheduleCount: schedules.filter((s) => new Date(s.starts_at).getTime() > now.getTime())
      .length,
  };
}

// 카탈로그 전체를 관리자 시선으로 불러온다.
//
// fetchEvents(data/events.ts)와 달리 is_hidden으로 거르지 않는다 — 숨긴 공연이야말로
// 관리 화면에서 찾아 다시 올릴 수 있어야 하는 대상이다.
// 회차는 개수만 세면 되므로 id와 시각만 받아온다(정원·판매수는 4단계 회차 화면에서 쓴다).
export async function fetchAdminEvents(now: Date = new Date()): Promise<AdminEventItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, genre, venue_name, price, show_at, show_end_at, poster_url, description, is_hidden, event_schedules(id, starts_at)'
    )
    .order('show_at', { ascending: true });
  if (error) {
    throw error;
  }
  return ((data ?? []) as unknown as AdminEventRow[]).map((row) => mapRow(row, now));
}

// 이 공연이 지금 예매 탭에 보이는가, 안 보인다면 왜인가.
//
// 관리 화면에서 가장 자주 묻게 될 질문이라 한곳에서 답을 만든다. 특히 "회차 없음"이 중요하다 —
// 공연을 등록해도 회차를 안 만들면 예매 탭에 아예 안 뜨는데, 화면 어디에도 그 이유가 없으면
// 등록이 실패한 줄 알게 된다. (전시는 회차 개념이 없어서 이 경우가 없다)
export type CatalogVisibility = { visible: boolean; reason: string | null };

export function catalogVisibility(event: AdminEventItem, now: Date = new Date()): CatalogVisibility {
  if (event.isHidden) {
    return { visible: false, reason: '숨김' };
  }

  if (event.showEndAt) {
    // 전시(기간형): 종료일이 안 지났으면 보인다 (data/events.ts의 isBookable과 같은 규칙)
    const ended = event.showEndAt.getTime() < now.getTime();
    return ended ? { visible: false, reason: '전시 종료' } : { visible: true, reason: null };
  }

  if (event.scheduleCount === 0) {
    return { visible: false, reason: '회차 없음' };
  }
  if (event.upcomingScheduleCount === 0) {
    return { visible: false, reason: '남은 회차 없음' };
  }
  return { visible: true, reason: null };
}
