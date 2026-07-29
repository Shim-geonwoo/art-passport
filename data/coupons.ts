// 쿠폰 — 실제 Supabase coupons 테이블 기반
//
// 발급(스탬프 9개를 채울 때마다 1장)은 서버 함수 issue_due_coupons()가 한다. 크론 없이,
// 앱이 예매 목록을 새로 받을 때(BookingsProvider.refresh)마다 "받을 게 있으면 받는" 방식이다.
// 사용(예매에 적용) 처리는 여기 없다 — 예매를 만들 때 createBooking(data/bookings.ts) 안에서
// 예매와 한 트랜잭션으로 함께 처리된다.
//
// 아직 없는 것: '만료' 상태. status 값으로는 정의돼 있고 리워드함에 필터도 있지만,
// 유효기간 칸(expires_at)도 만료시키는 로직도 없어서 실제로 만료되는 쿠폰은 없다.

import { supabase } from '@/lib/supabase';

export type CouponStatus = '사용가능' | '사용완료' | '만료';

export type Coupon = {
  id: string;
  benefit: string;
  discountRate: number;
  status: CouponStatus;
  issuedAtStampOrder: number | null;
};

type CouponRow = {
  id: string;
  benefit: string;
  discount_rate: number;
  status: CouponStatus;
  issued_at_stamp_order: number | null;
};

function mapRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    benefit: row.benefit,
    discountRate: row.discount_rate,
    status: row.status,
    issuedAtStampOrder: row.issued_at_stamp_order,
  };
}

// 내 쿠폰 전체를 불러온다. RLS가 본인 것만 돌려준다.
export async function fetchCoupons(): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, benefit, discount_rate, status, issued_at_stamp_order')
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
