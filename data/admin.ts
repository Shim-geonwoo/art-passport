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

// 편집 화면 하나만 다시 불러온다 (저장 직후 화면을 최신으로 맞출 때)
export async function fetchAdminEvent(
  id: string,
  now: Date = new Date()
): Promise<AdminEventItem | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, genre, venue_name, price, show_at, show_end_at, poster_url, description, is_hidden, event_schedules(id, starts_at)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? mapRow(data as unknown as AdminEventRow, now) : null;
}

// ── 쓰기 ──────────────────────────────────────────────────
//
// 아래 함수들은 events 표를 직접 쓴다. 예매·쿠폰과 달리 서버 함수를 거치지 않는데,
// 관리자가 곧 정보의 출처라 서버가 다시 계산할 원본이 없기 때문이다.
// 확인할 것은 "누가 하느냐" 하나뿐이고 그건 RLS 정책이 한다
// (events_insert_admin / events_update_admin — 20260806150000_admin_role.sql).
//
// 그래서 관리자가 아닌 사람이 이 함수를 불러도 서버가 거절한다. 화면을 감추는 건 편의일 뿐이다.

// 화면이 채워 보내는 값. 관람 일정과 종류(공연/전시)는 여기서 정해진다.
export type AdminEventInput = {
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date;
  // 값이 있으면 전시(기간형), null이면 공연(회차형).
  // 이 한 칸이 앱 전체의 분기를 만든다 — 회차를 쓸지, 관람일을 고르게 할지, 정원이 있는지.
  showEndAt: Date | null;
  description: string | null;
};

function toRow(input: AdminEventInput) {
  return {
    title: input.title.trim(),
    genre: input.genre,
    venue_name: input.venueName.trim(),
    price: input.price,
    show_at: input.showAt.toISOString(),
    show_end_at: input.showEndAt ? input.showEndAt.toISOString() : null,
    // 빈 소개글은 빈 문자열이 아니라 null로 저장한다. 화면이 "준비 중"으로 대체하는 기준이
    // null이라, 빈 문자열을 넣으면 아무것도 없는 칸이 소개글인 척하게 된다.
    description: input.description && input.description.trim().length > 0
      ? input.description.trim()
      : null,
  };
}

// 새 공연을 만든다. 만들어진 id를 돌려준다 — 포스터를 올릴 때 경로에 필요하다.
//
// 새로 만든 공연은 곧바로 예매 탭에 뜨지 않는다(회차형이면 회차가 아직 없어서다).
// 관리자 목록에서 '회차 없음' 뱃지로 그 상태를 알려주고, 4단계 회차 화면에서 채운다.
export async function createAdminEvent(input: AdminEventInput): Promise<string> {
  const { data, error } = await supabase.from('events').insert(toRow(input)).select('id').single();
  if (error) {
    throw error;
  }
  return data.id as string;
}

export async function updateAdminEvent(id: string, input: AdminEventInput): Promise<void> {
  const { error } = await supabase.from('events').update(toRow(input)).eq('id', id);
  if (error) {
    throw error;
  }
}

// 카탈로그에서 내리거나 다시 올린다.
//
// 삭제가 아니라 숨김인 이유: 예매가 달린 공연이 사라지면 예매 상세와 여권 스탬프가 가리킬 곳을
// 잃는다. DB도 같은 이유로 삭제를 막아 뒀다(정책도 권한도 주지 않았다).
export async function setEventHidden(id: string, isHidden: boolean): Promise<void> {
  const { error } = await supabase.from('events').update({ is_hidden: isHidden }).eq('id', id);
  if (error) {
    throw error;
  }
}

// ── 포스터 (Supabase Storage) ─────────────────────────────
//
// 구조는 프로필 사진(data/profile.ts)과 같다. 다른 것은 경로 규칙과 누가 쓸 수 있는가 둘뿐이다.

const POSTER_BUCKET = 'posters';

// base64 글자를 실제 바이트로 바꾼다. (data/profile.ts와 같은 이유 — 라이브러리를 더 넣지 않는다)
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 포스터를 올리고 events.poster_url에 주소를 적은 뒤 최종 주소를 돌려준다.
//
// 경로는 공연마다 하나로 고정한다({event_id}/poster.jpg). 바꿀 때마다 새 파일을 만들면
// 지난 이미지가 쌓이므로 같은 자리에 덮어쓴다(upsert).
// 대신 주소가 늘 같아서 캐시에 남은 옛 이미지가 보일 수 있어 끝에 시각(?v=...)을 붙인다.
export async function uploadPoster(
  eventId: string,
  base64: string,
  contentType: string
): Promise<string> {
  const path = `${eventId}/poster.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, base64ToBytes(base64), { contentType, upsert: true });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(POSTER_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('events')
    .update({ poster_url: publicUrl })
    .eq('id', eventId);
  if (updateError) {
    throw updateError;
  }

  return publicUrl;
}

// 포스터를 내린다. 파일과 events.poster_url을 함께 비운다.
// 공연 자체는 지울 수 없지만 포스터는 지울 수 있다 — 잘못 올린 이미지를 내리는 건 흔한 일이고,
// 지워도 카탈로그는 카테고리 색 박스로 대체해서 계속 보인다.
export async function removePoster(eventId: string): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(POSTER_BUCKET)
    .remove([`${eventId}/poster.jpg`]);
  if (removeError) {
    throw removeError;
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({ poster_url: null })
    .eq('id', eventId);
  if (updateError) {
    throw updateError;
  }
}
