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

// docs/data-structure.md의 events 테이블 칸 그대로.
export type EventItem = {
  id: string;
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date; // 회차형: 공연 시작 일시 / 기간형(전시): 전시 시작일
  showEndAt: Date | null; // 기간형(전시)만 값이 있음. null이면 회차형(공연)
  posterUrl: string | null;
  description: string | null;
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
  };
}

// 예매 카탈로그 전체를 불러온다. RLS가 누구나 조회 가능하게 열어둬서 로그인 전에도 호출할 수 있다.
export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase.from('events').select('*').order('show_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(mapEventRow);
}

// 공연 카드/상세에 보여줄 일정 문자열.
// - 전시(기간형): "2026.08.02 ~ 2026.09.30"
// - 공연(회차형): "2026.08.14 19:30"
export function formatEventSchedule(event: EventItem): string {
  if (event.showEndAt) {
    return `${formatDate(event.showAt)} ~ ${formatDate(event.showEndAt)}`;
  }
  return formatDateTime(event.showAt);
}

// 지금 이 이벤트를 예매할 수 있는가.
// - 전시(기간형): 종료일이 아직 안 지났으면(오늘 포함) 예매 가능.
// - 공연(회차형): 공연 시작 시각이 아직 안 지났으면 예매 가능.
export function isBookable(event: EventItem, now: Date = new Date()): boolean {
  if (event.showEndAt) {
    return startOfToday(event.showEndAt).getTime() >= startOfToday(now).getTime();
  }
  return event.showAt.getTime() > now.getTime();
}

// 이 예매의 실제 관람 시각을 정한다.
// - 회차형(공연): 공연 시작 시각을 그대로 쓴다(하루뿐이라 고를 게 없다).
// - 기간형(전시): 아직 날짜 선택 화면이 없어서 "내일"을 기본으로 하되, 전시 기간(showAt~showEndAt)
//   안으로 맞춘다. (좌석/회차 선택이 생기면 그걸로 대체될 임시 규칙)
export function pickWatchedAt(event: EventItem, now: Date = new Date()): Date {
  if (!event.showEndAt) {
    return event.showAt;
  }
  const tomorrow = new Date(startOfToday(now).getTime() + 24 * 60 * 60 * 1000);
  const earliest = event.showAt.getTime() > tomorrow.getTime() ? event.showAt : tomorrow;
  return earliest.getTime() > event.showEndAt.getTime() ? event.showEndAt : earliest;
}
