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

// 회차 하나 (event_schedules 테이블의 한 행).
// 회차가 없으면(빈 배열) 기간형이다 — 기간 안에서 날짜를 고르고 정원이 없다.
// 정원(capacity)은 회차에만 있으므로, 회차가 없으면 자연히 무제한이 된다.
export type EventSchedule = {
  id: string;
  startsAt: Date;
  capacity: number; // 이 회차의 좌석 수
  soldCount: number; // 지금까지 팔린 매수 (서버가 트리거로 유지한다)
  remaining: number; // 남은 좌석 = capacity - soldCount (0 미만으로는 안 내려간다)
};

// docs/data-structure.md의 events 테이블 칸 그대로.
export type EventItem = {
  id: string;
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date; // 시작일. 카탈로그 정렬 기준이고, 기간형에서는 고를 수 있는 첫 날이기도 하다
  // 기간형으로 팔 때 쓰는 종료일. 회차가 하나라도 있으면 회차형이라 이 값은 예매에 쓰이지 않는다
  showEndAt: Date | null;
  posterUrl: string | null;
  description: string | null;
  // 회차 목록, 이른 순. **이 배열이 비어 있지 않으면 회차형이다**(isSessionBased).
  // 종료일이 있는 전시라도 회차를 만들면 회차형이 된다 — 시간지정 입장 전시가 그 경우다.
  schedules: EventSchedule[];
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
  event_schedules?: { id: string; starts_at: string; capacity: number; sold_count: number }[] | null;
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
      .map((s) => ({
        id: s.id,
        startsAt: new Date(s.starts_at),
        capacity: s.capacity,
        soldCount: s.sold_count,
        // 음수가 나올 일은 없지만, 화면에서 "-2석"이 보이는 일이 없도록 0에서 막는다
        remaining: Math.max(0, s.capacity - s.sold_count),
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  };
}

// 예매 카탈로그 전체를 불러온다. RLS가 누구나 조회 가능하게 열어둬서 로그인 전에도 호출할 수 있다.
// 회차(event_schedules)도 한 번에 같이 받아온다 — 목록에서 "예매 가능한가"를 판단하려면
// 미래 회차가 남았는지 봐야 하고, 결제 화면의 회차 선택도 이 값을 그대로 쓴다.
export async function fetchEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*, event_schedules(id, starts_at, capacity, sold_count)')
    // 관리자가 내린 공연은 카탈로그에서 뺀다.
    // 공연은 삭제할 수 없어서(예매가 달려 있으면 DB가 거부한다) "내리기"를 이 칸으로 한다.
    // 이미 예매한 사람의 보딩패스·스탬프는 bookings에 조인된 event를 쓰므로 그대로 보인다 —
    // 그쪽은 이 조회를 거치지 않는다.
    .eq('is_hidden', false)
    .order('show_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(mapEventRow);
}

// 아직 안 지난 회차만. 전시는 회차가 없어서 항상 빈 배열이다.
// 매진된 회차도 포함한다 — 결제 화면에서 "이런 회차가 있지만 매진"이라고 보여줘야 하기 때문.
export function upcomingSchedules(event: EventItem, now: Date = new Date()): EventSchedule[] {
  return event.schedules.filter((s) => s.startsAt.getTime() > now.getTime());
}

// 실제로 지금 살 수 있는 회차 (안 지났고 자리도 남은 것)
export function bookableSchedules(event: EventItem, now: Date = new Date()): EventSchedule[] {
  return upcomingSchedules(event, now).filter((s) => s.remaining > 0);
}

// 이 이벤트를 무엇으로 파는가 — 회차를 골라 사는가, 기간 안의 날짜를 골라 사는가.
//
// **회차가 있으면 회차형이다.** 종료일이나 장르가 아니라 회차 유무가 정한다
// (20260807103000_schedules_decide_type.sql — create_booking도 같은 순서로 가른다).
//
// 이 순서라서 시간지정 입장 전시(30분 단위로 인원을 끊어 받는 전시)를 표현할 수 있다.
// 종료일이 있는 전시에 회차를 만들면 회차형이 되고, 회차를 다 지우면 다시 기간형으로 돌아간다.
// 관리자가 회차를 만드는 행위 자체가 파는 방식을 정한다.
export function isSessionBased(event: EventItem): boolean {
  return event.schedules.length > 0;
}

// 기간 안에서 날짜만 고르는 방식인가. 회차가 없고 종료일이 있을 때만 그렇다.
// (회차도 종료일도 없으면 둘 다 아니다 = 아직 팔 수 없는 상태)
export function isPeriodBased(event: EventItem): boolean {
  return !isSessionBased(event) && !!event.showEndAt;
}

// 공연 카드/상세에 보여줄 일정 문자열. 둘 다 "언제부터 언제까지"로 읽히게 맞춘다.
// - 회차형(회차 여러 개): "2026.08.14 ~ 2026.08.20" (첫 회차 ~ 마지막 회차)
// - 회차형(회차 하나): "2026.08.14 19:30"
// - 기간형: "2026.08.02 ~ 2026.09.30" (전시 기간)
//
// 회차를 먼저 본다. 회차가 있는 전시라면 실제로 관람하는 날은 회차 쪽이라, 기간을 보여주면
// 예매 화면에서 고를 수 있는 날짜와 카드에 적힌 기간이 어긋난다.
export function formatEventSchedule(event: EventItem): string {
  if (isSessionBased(event)) {
    if (event.schedules.length > 1) {
      const last = event.schedules[event.schedules.length - 1];
      return `${formatDate(event.schedules[0].startsAt)} ~ ${formatDate(last.startsAt)}`;
    }
    return formatDateTime(event.schedules[0].startsAt);
  }
  if (event.showEndAt) {
    return `${formatDate(event.showAt)} ~ ${formatDate(event.showEndAt)}`;
  }
  return formatDateTime(event.showAt);
}

// 지금 이 이벤트를 예매할 수 있는가.
// - 회차형: 안 지났고 자리도 남은 회차가 하나라도 있으면 가능.
//   (첫 회차가 지났거나 매진이어도 뒤 회차가 남았으면 계속 예매할 수 있다)
// - 기간형: 정원이 없으므로, 종료일이 아직 안 지났으면(오늘 포함) 가능.
// - 둘 다 아니면(회차도 종료일도 없음): 팔 방법이 정해지지 않아 예매할 수 없다.
//
// 판단 순서는 create_booking과 같다. 화면이 "예매 가능"이라고 했는데 서버가 거절하면
// 누른 사람은 앱이 고장 난 줄 알게 되므로, 두 곳이 같은 순서로 갈라야 한다.
export function isBookable(event: EventItem, now: Date = new Date()): boolean {
  if (isSessionBased(event)) {
    return bookableSchedules(event, now).length > 0;
  }
  if (event.showEndAt) {
    return startOfToday(event.showEndAt).getTime() >= startOfToday(now).getTime();
  }
  return false;
}
