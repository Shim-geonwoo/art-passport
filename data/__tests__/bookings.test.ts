// 파생 로직 테스트 — 예매 상태 / 보딩패스 / 스탬프
//
// 이 프로젝트는 상태를 저장하지 않고 "지금 시각"과 비교해 매번 계산한다(README 설계 노트 1).
// 그래서 확인하려면 "특정 시각에 앱을 켜본 상황"을 재현해야 하는데, 사람이 손으로 하기엔
// 어렵다 — 자정이 지나기를 기다리거나 DB의 관람일시를 직접 옮겨야 한다.
//
// 다행히 파생 함수들은 전부 now를 인자로 받는 순수 함수라, 여기서는 시각을 그냥 넣어보면 된다.
// 아래 테스트가 확인하는 건 결국 하나다: "언제 무엇이 보여야 하는가".

import { deriveAllBookings, deriveBoardingPasses, deriveStamps, passportPageInfo } from '@/data/bookings';
import type { BookingRow } from '@/data/bookings';
import { couponStatus, isCouponUsable } from '@/data/coupons';
import type { Coupon } from '@/data/coupons';

// data/bookings.ts가 Supabase 클라이언트를 가져오는데, 파생 계산에는 쓰이지 않는다.
// (쓰이는 건 fetchBookings/createBooking 쪽이고 여기서는 부르지 않는다)
// 실제 클라이언트를 만들면 환경변수와 기기 저장소가 필요해지므로 빈 껍데기로 바꿔둔다.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// ── 테스트용 예매 한 건 만들기 ────────────────────────────
//
// 날짜 문자열에 시간대(Z, +09:00)를 일부러 안 붙인다. 그러면 실행하는 기기의 로컬 시간으로
// 읽히는데, 파생 로직도 로컬 기준(startOfDay)이라 어느 시간대에서 돌려도 결과가 같다.
function makeBooking(watchedAt: string, overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: `booking-${watchedAt}`,
    event_id: 'event-1',
    watched_at: watchedAt,
    is_cancelled: false,
    quantity: 1,
    used_coupon_id: null,
    original_price: 50000,
    total_price: 50000,
    created_at: '2026-07-01T10:00:00',
    event: {
      id: 'event-1',
      title: '테스트 공연',
      genre: '뮤지컬',
      venue_name: '테스트 극장',
      city: '서울',
      price: 50000,
      show_at: watchedAt,
      show_end_at: null,
      poster_url: null,
      description: null,
    },
    ...overrides,
  };
}

function at(dateTime: string): Date {
  return new Date(dateTime);
}

// ── 스탬프가 찍히는 시점 ──────────────────────────────────
//
// 규칙: 관람일 다음 날 00:00에 스탬프가 된다. 관람일이 7/29면 7/30이 되는 순간이다.
// 관람 "시각"이 아니라 "일자"인 이유는, 공연이 몇 시에 끝나는지를 저장하지 않기 때문이다.
// (docs/data-structure.md "상태(status) 계산 규칙")
describe('스탬프는 관람일이 지나야 찍힌다', () => {
  const 공연 = makeBooking('2026-07-29T19:30:00'); // 7/29 저녁 7시 30분 공연

  it('공연 시작 전 — 지갑에 있고, 취소할 수 있다', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-29T18:00:00'));

    expect(b.status).toBe('예매완료');
    expect(b.isBoardingPass).toBe(true);
    expect(b.hasStamp).toBe(false);
    expect(b.canCancel).toBe(true);
  });

  // 이번 규칙 변경으로 새로 생긴 구간이다.
  // 공연은 이미 시작했지만 그날이 아직 안 끝났다 → 티켓은 지갑에 남아 있고, 취소만 막힌다.
  // (예전 규칙에서는 이 시점에 이미 스탬프였다)
  it('공연이 시작된 뒤 같은 날 밤 — 지갑에 남아 있지만 취소는 안 된다', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-29T22:00:00'));

    expect(b.status).toBe('예매완료');
    expect(b.isBoardingPass).toBe(true);
    expect(b.hasStamp).toBe(false);
    expect(b.canCancel).toBe(false); // 이미 시작한 공연은 취소할 수 없다 (서버도 같은 조건)
  });

  it('관람일 마지막 순간(23:59:59)까지는 아직 스탬프가 아니다', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-29T23:59:59'));

    expect(b.hasStamp).toBe(false);
    expect(b.isBoardingPass).toBe(true);
  });

  it('다음 날 00:00 정각에 스탬프가 된다', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-30T00:00:00'));

    expect(b.status).toBe('관람완료');
    expect(b.hasStamp).toBe(true);
    expect(b.isBoardingPass).toBe(false); // 지갑에서 빠진다
    expect(b.canCancel).toBe(false);
  });

  // 낮 공연이든 밤 공연이든 같은 날이면 스탬프가 찍히는 시점도 같아야 한다.
  it('같은 날 낮 공연도 다음 날 00:00에 찍힌다 (공연 시각과 무관)', () => {
    const 낮공연 = makeBooking('2026-07-29T11:00:00');

    expect(deriveAllBookings([낮공연], at('2026-07-29T23:00:00'))[0].hasStamp).toBe(false);
    expect(deriveAllBookings([낮공연], at('2026-07-30T00:00:00'))[0].hasStamp).toBe(true);
  });

  it('취소한 예매는 관람일이 지나도 스탬프가 되지 않는다', () => {
    const 취소된예매 = makeBooking('2026-07-29T19:30:00', { is_cancelled: true });
    const [b] = deriveAllBookings([취소된예매], at('2026-08-05T12:00:00'));

    expect(b.status).toBe('취소');
    expect(b.hasStamp).toBe(false);
    expect(b.isBoardingPass).toBe(false);
    expect(b.canCancel).toBe(false);
  });
});

// ── D-day 배지 ────────────────────────────────────────────
//
// "며칠 남았나"는 시:분이 아니라 달력 날짜로 센다. 오늘 밤 공연이든 오늘 아침 공연이든
// 사용자에겐 똑같이 "오늘"이기 때문이다.
describe('임박 표시(D-day)는 달력 날짜로 센다', () => {
  const 공연 = makeBooking('2026-07-29T19:30:00');

  it('당일 아침이면 0일 남음 = D-DAY', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-29T08:00:00'));
    expect(b.daysUntilShow).toBe(0);
    expect(b.isSoon).toBe(true);
  });

  it('사흘 전까지는 임박으로 본다', () => {
    expect(deriveAllBookings([공연], at('2026-07-26T09:00:00'))[0].isSoon).toBe(true);
  });

  it('나흘 전은 임박이 아니다', () => {
    const [b] = deriveAllBookings([공연], at('2026-07-25T09:00:00'));
    expect(b.daysUntilShow).toBe(4);
    expect(b.isSoon).toBe(false);
  });
});

// ── 보딩패스(월렛) 목록 ───────────────────────────────────
describe('보딩패스는 관람일 가까운 순으로 쌓인다', () => {
  it('가까운 것이 앞에 오고, 스탬프가 된 예매는 빠진다', () => {
    const rows = [
      makeBooking('2026-08-10T19:00:00', { id: '나중' }),
      makeBooking('2026-08-01T19:00:00', { id: '먼저' }),
      makeBooking('2026-07-20T19:00:00', { id: '이미지남' }), // 스탬프가 됐어야 한다
    ];

    const passes = deriveBoardingPasses(rows, at('2026-07-30T12:00:00'));

    expect(passes.map((p) => p.id)).toEqual(['먼저', '나중']);
  });
});

// ── 여권 스탬프 / 페이지 ──────────────────────────────────
describe('스탬프는 9칸마다 다음 페이지로 넘어간다', () => {
  // 7/1 ~ 7/10 관람 (전부 지난 날짜) → 8/1 기준으로 모두 스탬프
  const rows = Array.from({ length: 10 }, (_, i) =>
    makeBooking(`2026-07-${String(i + 1).padStart(2, '0')}T19:00:00`, { id: `s${i + 1}` })
  );
  const now = at('2026-08-01T12:00:00');

  it('관람일 순서대로 번호가 매겨진다', () => {
    const stamps = deriveStamps(rows, now);
    expect(stamps).toHaveLength(10);
    expect(stamps[0].order).toBe(1);
    expect(stamps[0].booking.id).toBe('s1');
  });

  it('9번째까지 1페이지, 10번째부터 2페이지', () => {
    const stamps = deriveStamps(rows, now);

    expect(stamps[8].page).toBe(1); // 9번째
    expect(stamps[8].slotIndex).toBe(8); // 1페이지의 마지막 칸
    expect(stamps[9].page).toBe(2); // 10번째
    expect(stamps[9].slotIndex).toBe(0); // 2페이지의 첫 칸
  });

  it('9개를 딱 채우면 다음 쿠폰까지 0칸', () => {
    const info = passportPageInfo(rows.slice(0, 9), now);
    expect(info.totalStamps).toBe(9);
    expect(info.totalPages).toBe(1);
    expect(info.slotsUntilNextCoupon).toBe(0);
  });

  it('10개면 2페이지가 되고 다음 쿠폰까지 8칸', () => {
    const info = passportPageInfo(rows, now);
    expect(info.totalStamps).toBe(10);
    expect(info.totalPages).toBe(2);
    expect(info.slotsUntilNextCoupon).toBe(8);
  });

  it('스탬프가 하나도 없어도 여권은 1페이지다', () => {
    const info = passportPageInfo([], now);
    expect(info.totalStamps).toBe(0);
    expect(info.totalPages).toBe(1);
  });
});

// ── 쿠폰 상태 ─────────────────────────────────────────────
//
// 쿠폰도 '만료'를 저장하지 않고 expires_at과 현재 시각을 비교해 계산한다.
// 덕분에 만료 처리 크론이 없다 — 시각이 지나면 그 순간부터 만료로 보인다.
describe('쿠폰 만료는 저장하지 않고 계산한다', () => {
  function makeCoupon(expiresAt: string, isUsed = false): Coupon {
    return {
      id: 'coupon-1',
      benefit: '다음 예매 10% 할인',
      discountRate: 10,
      isUsed,
      expiresAt: new Date(expiresAt),
      issuedAtStampOrder: 9,
    };
  }

  it('유효기간 1초 전이면 아직 쓸 수 있다', () => {
    const c = makeCoupon('2026-08-01T12:00:00');
    expect(couponStatus(c, at('2026-08-01T11:59:59'))).toBe('사용가능');
    expect(isCouponUsable(c, at('2026-08-01T11:59:59'))).toBe(true);
  });

  it('유효기간이 되는 순간 만료된다', () => {
    const c = makeCoupon('2026-08-01T12:00:00');
    expect(couponStatus(c, at('2026-08-01T12:00:00'))).toBe('만료');
    expect(isCouponUsable(c, at('2026-08-01T12:00:00'))).toBe(false);
  });

  // 쓴 사실이 만료보다 먼저다 — 영수증에 남는 건 사용 이력이다.
  it('이미 쓴 쿠폰은 기간이 지나도 사용완료로 남는다', () => {
    const c = makeCoupon('2026-08-01T12:00:00', true);
    expect(couponStatus(c, at('2026-09-01T12:00:00'))).toBe('사용완료');
    expect(isCouponUsable(c, at('2026-09-01T12:00:00'))).toBe(false);
  });
});

// ── 오픈 데이트 티켓 (기간형) ─────────────────────────────
//
// 기간형은 예매할 때 관람일을 고르지 않는다. watched_at이 비어 있다가, 전시장에서 티켓을 쓸 때
// 채워진다. 안 쓰고 기한이 지나면 '만료'다 — 스탬프도 안 찍힌다.
//
// 여기서 확인하는 건 결국 하나다: **안 갔으면 여권에 기록이 남지 않는다.**
// 기간이 끝났다고 자동으로 관람 처리하면 가지도 않은 전시가 스탬프로 찍힌다.
function makeOpenDateBooking(
  showAt: string,
  showEndAt: string,
  watchedAt: string | null = null
): BookingRow {
  return {
    ...makeBooking(showAt),
    id: `open-${showAt}`,
    watched_at: watchedAt,
    event: {
      ...makeBooking(showAt).event,
      genre: '전시',
      show_at: showAt,
      show_end_at: showEndAt,
    },
  };
}

describe('오픈 데이트 티켓 — 써야 관람이 된다', () => {
  const 기간중 = new Date('2026-08-10T12:00:00');
  const 기간후 = new Date('2026-10-05T12:00:00');

  it('안 쓴 티켓은 기간 안이면 예매완료 — 보딩패스에 남는다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];
    const [booking] = deriveAllBookings(rows, 기간중);

    expect(booking.status).toBe('예매완료');
    expect(booking.isBoardingPass).toBe(true);
    expect(booking.watchedAt).toBeNull();
  });

  it('안 쓰고 기한이 지나면 만료 — 스탬프가 안 찍힌다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];
    const [booking] = deriveAllBookings(rows, 기간후);

    expect(booking.status).toBe('만료');
    expect(booking.hasStamp).toBe(false);
    expect(booking.isBoardingPass).toBe(false);
    expect(deriveStamps(rows, 기간후)).toHaveLength(0);
  });

  it('기한 마지막 날에는 아직 쓸 수 있다 — 그날 하루는 유효한 티켓이다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];
    const 마지막날 = new Date('2026-10-01T23:00:00');

    expect(deriveAllBookings(rows, 마지막날)[0].status).toBe('예매완료');
  });

  it('티켓을 쓰면 그 다음 날 스탬프가 찍힌다 — 회차형과 같은 규칙', () => {
    const rows = [
      makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00', '2026-08-10T15:00:00'),
    ];

    // 쓴 당일에는 아직 보딩패스에 남아 있다
    expect(deriveAllBookings(rows, new Date('2026-08-10T20:00:00'))[0].status).toBe('예매완료');
    // 다음 날이 되면 스탬프
    const 다음날 = deriveAllBookings(rows, new Date('2026-08-11T09:00:00'))[0];
    expect(다음날.status).toBe('관람완료');
    expect(다음날.hasStamp).toBe(true);
  });

  it('안 쓴 티켓은 기한이 정렬 기준이 된다 — 급한 순으로 지갑에 쌓인다', () => {
    const 늦게끝남 = makeOpenDateBooking('2026-08-01T19:00:00', '2026-12-01T19:00:00');
    const 곧끝남 = makeOpenDateBooking('2026-08-02T19:00:00', '2026-08-20T19:00:00');
    const passes = deriveBoardingPasses([늦게끝남, 곧끝남], 기간중);

    expect(passes[0].event.showEndAt).toEqual(new Date('2026-08-20T19:00:00'));
  });
});

describe('오픈 데이트 티켓 — 취소와 사용 가능 여부', () => {
  const 기간중 = new Date('2026-08-10T12:00:00');

  it('안 썼고 기한 안이면 취소할 수 있다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];

    expect(deriveAllBookings(rows, 기간중)[0].canCancel).toBe(true);
  });

  it('쓰고 나면 취소할 수 없다 — 다녀온 표는 못 무른다', () => {
    const rows = [
      makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00', '2026-08-10T10:00:00'),
    ];

    expect(deriveAllBookings(rows, 기간중)[0].canCancel).toBe(false);
  });

  it('만료된 티켓은 취소도 사용도 안 된다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];
    const [booking] = deriveAllBookings(rows, new Date('2026-10-05T12:00:00'));

    expect(booking.canCancel).toBe(false);
    expect(booking.canUseTicket).toBe(false);
  });

  it('전시가 시작되기 전에는 못 쓴다 — 안 열린 전시를 봤다고 할 수 없다', () => {
    const rows = [makeOpenDateBooking('2026-09-01T19:00:00', '2026-10-01T19:00:00')];

    expect(deriveAllBookings(rows, 기간중)[0].canUseTicket).toBe(false);
  });

  it('시작한 뒤에는 쓸 수 있다', () => {
    const rows = [makeOpenDateBooking('2026-08-01T19:00:00', '2026-10-01T19:00:00')];

    expect(deriveAllBookings(rows, 기간중)[0].canUseTicket).toBe(true);
  });

  it('회차형은 쓸 대상이 아니다 — 회차 날짜가 지나면 저절로 관람이 된다', () => {
    const rows = [makeBooking('2026-08-20T19:30:00')];

    expect(deriveAllBookings(rows, 기간중)[0].canUseTicket).toBe(false);
  });
});
