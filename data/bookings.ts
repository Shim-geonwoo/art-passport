// "내가 예매한 것" — 실제 Supabase bookings 테이블 기반 파생 로직
//
// docs/data-structure.md/data-flow.md의 확정 규칙을 그대로 코드로 옮긴다:
// 상태(예매완료/관람완료/취소)는 저장하지 않고 is_cancelled + watched_at으로 매번 계산하고,
// 스탬프도 별도 테이블 없이 관람완료 bookings를 watched_at 순 정렬한 것으로 파생한다.

import { EventItem, EventRow, mapEventRow } from '@/data/events';
import { startOfDay } from '@/data/schedule';
import { supabase } from '@/lib/supabase';

export const COUPON_DISCOUNT_RATE = 10;

export type BookingStatus = '예매완료' | '관람완료' | '취소';

// Supabase bookings 조회 시 event를 조인해서 함께 받아온 생 row.
export type BookingRow = {
  id: string;
  event_id: string;
  watched_at: string;
  is_cancelled: boolean;
  quantity: number;
  used_coupon_id: string | null;
  original_price: number;
  total_price: number;
  created_at: string;
  event: EventRow;
};

// 관람일이 며칠 안 남았을 때를 "임박"으로 볼 것인가 (오늘 포함 3일 이내).
export const SOON_THRESHOLD_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DerivedBooking = {
  id: string;
  event: EventItem;
  showAt: Date; // 관람 시각 (= watched_at)
  bookedAt: Date; // 예매한 시각 (= created_at). 영수증처럼 "언제 샀는지"를 보여줄 때 쓴다
  status: BookingStatus;
  isBoardingPass: boolean; // 월렛(보딩패스)에 올라가는가 = 아직 관람 전인가
  isSoon: boolean; // 관람이 임박했는가 (오늘 포함 3일 이내). 강조 표시용
  daysUntilShow: number; // 관람일까지 며칠 남았나 (달력 기준, 오늘이면 0). 이미 지났으면 음수
  hasStamp: boolean; // 관람완료라서 스탬프가 찍혔는가
  quantity: number;
  discountRate: number; // 적용된 할인율(%). 쿠폰을 안 썼으면 0
  originalPrice: number;
  totalPrice: number;
};

// docs/data-structure.md "상태(status) 계산 규칙"을 그대로 코드로 옮긴다.
function deriveBooking(row: BookingRow, now: Date): DerivedBooking {
  const showAt = new Date(row.watched_at);

  let status: BookingStatus;
  if (row.is_cancelled) {
    status = '취소';
  } else if (now < showAt) {
    status = '예매완료';
  } else {
    status = '관람완료';
  }

  // 보딩패스: 예매가 끝나면 바로 월렛에 올라온다(= 예매완료인 모든 티켓).
  // 예전에는 "관람 3일 전부터"만 보여줬는데, 예매하고 나서 한참 아무 데도 안 보이는 게
  // "예매하면 티켓이 지갑에 들어온다"는 앱 컨셉과 맞지 않아 조건을 없앴다.
  // 관람 시각이 지나면 status가 관람완료로 바뀌면서 자연스럽게 보딩패스에서 빠지고 스탬프가 된다.
  const isBoardingPass = status === '예매완료';
  const hasStamp = status === '관람완료';

  // "며칠 남았나"는 시:분이 아니라 달력 날짜로 센다. 오늘 밤 공연이든 오늘 아침 공연이든
  // 사용자에겐 똑같이 "오늘"이라서다. (오늘=0, 내일=1)
  const daysUntilShow = Math.round(
    (startOfDay(showAt).getTime() - startOfDay(now).getTime()) / MS_PER_DAY
  );

  // 임박: 월렛에 있는 티켓 중에서도 지금 챙겨야 할 것. 카드에 D-day 배지로 강조한다.
  // isBoardingPass("월렛에 있나")와 일부러 나눠 둔다 — 예전엔 이 둘이 한 값이라
  // "석 달 뒤 공연에도 '관람이 임박했어요'가 뜨는" 식으로 어긋났다.
  const isSoon = isBoardingPass && daysUntilShow >= 0 && daysUntilShow <= SOON_THRESHOLD_DAYS;

  return {
    id: row.id,
    event: mapEventRow(row.event),
    showAt,
    bookedAt: new Date(row.created_at),
    status,
    isBoardingPass,
    isSoon,
    daysUntilShow,
    hasStamp,
    quantity: row.quantity,
    discountRate: row.used_coupon_id ? COUPON_DISCOUNT_RATE : 0,
    originalPrice: row.original_price,
    totalPrice: row.total_price,
  };
}

// 내 예매 전체를 event와 함께 불러온다. RLS가 본인 것만 돌려준다.
export async function fetchBookings(): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, event_id, watched_at, is_cancelled, quantity, used_coupon_id, original_price, total_price, created_at, event:events(*)'
    )
    .order('watched_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as BookingRow[];
}

export function deriveAllBookings(rows: BookingRow[], now: Date = new Date()): DerivedBooking[] {
  return rows.map((row) => deriveBooking(row, now));
}

// 보딩패스(월렛)용: 아직 관람 전인 티켓만, 관람일 가까운 순으로
// (가장 가까운 것이 맨 앞에 오므로, 스택 맨 앞이 곧 "다음에 갈 것"이 된다)
export function deriveBoardingPasses(rows: BookingRow[], now: Date = new Date()): DerivedBooking[] {
  return deriveAllBookings(rows, now)
    .filter((b) => b.isBoardingPass)
    .sort((a, b) => a.showAt.getTime() - b.showAt.getTime());
}

// ── 파생 계산: 스탬프 (여권) ──────────────────────────────

export const STAMPS_PER_PAGE = 9;

export type Stamp = {
  id: string;
  booking: DerivedBooking;
  order: number; // 몇 번째 스탬프인지 (1부터)
  page: number; // 몇 페이지째인지 (1부터)
  slotIndex: number; // 그 페이지 안에서의 칸 위치 (0~8)
};

export function deriveStamps(rows: BookingRow[], now: Date = new Date()): Stamp[] {
  return deriveAllBookings(rows, now)
    .filter((b) => b.hasStamp)
    .sort((a, b) => a.showAt.getTime() - b.showAt.getTime())
    .map((booking, index) => ({
      id: `stamp-${booking.id}`,
      booking,
      order: index + 1,
      page: Math.floor(index / STAMPS_PER_PAGE) + 1,
      slotIndex: index % STAMPS_PER_PAGE,
    }));
}

export function passportPageInfo(rows: BookingRow[], now: Date = new Date()) {
  const total = deriveStamps(rows, now).length;
  return {
    totalStamps: total,
    totalPages: Math.max(1, Math.ceil(total / STAMPS_PER_PAGE)),
    slotsUntilNextCoupon: total % STAMPS_PER_PAGE === 0 ? 0 : STAMPS_PER_PAGE - (total % STAMPS_PER_PAGE),
  };
}

// 예매 생성(DB 함수). 클라이언트는 "무엇을·몇 매·어떤 쿠폰으로·언제"만 말하고,
// 관람 시각·할인율·금액은 서버가 events/event_schedules/coupons를 직접 읽어 계산한다.
// 쿠폰 '사용완료' 표시도 같은 트랜잭션 안에서 함께 일어나므로, "할인만 받고 쿠폰은 남는" 어긋난
// 상태가 생기지 않는다. 회차/날짜가 정말 그 공연 것인지, 이미 지난 일정은 아닌지도 서버가 확인한다.
//
// "언제"를 말하는 방법이 종류에 따라 다르다:
//  - 공연(회차형): scheduleId — 고른 회차의 id
//  - 전시(기간형): visitDate — 고른 관람 날짜 'YYYY-MM-DD' (관람 시각은 서버가 그날 18시로 정한다)
export async function createBooking(params: {
  eventId: string;
  quantity: number;
  couponId: string | null;
  scheduleId?: string | null;
  visitDate?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_event_id: params.eventId,
    p_quantity: params.quantity,
    p_coupon_id: params.couponId,
    p_schedule_id: params.scheduleId ?? null,
    p_visit_date: params.visitDate ?? null,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

// 예매 취소(DB 함수): is_cancelled를 켜고, 그 예매가 쿠폰을 썼으면 쿠폰도 다시 '사용가능'으로 되돌린다.
// 관람 전(watched_at 미래)만 취소되며, 검증·쿠폰 반환은 서버 함수가 원자적으로 처리한다.
// (관람완료(스탬프 찍힌 것)는 화면에서 버튼 자체를 안 보여주고, 함수도 조건이 안 맞아 아무 것도 안 바꾼다)
export async function cancelBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) {
    throw error;
  }
}
