// 예매 탭에 뿌리는 실제 공연/전시 카탈로그 (Supabase events 테이블)
//
// offset 없이 진짜 timestamp(show_at/show_end_at)를 그대로 쓴다.
// (docs/data-flow.md 1장: "Supabase 연동 시엔 offset은 필요 없고 실제 timestamp를 쓰면 된다")
//
// data/bookings.ts가 예매(bookings)에 딸려오는 event를 표시할 때도 이 파일의 mapEventRow/EventItem을
// 그대로 재사용한다(한 이벤트를 두 군데서 다르게 옮기지 않도록).

import { Genre } from '@/constants/colors';
import { formatDate, formatDateTime, startOfToday } from '@/data/schedule';
import { supabase } from '@/lib/supabase';

// 공연 회차 하나 (event_schedules 테이블의 한 행).
// 전시(기간형)는 정해진 시각이 없어서 회차를 만들지 않는다 → schedules가 빈 배열이다.
export type EventSchedule = {
  id: string;
  startsAt: Date;
};

// docs/data-structure.md의 events 테이블 칸 그대로.
export type EventItem = {
  id: string;
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date; // 회차형: 첫 회차 일시 / 기간형(전시): 전시 시작일
  showEndAt: Date | null; // 기간형(전시)만 값이 있음. null이면 회차형(공연)
  posterUrl: string | null;
  description: string | null;
  schedules: EventSchedule[]; // 회차형(공연)의 회차 목록, 이른 순. 전시는 빈 배열
};

// Supabase events 테이블 row의 생 형태(snake_case). bookings 조회 시 조인된 event도 이 형태로 온다.
export type EventRow = {
  id: string;
  title: string;
  genre: string;
  venue_name: string;
  price: number;
  show_at: string;
  show_end_at: string | null;
  poster_url: string | null;
  description: string | null;
  // 예매 카탈로그를 불러올 때만 함께 딸려온다. 예매(bookings) 조회 때는 회차 목록이 필요 없어서 없다.
  event_schedules?: { id: string; starts_at: string }[] | null;
};

export function mapEventRow(row: EventRow): EventItem {
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
    // 회차는 항상 이른 순으로 정렬해 둔다 (화면마다 다시 정렬하지 않아도 되게)
    schedules: (row.event_schedules ?? [])
      .map((s) => ({ id: s.id, startsAt: new Date(s.starts_at) }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  };
}

// 예매 카탈로그 전체를 불러온다. RLS가 누구나 조회 가능하게 열어둬서 로그인 전에도 호출할 수 있다.
// 회차(event_schedules)도 한 번에 같이 받아온다 — 목록에서 "예매 가능한가"를 판단하려면
// 미래 회차가 남았는지 봐야 하고, 결제 화면의 회차 선택도 이 값을 그대로 쓴다.
export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*, event_schedules(id, starts_at)')
    .order('show_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(mapEventRow);
}

// 아직 안 지난 회차만 (예매할 수 있는 회차). 전시는 회차가 없어서 항상 빈 배열이다.
export function upcomingSchedules(event: EventItem, now: Date = new Date()): EventSchedule[] {
  return event.schedules.filter((s) => s.startsAt.getTime() > now.getTime());
}

// 공연 카드/상세에 보여줄 일정 문자열. 둘 다 "언제부터 언제까지"로 읽히게 맞춘다.
// - 전시(기간형): "2026.08.02 ~ 2026.09.30" (전시 기간)
// - 공연(회차형, 회차 여러 개): "2026.08.14 ~ 2026.08.20" (첫 회차 ~ 마지막 회차)
// - 공연(회차형, 회차 하나): "2026.08.14 19:30"
export function formatEventSchedule(event: EventItem): string {
  if (event.showEndAt) {
    return `${formatDate(event.showAt)} ~ ${formatDate(event.showEndAt)}`;
  }
  if (event.schedules.length > 1) {
    const last = event.schedules[event.schedules.length - 1];
    return `${formatDate(event.schedules[0].startsAt)} ~ ${formatDate(last.startsAt)}`;
  }
  return formatDateTime(event.showAt);
}

// 지금 이 이벤트를 예매할 수 있는가.
// - 전시(기간형): 종료일이 아직 안 지났으면(오늘 포함) 예매 가능.
// - 공연(회차형): 아직 안 지난 회차가 하나라도 남아 있으면 예매 가능.
//   (첫 회차가 지났어도 뒤 회차가 남았으면 계속 예매할 수 있다)
export function isBookable(event: EventItem, now: Date = new Date()): boolean {
  if (event.showEndAt) {
    return startOfToday(event.showEndAt).getTime() >= startOfToday(now).getTime();
  }
  return upcomingSchedules(event, now).length > 0;
}
