// "내가 예매한 것" — 실제 Supabase bookings 테이블 기반 파생 로직
//
// docs/data-structure.md/data-flow.md의 확정 규칙을 그대로 코드로 옮긴다:
// 상태(예매완료/관람완료/취소)는 저장하지 않고 is_cancelled + watched_at으로 매번 계산하고,
// 스탬프도 별도 테이블 없이 관람완료 bookings를 watched_at 순 정렬한 것으로 파생한다.

import { EventItem, EventRow, mapEventRow } from '@/data/events';
import { startOfDay } from '@/data/schedule';
import { supabase } from '@/lib/supabase';

export const COUPON_DISCOUNT_RATE = 10;

// 만료: 기간형(오픈 데이트) 티켓을 기한 안에 안 쓰고 흘려보낸 상태.
// 실제 티켓과 같다 — 안 갔으면 스탬프도 쿠폰도 없다.
export type BookingStatus = '예매완료' | '관람완료' | '취소' | '만료';

// Supabase bookings 조회 시 event를 조인해서 함께 받아온 생 row.
export type BookingRow = {
  id: string;
  event_id: string;
  // 실제로 관람한 시각. **아직 안 갔으면 null이다.**
  //   회차형: 예매할 때 회차 시각으로 채워진다 (회차 날짜가 지나면 관람한 것으로 본다)
  //   기간형: 예매할 때는 비어 있고, 전시장에서 티켓을 쓸 때 채워진다
  watched_at: string | null;
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
  // 이 티켓이 향하는 시각. 정렬·D-day·"언제 가는 표인가" 표시에 쓴다.
  //   회차형: 회차 시각 (= 관람 시각)
  //   기간형 사용함: 실제 관람한 시각
  //   기간형 미사용: 기한 (= 전시 종료일). 아직 안 갔으니 "언제까지 가야 하는가"가 곧 기준이다
  showAt: Date;
  // 실제로 관람한 시각. 아직 안 갔으면 null (기간형 미사용).
  // showAt과 나눠 두는 이유: 기간형 미사용은 showAt에 기한이 들어가 있어서, 그것만으로는
  // "갔는가"를 알 수 없다. 스탬프가 찍히는 기준은 이쪽이다.
  watchedAt: Date | null;
  bookedAt: Date; // 예매한 시각 (= created_at). 영수증처럼 "언제 샀는지"를 보여줄 때 쓴다
  status: BookingStatus;
  isBoardingPass: boolean; // 월렛(보딩패스)에 올라가는가 = 아직 관람일이 안 지났는가
  isSoon: boolean; // 관람이 임박했는가 (오늘 포함 3일 이내). 강조 표시용
  daysUntilShow: number; // 관람일까지 며칠 남았나 (달력 기준, 오늘이면 0). 이미 지났으면 음수
  hasStamp: boolean; // 관람완료라서 스탬프가 찍혔는가
  canCancel: boolean; // 지금 취소할 수 있는가. status와 별개다 — 아래 참고
  canUseTicket: boolean; // 지금 "관람했어요"를 누를 수 있는가 (기간형 미사용 + 전시가 시작됨)
  quantity: number;
  discountRate: number; // 적용된 할인율(%). 쿠폰을 안 썼으면 0
  originalPrice: number;
  totalPrice: number;
};

// 스탬프가 찍히는 시각 = 관람일 "다음 날" 00:00.
// 관람일이 7/29면 7/30이 되는 순간 스탬프가 된다.
//
// 왜 공연이 끝나는 시각이 아니라 날짜가 바뀌는 시각인가:
// 공연이 몇 시에 끝나는지를 우리는 모른다(저장하는 건 시작 시각뿐이다). 19:30 공연이
// 21:00에 끝날지 23:00에 끝날지 알 수 없는데, 시작 시각을 기준으로 삼으면 아직 공연을
// 보고 있는 중에 티켓이 지갑에서 사라지고 스탬프가 찍힌다. "그날이 지나면"으로 잡으면
// 그런 일이 없고, 사용자에게도 "어제 본 공연"이라는 감각과 맞는다.
function stampTimeFor(showAt: Date): Date {
  const next = startOfDay(showAt);
  next.setDate(next.getDate() + 1);
  return next;
}

// docs/data-structure.md "상태(status) 계산 규칙"을 그대로 코드로 옮긴다.
function deriveBooking(row: BookingRow, now: Date): DerivedBooking {
  const event = mapEventRow(row.event);
  const watchedAt = row.watched_at ? new Date(row.watched_at) : null;

  // 기간형 미사용 티켓의 기한 = 전시 종료일. 회차형이면 이 값이 안 쓰인다.
  const deadline = event.showEndAt;

  // 정렬·표시의 기준 시각. 안 갔으면 기한이 그 자리를 대신한다
  // (급한 순으로 정렬할 때 "언제까지 가야 하는가"가 곧 급한 정도라 자연스럽게 이어진다).
  // 기간형인데 기한도 없는 경우는 create_booking이 애초에 못 팔게 막지만, 옛 데이터가 섞일 수
  // 있어 예매한 시각으로 물러선다.
  const showAt = watchedAt ?? deadline ?? new Date(row.created_at);

  let status: BookingStatus;
  if (row.is_cancelled) {
    status = '취소';
  } else if (watchedAt) {
    // 갔다. 관람일 다음 날이 되면 스탬프가 된다.
    status = now < stampTimeFor(watchedAt) ? '예매완료' : '관람완료';
  } else {
    // 아직 안 갔다(기간형 미사용). 기한 마지막 날까지는 아직 쓸 수 있고, 그 날이 지나면 만료다.
    // 안 갔는데 스탬프를 찍지 않는다 — 여권은 실제로 다녀온 기록이어야 한다.
    status = now < stampTimeFor(showAt) ? '예매완료' : '만료';
  }

  // 보딩패스: 예매가 끝나면 바로 월렛에 올라온다(= 예매완료인 모든 티켓).
  // 예전에는 "관람 3일 전부터"만 보여줬는데, 예매하고 나서 한참 아무 데도 안 보이는 게
  // "예매하면 티켓이 지갑에 들어온다"는 앱 컨셉과 맞지 않아 조건을 없앴다.
  // 관람일이 지나면 status가 관람완료로 바뀌면서 자연스럽게 보딩패스에서 빠지고 스탬프가 된다.
  // (공연이 끝난 당일 밤에는 아직 지갑에 남아 있다 — 위 stampTimeFor 참고)
  const isBoardingPass = status === '예매완료';
  const hasStamp = status === '관람완료';

  // 지금 취소할 수 있는가. 서버 cancel_booking과 같은 조건이어야 한다.
  //
  //   회차형(watchedAt 있음): 공연 시작 전까지. status와 일부러 나눠 둔다 — 스탬프 기준이
  //     "관람일 다음 날"이라, 공연이 시작된 뒤에도 그날 안에는 status가 예매완료로 남는다.
  //     그때 status만 보고 버튼을 띄우면 버튼은 보이는데 서버가 거절한다.
  //   기간형 미사용: 기한이 안 지났으면 취소할 수 있다(= status가 예매완료인 동안).
  //     이미 티켓을 썼으면 watchedAt이 채워져 위 규칙으로 넘어간다 — 다녀온 표는 못 무른다.
  const canCancel =
    status === '예매완료' && (watchedAt ? now < watchedAt : true);

  // "관람했어요"를 누를 수 있는가.
  // 아직 안 쓴 기간형 티켓이고, 전시가 이미 시작됐을 때. 시작 전에도 누를 수 있으면
  // 예매 직후 눌러서 스탬프를 만들어낼 수 있다(서버 mark_ticket_used도 같은 걸 막는다).
  const canUseTicket =
    !watchedAt &&
    status === '예매완료' &&
    startOfDay(event.showAt).getTime() <= startOfDay(now).getTime();

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
    event,
    showAt,
    watchedAt,
    bookedAt: new Date(row.created_at),
    status,
    isBoardingPass,
    isSoon,
    daysUntilShow,
    hasStamp,
    canCancel,
    canUseTicket,
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
//  - 회차형: scheduleId — 고른 회차의 id
//  - 기간형: 아무것도 안 보낸다. 오픈 데이트라 날짜를 고르지 않고, 서버가 기간 마지막 날 18시를
//    관람 시각으로 둔다. 다녀왔다면 markBookingWatched로 그 시점을 앞당긴다.
export async function createBooking(params: {
  eventId: string;
  quantity: number;
  couponId: string | null;
  scheduleId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_event_id: params.eventId,
    p_quantity: params.quantity,
    p_coupon_id: params.couponId,
    p_schedule_id: params.scheduleId ?? null,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

// "관람했어요"(DB 함수): 전시장에서 오픈 데이트 티켓을 쓴다. 관람 시각을 지금으로 채운다.
//
// **안 쓰면 관람 기록이 남지 않는다.** 기한이 지나면 그냥 만료다 — 실제 티켓과 같고,
// 가지도 않은 전시가 여권에 찍히지 않게 하려는 것이다.
// 쓴다고 스탬프가 즉시 찍히지는 않는다 — 스탬프는 관람일 다음 날 00:00에 찍힌다(stampTimeFor).
//
// 시각은 클라이언트가 보내지 않는다. 보낼 수 있으면 과거 시각을 적어 스탬프를 즉시 만들어낼 수
// 있고, 스탬프 9개 = 쿠폰 1장이라 그건 곧 할인 발급 권한이 된다.
export async function markTicketUsed(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_ticket_used', { p_booking_id: bookingId });
  if (error) {
    throw error;
  }
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
