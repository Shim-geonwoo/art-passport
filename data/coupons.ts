// 쿠폰 — 실제 Supabase coupons 테이블 기반
//
// 발급(스탬프 9개를 채울 때마다 1장)은 서버 함수 issue_due_coupons()가 한다. 크론 없이,
// 앱이 예매 목록을 새로 받을 때(BookingsProvider.refresh)마다 "받을 게 있으면 받는" 방식이다.
// 사용(예매에 적용) 처리는 여기 없다 — 예매를 만들 때 createBooking(data/bookings.ts) 안에서
// 예매와 한 트랜잭션으로 함께 처리된다.
//
// 유효기간은 발급일 + 90일이다. 이 규칙은 DB의 expires_at 기본값에 들어 있어서,
// 어느 경로로 발급하든(나중에 관리자 모드가 생겨도) 자동으로 붙는다.

import { supabase } from '@/lib/supabase';

export type CouponStatus = '사용가능' | '사용완료' | '만료';

// DB가 저장하는 것은 "썼는가"(isUsed)와 "언제까지인가"(expiresAt) 둘뿐이다.
// '만료'는 저장하지 않고 couponStatus()가 계산한다 — bookings가 is_cancelled 하나만 저장하고
// 예매완료/관람완료를 watched_at으로 계산하는 것과 같은 방식이다.
// 덕분에 "만료 처리 크론"이 필요 없다: 시각이 지나면 그 순간부터 만료로 보인다.
export type Coupon = {
  id: string;
  benefit: string;
  discountRate: number;
  isUsed: boolean;
  expiresAt: Date;
  issuedAtStampOrder: number | null;
};

type CouponRow = {
  id: string;
  benefit: string;
  discount_rate: number;
  status: '사용가능' | '사용완료'; // DB엔 이 둘만 저장된다
  expires_at: string;
  issued_at_stamp_order: number | null;
};

function mapRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    benefit: row.benefit,
    discountRate: row.discount_rate,
    isUsed: row.status === '사용완료',
    expiresAt: new Date(row.expires_at),
    issuedAtStampOrder: row.issued_at_stamp_order,
  };
}

// 화면에 보여줄 상태를 계산한다. 이미 쓴 쿠폰은 기간이 지나도 '사용완료'로 남는다
// (쓴 사실이 만료보다 먼저다 — 영수증에 남는 건 사용 이력이다).
export function couponStatus(coupon: Coupon, now: Date = new Date()): CouponStatus {
  if (coupon.isUsed) {
    return '사용완료';
  }
  return coupon.expiresAt.getTime() <= now.getTime() ? '만료' : '사용가능';
}

// 지금 예매에 쓸 수 있는 쿠폰인가 (안 썼고 기간도 안 지났는가)
export function isCouponUsable(coupon: Coupon, now: Date = new Date()): boolean {
  return couponStatus(coupon, now) === '사용가능';
}

// 내 쿠폰 전체를 불러온다. RLS가 본인 것만 돌려준다.
export async function fetchCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, benefit, discount_rate, status, expires_at, issued_at_stamp_order')
    .order('issued_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map(mapRow);
}

// 스탬프 9개마다 쿠폰을 발급해야 하면 발급한다(DB 함수, SECURITY DEFINER — 본인 것만 계산·생성).
// 아무 것도 새로 발급할 게 없으면 조용히 아무 일도 안 한다.
export async function issueDueCoupons(): Promise<void> {
  const { error } = await supabase.rpc('issue_due_coupons');
  if (error) {
    throw error;
  }
}

// 쿠폰 '사용완료' 처리는 여기 없다 — 예매를 만들 때 createBooking(data/bookings.ts) 안에서
// 예매와 함께 한 번에 처리된다. 쿠폰만 따로 태우는 경로를 두면 예매와 어긋날 수 있어서다.
