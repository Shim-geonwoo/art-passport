// "내가 예매한 것" 더미 데이터 (bookings) + 상태 파생 로직
//
// 이 파일이 앱의 심장이다. 마이페이지·보딩패스·여권·쿠폰은 전부 여기서 나온다.
// 설계 근거: docs/data-flow.md (특히 2장 상태 계산 규칙, 6장 데모 세트).
//
// 핵심 원칙 두 가지:
//  1) 상태(예매완료/관람완료)는 저장하지 않고 "관람 시각이 지났는지"로 매번 계산한다.
//     저장하는 건 취소 여부(isCancelled) 하나뿐. (백엔드 크론 없이도 연쇄가 작동)
//  2) 스탬프·쿠폰도 저장하지 않고 "관람완료된 예매"에서 파생 계산한다.
//
// 아래 derive* 함수들은 "예매 목록(bookings)"을 인자로 받는다.
// 앱이 실제로 넘겨주는 목록은 contexts/bookings.tsx가 들고 있는 상태다.
// (그래야 새로 예매한 건이 보딩패스·여권·쿠폰까지 그대로 이어진다)
// DUMMY_BOOKINGS는 그 상태의 "처음 값"으로만 쓰인다.

import { DUMMY_EVENTS, EventItem } from '@/data/dummy-events';
import { MS_PER_DAY, offsetToDate, startOfToday } from '@/data/schedule';

// ── 원천 데이터 타입 ──────────────────────────────────────

// 예매 하나 (docs/data-structure.md의 bookings 테이블 축소판)
export type BookingItem = {
  id: string;
  eventId: string; // 어떤 공연을 예매했는지 (DUMMY_EVENTS의 id)
  offsetDays: number; // 내가 예매한 실제 관람일 (오늘 기준 상대일). event의 카탈로그 날짜와 별개다
  isCancelled: boolean; // 취소 여부. 유일하게 "저장하는" 상태
  quantity?: number; // 인원(자유석 매수). 결제 화면에서 정한다. 없으면 1로 본다(옛 데모 데이터 호환)
};

export type BookingStatus = '예매완료' | '관람완료' | '취소';

// ── 데모용 예매 18건 (docs/data-flow.md 6장) ─────────────
// 관람완료 10 + 보딩패스 3 + 예정 3 + 취소 2 → 모든 상태가 화면에 보이도록 구성
export const DUMMY_BOOKINGS: BookingItem[] = [
  // 6-1. 관람완료 → 스탬프 (오래된 순). 9번째에서 쿠폰 1장 발급, 10번째는 2페이지 1칸.
  { id: 'bk-01', eventId: 'ex-03', offsetDays: -60, isCancelled: false }, // 요시고 사진전
  { id: 'bk-02', eventId: 'cd-03', offsetDays: -52, isCancelled: false }, // 서울시향 말러
  { id: 'bk-03', eventId: 'co-05', offsetDays: -45, isCancelled: false }, // 검정치마 라이브
  { id: 'bk-04', eventId: 'th-03', offsetDays: -40, isCancelled: false }, // 고도를 기다리며
  { id: 'bk-05', eventId: 'mu-04', offsetDays: -33, isCancelled: false }, // 지킬 앤 하이드
  { id: 'bk-06', eventId: 'ex-05', offsetDays: -26, isCancelled: false }, // 데이비드 호크니
  { id: 'bk-07', eventId: 'cd-04', offsetDays: -20, isCancelled: false }, // 조성진 리사이틀
  { id: 'bk-08', eventId: 'co-08', offsetDays: -14, isCancelled: false }, // 십센치 콘서트
  { id: 'bk-09', eventId: 'th-09', offsetDays: -7, isCancelled: false }, // 인간 실격 (9번째 → 쿠폰)
  { id: 'bk-10', eventId: 'mu-03', offsetDays: -3, isCancelled: false }, // 오페라의 유령 (2페이지 1칸)

  // 6-2. 보딩패스 (관람 3일 이내). 카테고리 색이 서로 달라 스택 구분이 보인다.
  { id: 'bk-11', eventId: 'cd-01', offsetDays: 1, isCancelled: false, quantity: 2 }, // 백조의 호수 (2인)
  { id: 'bk-12', eventId: 'co-03', offsetDays: 2, isCancelled: false, quantity: 2 }, // 아이유 콘서트 (2인)
  { id: 'bk-13', eventId: 'th-01', offsetDays: 3, isCancelled: false }, // 햄릿

  // 6-3. 예매완료(예정) — 아직 보딩패스엔 안 뜸 (관람일 3일보다 더 남음)
  { id: 'bk-14', eventId: 'mu-01', offsetDays: 12, isCancelled: false }, // 레베카
  { id: 'bk-15', eventId: 'ex-04', offsetDays: 20, isCancelled: false }, // 반 고흐: 별이 빛나는 밤
  { id: 'bk-16', eventId: 'mu-05', offsetDays: 30, isCancelled: false }, // 위키드

  // 6-4. 취소 (관람 전에 취소함 → 스탬프 안 생김)
  { id: 'bk-17', eventId: 'co-09', offsetDays: 8, isCancelled: true }, // 자우림 25주년
  { id: 'bk-18', eventId: 'cd-05', offsetDays: 6, isCancelled: true }, // 지젤
];

// ── 새 예매 만들기 ────────────────────────────────────────

// 예매 탭에서 "예매하기"를 눌렀을 때, 그 예매의 실제 관람일(offsetDays)을 정한다.
//
// - 회차형(공연): 공연 날짜가 하루뿐이므로 event.offsetDays를 그대로 쓴다.
// - 기간형(전시): 기간 중 아무 날이나 갈 수 있다. 이미 시작한 전시라도 오늘 예매하면
//   관람은 앞으로 하는 것이므로 "내일"로 잡는다. 단 종료일을 넘기면 종료일로 맞춘다.
//   (아직 날짜 선택 화면이 없어서 정한 임시 규칙 — 좌석/회차 선택이 생기면 그걸로 대체된다)
export function bookingOffsetDaysFor(event: EventItem): number {
  if (event.offsetEndDays == null) {
    return event.offsetDays; // 회차형
  }
  return Math.min(Math.max(event.offsetDays, 1), event.offsetEndDays);
}

// 새로 만든 예매에 붙일 id. 기존 id와 겹치지 않게 'bk-new-1'부터 번호를 매긴다.
export function nextBookingId(bookings: BookingItem[]): string {
  const usedNumbers = bookings
    .map((b) => Number(b.id.replace('bk-new-', '')))
    .filter((n) => !Number.isNaN(n));
  const nextNumber = usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1;
  return `bk-new-${nextNumber}`;
}

// ── 파생 계산: 예매 하나의 현재 상태 ─────────────────────

// 원천 booking에 "지금 이 순간의 상태"를 붙인 형태. 화면은 이걸 받아서 그린다.
export type DerivedBooking = BookingItem & {
  event: EventItem; // 공연 상세 (제목·장르·장소·가격 등)
  showAt: Date; // 실제 관람 시각 (booking.offsetDays + event.time)
  status: BookingStatus;
  isBoardingPass: boolean; // 지금 보딩패스로 보여줘야 하는가
  hasStamp: boolean; // 관람완료라서 스탬프가 찍혔는가
  quantity: number; // 인원(항상 1 이상으로 정규화). 결제금액 = event.price * quantity
  totalPrice: number; // 실제 결제금액 (단가 × 인원)
};

// docs/data-flow.md 2장의 규칙을 그대로 코드로 옮긴 함수.
// now를 인자로 받게 해서 테스트나 "시간 여행" 데모도 가능하게 해둔다.
export function deriveBooking(booking: BookingItem, now: Date = new Date()): DerivedBooking {
  const event = DUMMY_EVENTS.find((e) => e.id === booking.eventId);
  if (!event) {
    // 더미 데이터 정합성 오류 — eventId 오타 등. 조용히 넘기지 않고 바로 알린다.
    throw new Error(`booking ${booking.id}이 없는 event(${booking.eventId})를 가리킵니다.`);
  }

  const showAt = offsetToDate(booking.offsetDays, event.time, now);

  // 상태 계산 (순서 중요: 취소가 시간보다 우선)
  let status: BookingStatus;
  if (booking.isCancelled) {
    status = '취소';
  } else if (now < showAt) {
    status = '예매완료';
  } else {
    status = '관람완료';
  }

  // 보딩패스: 예매완료 그리고 관람일이 "오늘 포함 3일 이내"(달력 기준)로 임박.
  // 시:분이 아니라 날짜(자정 기준)로 세어서, 아침이든 저녁이든 하루 종일 안정적으로 뜨게 한다.
  // (예: 3일 뒤 저녁 공연도 오늘 아침부터 보딩패스로 보인다)
  const daysUntilShow = Math.round(
    (startOfToday(showAt).getTime() - startOfToday(now).getTime()) / MS_PER_DAY
  );
  const isBoardingPass = status === '예매완료' && now < showAt && daysUntilShow <= 3;

  // 스탬프: 관람완료면 곧 스탬프 (취소는 관람완료가 될 수 없으므로 자동 제외)
  const hasStamp = status === '관람완료';

  // 인원은 항상 1 이상으로 정규화하고, 그걸로 결제금액을 계산한다
  const quantity = booking.quantity && booking.quantity > 0 ? booking.quantity : 1;
  const totalPrice = event.price * quantity;

  return { ...booking, event, showAt, status, isBoardingPass, hasStamp, quantity, totalPrice };
}

// 모든 예매를 파생 계산해서 반환
export function deriveAllBookings(
  bookings: BookingItem[],
  now: Date = new Date()
): DerivedBooking[] {
  return bookings.map((b) => deriveBooking(b, now));
}

// 마이페이지 "예매 내역" 탭용: 상태별로 묶어서 반환
export function groupBookingsByStatus(bookings: BookingItem[], now: Date = new Date()) {
  const all = deriveAllBookings(bookings, now);
  return {
    예매완료: all.filter((b) => b.status === '예매완료'),
    관람완료: all.filter((b) => b.status === '관람완료'),
    취소: all.filter((b) => b.status === '취소'),
  };
}

// 보딩패스(월렛)용: 지금 임박한 티켓만, 관람일 가까운 순으로
export function deriveBoardingPasses(
  bookings: BookingItem[],
  now: Date = new Date()
): DerivedBooking[] {
  return deriveAllBookings(bookings, now)
    .filter((b) => b.isBoardingPass)
    .sort((a, b) => a.showAt.getTime() - b.showAt.getTime());
}

// ── 파생 계산: 스탬프 (여권) ──────────────────────────────

// 여권 한 페이지에 들어가는 스탬프 칸 수 (docs/data-structure.md)
export const STAMPS_PER_PAGE = 9;

// 스탬프 1개 = 관람완료된 예매 1건. 여권 그리드가 이걸 그린다.
export type Stamp = {
  id: string;
  booking: DerivedBooking; // 어떤 관람에서 나온 스탬프인지 (포스터=event, 관람일=showAt)
  order: number; // 몇 번째 스탬프인지 (1부터). 쿠폰 발급 판정에 쓰인다
  page: number; // 몇 페이지째인지 (1부터)
  slotIndex: number; // 그 페이지 안에서의 칸 위치 (0~8)
};

// 관람완료된 예매를 오래된 순으로 정렬해 스탬프로 만든다.
export function deriveStamps(bookings: BookingItem[], now: Date = new Date()): Stamp[] {
  return deriveAllBookings(bookings, now)
    .filter((b) => b.hasStamp)
    .sort((a, b) => a.showAt.getTime() - b.showAt.getTime()) // 오래된 관람이 먼저 찍힘
    .map((booking, index) => ({
      id: `stamp-${booking.id}`,
      booking,
      order: index + 1,
      page: Math.floor(index / STAMPS_PER_PAGE) + 1,
      slotIndex: index % STAMPS_PER_PAGE,
    }));
}

// 여권 페이지 계산 (docs/data-structure.md "여권 페이지 계산")
export function passportPageInfo(bookings: BookingItem[], now: Date = new Date()) {
  const total = deriveStamps(bookings, now).length;
  return {
    totalStamps: total,
    totalPages: Math.max(1, Math.ceil(total / STAMPS_PER_PAGE)),
    // 다음 쿠폰까지 남은 칸 수 (딱 9의 배수면 0)
    slotsUntilNextCoupon: total % STAMPS_PER_PAGE === 0 ? 0 : STAMPS_PER_PAGE - (total % STAMPS_PER_PAGE),
  };
}

// ── 파생 계산: 쿠폰 ───────────────────────────────────────

export type CouponStatus = '사용가능' | '사용완료' | '만료';

export type Coupon = {
  id: string;
  benefit: string; // 혜택 문구
  discountRate: number; // 할인율(%)
  status: CouponStatus;
  issuedAtStampOrder?: number; // 몇 번째 스탬프에서 발급됐는지 (9, 18, ...). 데모 수동 쿠폰은 없음
};

// 데모 다양성용 수동 쿠폰: 예전에 이미 써버린 쿠폰 1장 (docs/data-flow.md 6-5의 선택 항목)
const DEMO_USED_COUPONS: Coupon[] = [
  { id: 'coupon-used-1', benefit: '다음 예매 10% 할인', discountRate: 10, status: '사용완료' },
];

// 스탬프 9개를 채울 때마다 '사용가능' 쿠폰 1장을 발급 (docs/data-flow.md 2장)
export function deriveCoupons(bookings: BookingItem[], now: Date = new Date()): Coupon[] {
  const stampCount = deriveStamps(bookings, now).length;
  const issuedCount = Math.floor(stampCount / STAMPS_PER_PAGE);

  const autoIssued: Coupon[] = Array.from({ length: issuedCount }, (_, i) => ({
    id: `coupon-auto-${i + 1}`,
    benefit: '다음 예매 10% 할인',
    discountRate: 10,
    status: '사용가능' as CouponStatus,
    issuedAtStampOrder: (i + 1) * STAMPS_PER_PAGE,
  }));

  return [...autoIssued, ...DEMO_USED_COUPONS];
}
