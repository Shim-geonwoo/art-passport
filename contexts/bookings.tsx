// "내가 예매한 것" 목록을 앱 전체가 함께 보는 저장소
//
// 예매 탭에서 새로 예매하면 → 마이페이지 예매 내역, 홈의 보딩패스, 여권 스탬프, 쿠폰이
// 전부 그 한 건을 반영해야 한다. 그래서 목록을 화면마다 따로 갖지 않고 여기 한 곳에 둔다.
// (docs/data-flow.md의 예매 → 보딩패스 → 스탬프 연쇄)
//
// 처음 값은 데모용 DUMMY_BOOKINGS 18건. 여기에 사용자가 예매/취소/쿠폰사용한 결과가 쌓인다.
// 그 결과를 기기 저장소(AsyncStorage)에 저장해서, 앱을 껐다 켜도 유지된다.
// (Supabase 연동 전까지의 임시 저장. 웹에서는 localStorage로 동작한다)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import {
  BookingItem,
  bookingOffsetDaysFor,
  DUMMY_BOOKINGS,
  nextBookingId,
} from '@/data/dummy-bookings';
import { EventItem } from '@/data/dummy-events';

// 저장 키. 저장 형식이 바뀌면 뒤 숫자를 올려 옛 데이터를 무시하게 한다.
const STORAGE_KEY = 'art-passport.bookings.v1';

type BookingsValue = {
  bookings: BookingItem[]; // 원천 목록. 화면은 이걸 derive* 함수에 넘겨서 쓴다
  // 새 예매 1건 추가 (결제하기 버튼). usedCouponId를 넘기면 그 쿠폰이 '사용완료'가 되고 10% 할인된다
  add: (event: EventItem, quantity?: number, usedCouponId?: string) => BookingItem;
  cancel: (bookingId: string) => void; // 예매를 취소 처리
  isCancelled: (bookingId: string) => boolean;
};

const BookingsContext = createContext<BookingsValue | undefined>(undefined);

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [bookings, setBookings] = useState<BookingItem[]>(DUMMY_BOOKINGS);
  // 저장소에서 처음 한 번 읽어오는 동안은 true. 다 읽기 전엔 화면을 그리지 않는다
  // (안 그러면 DUMMY가 잠깐 보였다가 저장본으로 휙 바뀌어 깜빡인다).
  const [isLoading, setIsLoading] = useState(true);

  // 1) 앱 시작 시: 저장된 목록이 있으면 불러오고, 없으면 DUMMY_BOOKINGS를 그대로 쓴다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved) {
          setBookings(JSON.parse(saved) as BookingItem[]);
        }
      } catch {
        // 읽기 실패(파싱 오류 등)면 그냥 DUMMY로 시작한다. 데모라 조용히 넘어간다.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) 목록이 바뀔 때마다 저장한다. 단, 처음 읽어오기가 끝난 뒤부터.
  //    (읽기 전에 저장하면 DUMMY로 저장본을 덮어써 버린다)
  useEffect(() => {
    if (isLoading) {
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookings)).catch(() => {
      // 저장 실패는 데모에선 무시한다
    });
  }, [bookings, isLoading]);

  const value = useMemo<BookingsValue>(() => {
    // 예매하기: status는 저장하지 않는다. 관람일(offsetDays)만 정해두면
    // deriveBooking이 "아직 안 지났으니 예매완료"라고 매번 계산해 준다.
    function add(event: EventItem, quantity: number = 1, usedCouponId?: string): BookingItem {
      const newBooking: BookingItem = {
        id: nextBookingId(bookings),
        eventId: event.id,
        offsetDays: bookingOffsetDaysFor(event),
        isCancelled: false,
        quantity: Math.max(1, Math.floor(quantity)),
        usedCouponId,
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

  // 저장소를 읽는 중엔 아무것도 그리지 않는다 (아주 짧은 순간).
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
