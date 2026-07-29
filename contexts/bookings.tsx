// "내가 예매한 것" + "내 쿠폰"을 앱 전체가 함께 보는 저장소 (Supabase 실제 데이터)
//
// 예매 탭에서 새로 예매하면 → 마이페이지 예매 내역, 홈의 보딩패스, 여권 스탬프, 쿠폰이
// 전부 그 한 건을 반영해야 한다. 그래서 목록을 화면마다 따로 불러오지 않고 여기 한 곳에서
// 로그인 상태가 바뀔 때(로그인/로그아웃) 한 번 불러와 공유한다.
// (docs/data-flow.md의 예매 → 보딩패스 → 스탬프 연쇄)
//
// 예매 생성 자체는 checkout 화면이 서버 함수(createBooking)를 부르고, 끝나면 refresh()를 불러서
// 이 목록을 최신 상태로 다시 받아온다.
//
// 조회에 실패했을 때(네트워크 끊김 등)는 조용히 넘어가지 않는다 — 첫 조회부터 실패하면 보여줄 게
// 없으니 전체 화면으로 알리고 다시 시도하게 하고, 쓰다가 실패한 경우엔 받아둔 목록을 그대로
// 유지하면서 error 값만 내보낸다. (실패가 "예매 0건"처럼 보이면 안 되니까)

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { LoadError } from '@/components/load-error';
import { useAuth } from '@/contexts/auth';
import { useEvents } from '@/contexts/events';
import { BookingRow, cancelBooking, fetchBookings } from '@/data/bookings';
import { Coupon, fetchCoupons, issueDueCoupons } from '@/data/coupons';

const LOAD_ERROR_MESSAGE = '예매 정보를 불러오지 못했어요.';

type BookingsValue = {
  bookings: BookingRow[];
  coupons: Coupon[];
  isLoading: boolean;
  error: string | null; // 마지막 조회가 실패했으면 안내 문구, 성공했으면 null
  refresh: () => Promise<void>; // bookings/coupons를 다시 불러온다 (예매 직후 등)
  cancel: (bookingId: string) => Promise<void>; // 예매 취소 후 자동으로 refresh까지 한다
};

const BookingsContext = createContext<BookingsValue | undefined>(undefined);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // 예매가 바뀌면 회차의 잔여석(sold_count)도 바뀐다. 그 값은 카탈로그(events)에 실려 오므로
  // 여기서 함께 다시 받아온다 — 안 그러면 방금 매진시킨 회차가 계속 "2석"으로 보인다.
  // (app/_layout.tsx에서 EventsProvider가 이 Provider 바깥에 있어서 쓸 수 있다)
  const { refresh: refreshEvents } = useEvents();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 로그인한 뒤 목록을 한 번이라도 성공적으로 받아온 적이 있는가.
  // "첫 조회부터 실패한 것"과 "쓰다가 한 번 실패한 것"을 구분하려고 둔다 —
  // 앞의 경우엔 보여줄 게 아예 없어서 전체 화면으로 안내해야 한다.
  //
  // 로그아웃 분기에서는 이 값을 켜지 않는다. 예전엔 켰었는데, 그러면 로그인 직후 첫 조회가
  // 실패해도 "이미 한 번 불러온 적 있음"으로 취급돼서 안내 화면이 안 뜨고 목록만 텅 비었다.
  // (실제로 그 탓에 쿠폰 조회가 깨졌을 때 예매 내역·보딩패스가 조용히 빈 채로 보였다)
  const [hasLoaded, setHasLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      // 로그아웃 상태면 보여줄 게 없다 (Stack.Protected가 어차피 이 화면들을 안 보여준다)
      setBookings([]);
      setCoupons([]);
      setError(null);
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
      setError(null);
      setHasLoaded(true);
      // 잔여석을 최신으로 맞춘다. 예매/취소 직후는 물론, 로그인 시점에도 다른 기기에서 산 만큼이
      // 반영된다. 실패해도 EventsProvider가 알아서 처리하므로 여기서 예매 조회까지 실패로
      // 취급하지 않도록 마지막에 부른다.
      await refreshEvents();
    } catch {
      // 조회 실패(네트워크 끊김 등). 예전엔 여기서 그냥 터져서 "예매 0건"처럼 보였는데,
      // 이제는 실패했다고 표시하고 이미 받아둔 목록은 그대로 둔다(화면이 갑자기 비지 않게).
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, [user, refreshEvents]);

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
    () => ({ bookings, coupons, isLoading, error, refresh, cancel }),
    [bookings, coupons, isLoading, error, refresh, cancel]
  );

  // 처음 불러오는 동안엔 아무것도 그리지 않는다 (짧은 순간, 로그인 직후에만 보인다)
  if (isLoading && !hasLoaded) {
    return null;
  }

  // 첫 조회부터 실패하면 보여줄 데이터가 아예 없다 → 전체 화면으로 알리고 다시 시도하게 한다.
  // (한 번이라도 성공한 뒤의 실패는 화면을 뺏지 않는다. 받아둔 목록을 계속 보여주고,
  //  대신 error 값을 내보내서 필요한 화면이 알아서 안내하도록 둔다)
  if (error && !hasLoaded) {
    return <LoadError message={error} onRetry={refresh} />;
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
