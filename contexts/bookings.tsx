// "내가 예매한 것" 목록을 앱 전체가 함께 보는 저장소
//
// 예매 탭에서 새로 예매하면 → 마이페이지 예매 내역, 홈의 보딩패스, 여권 스탬프, 쿠폰이
// 전부 그 한 건을 반영해야 한다. 그래서 목록을 화면마다 따로 갖지 않고 여기 한 곳에 둔다.
// (docs/data-flow.md의 예매 → 보딩패스 → 스탬프 연쇄)
//
// 처음 값은 데모용 DUMMY_BOOKINGS 18건. 여기에 사용자가 예매한 건이 더해진다.
// 아직 Supabase가 없어서 앱을 껐다 켜면 초기화된다(데모용).

import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

import {
  BookingItem,
  bookingOffsetDaysFor,
  DUMMY_BOOKINGS,
  nextBookingId,
} from '@/data/dummy-bookings';
import { EventItem } from '@/data/dummy-events';

type BookingsValue = {
  bookings: BookingItem[]; // 원천 목록. 화면은 이걸 derive* 함수에 넘겨서 쓴다
  add: (event: EventItem, quantity?: number) => BookingItem; // 새 예매 1건 추가 (결제하기 버튼)
  cancel: (bookingId: string) => void; // 예매를 취소 처리
  isCancelled: (bookingId: string) => boolean;
};

const BookingsContext = createContext<BookingsValue | undefined>(undefined);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<BookingItem[]>(DUMMY_BOOKINGS);

  const value = useMemo<BookingsValue>(() => {
    // 예매하기: status는 저장하지 않는다. 관람일(offsetDays)만 정해두면
    // deriveBooking이 "아직 안 지났으니 예매완료"라고 매번 계산해 준다.
    function add(event: EventItem, quantity: number = 1): BookingItem {
      const newBooking: BookingItem = {
        id: nextBookingId(bookings),
        eventId: event.id,
        offsetDays: bookingOffsetDaysFor(event),
        isCancelled: false,
        quantity: Math.max(1, Math.floor(quantity)),
      };
      setBookings((prev) => [...prev, newBooking]);
      return newBooking;
    }

    // 취소: 목록에서 지우지 않고 isCancelled만 켠다.
    // (예매 내역에 '취소' 상태로 남아 있어야 하기 때문)
    function cancel(bookingId: string) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, isCancelled: true } : b))
      );
    }

    function isCancelled(bookingId: string) {
      return bookings.some((b) => b.id === bookingId && b.isCancelled);
    }

    return { bookings, add, cancel, isCancelled };
  }, [bookings]);

  return <BookingsContext.Provider value={value}>{children}</BookingsContext.Provider>;
}

export function useBookings(): BookingsValue {
  const value = useContext(BookingsContext);
  if (!value) {
    throw new Error('useBookings는 BookingsProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
