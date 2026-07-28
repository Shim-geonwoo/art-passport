// "내가 예매한 것" + "내 쿠폰"을 앱 전체가 함께 보는 저장소 (Supabase 실제 데이터)
//
// 예매 탭에서 새로 예매하면 → 마이페이지 예매 내역, 홈의 보딩패스, 여권 스탬프, 쿠폰이
// 전부 그 한 건을 반영해야 한다. 그래서 목록을 화면마다 따로 불러오지 않고 여기 한 곳에서
// 로그인 상태가 바뀔 때(로그인/로그아웃) 한 번 불러와 공유한다.
// (docs/data-flow.md의 예매 → 보딩패스 → 스탬프 연쇄)
//
// 예매 생성 자체는 checkout 화면이 Supabase에 직접 insert하고, 끝나면 refresh()를 불러서
// 이 목록을 최신 상태로 다시 받아온다.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/auth';
import { BookingRow, cancelBooking, fetchBookings } from '@/data/bookings';
import { Coupon, fetchCoupons, issueDueCoupons } from '@/data/coupons';

type BookingsValue = {
  bookings: BookingRow[];
  coupons: Coupon[];
  isLoading: boolean;
  refresh: () => Promise<void>; // bookings/coupons를 다시 불러온다 (예매 직후 등)
  cancel: (bookingId: string) => Promise<void>; // 예매 취소 후 자동으로 refresh까지 한다
};

const BookingsContext = createContext<BookingsValue | undefined>(undefined);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      // 로그아웃 상태면 보여줄 게 없다 (Stack.Protected가 어차피 이 화면들을 안 보여준다)
      setBookings([]);
      setCoupons([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // 스탬프 9개마다 쿠폰을 발급해야 하면 먼저 발급하고(없으면 아무 일도 안 함), 그다음 최신 목록을 받는다
      await issueDueCoupons();
      const [bookingRows, couponRows] = await Promise.all([fetchBookings(), fetchCoupons()]);
      setBookings(bookingRows);
      setCoupons(couponRows);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // 로그인/로그아웃(=user가 바뀔 때)마다 다시 불러온다
  useEffect(() => {
    refresh();
  }, [refresh]);

  const cancel = useCallback(
    async (bookingId: string) => {
      await cancelBooking(bookingId);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<BookingsValue>(
    () => ({ bookings, coupons, isLoading, refresh, cancel }),
    [bookings, coupons, isLoading, refresh, cancel]
  );

  // 처음 불러오는 동안엔 아무것도 그리지 않는다 (짧은 순간, 로그인 직후에만 보인다)
  if (isLoading) {
    return null;
  }

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
}

export function useBookings(): BookingsValue {
  const value = useContext(BookingsContext);
  if (!value) {
    throw new Error('useBookings는 BookingsProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
