// 쿠폰 — 실제 Supabase coupons 테이블 기반
//
// 쿠폰 발급(스탬프 9개를 채울 때마다 1장)은 아직 자동화 로직이 없다(docs/data-structure.md
// "쿠폰 발급" 참고 — 서버 트리거/예약 함수가 필요한 별도 작업). 그래서 지금은 실제 계정에
// 쿠폰이 0장인 게 정상이다.

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
