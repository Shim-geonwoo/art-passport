// "내가 예매한 것" — 실제 Supabase bookings 테이블 기반 파생 로직
//
// docs/data-structure.md/data-flow.md의 확정 규칙을 그대로 코드로 옮긴다:
// 상태(예매완료/관람완료/취소)는 저장하지 않고 is_cancelled + watched_at으로 매번 계산하고,
// 스탬프도 별도 테이블 없이 관람완료 bookings를 watched_at 순 정렬한 것으로 파생한다.

import { EventItem, EventRow, mapEventRow } from '@/data/events';
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

export type DerivedBooking = {
  id: string;
  event: EventItem;
  showAt: Date; // = watched_at
  status: BookingStatus;
  isBoardingPass: boolean; // 지금 보딩패스로 보여줘야 하는가
  hasStamp: boolean; // 관람완료라서 스탬프가 찍혔는가
  quantity: number;
  discountRate: number; // 적용된 할인율(%). 쿠폰을 안 썼으면 0
  originalPrice: number;
  totalPrice: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

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

  // 보딩패스: 예매완료 그리고 관람일이 "오늘 포함 3일 이내"(달력 기준)로 임박.
  const daysUntilShow = Math.round(
    (startOfDay(showAt).getTime() - startOfDay(now).getTime()) / MS_PER_DAY
  );
  const isBoardingPass = status === '예매완료' && now < showAt && daysUntilShow <= 3;
  const hasStamp = status === '관람완료';

  return {
    id: row.id,
    event: mapEventRow(row.event),
    showAt,
    status,
    isBoardingPass,
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

// 보딩패스(월렛)용: 지금 임박한 티켓만, 관람일 가까운 순으로
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

// 예매 취소(DB 함수): is_cancelled를 켜고, 그 예매가 쿠폰을 썼으면 쿠폰도 다시 '사용가능'으로 되돌린다.
// 관람 전(watched_at 미래)만 취소되며, 검증·쿠폰 반환은 서버 함수가 원자적으로 처리한다.
// (관람완료(스탬프 찍힌 것)는 화면에서 버튼 자체를 안 보여주고, 함수도 조건이 안 맞아 아무 것도 안 바꾼다)
export async function cancelBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) {
    throw error;
  }
}
