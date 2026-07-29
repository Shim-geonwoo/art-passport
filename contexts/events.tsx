// 예매 카탈로그(events)를 앱 전체가 함께 보는 저장소.
//
// Supabase에서 한 번만 불러와서 예매 목록/상세/결제 화면이 나눠 쓴다.
// (매 화면마다 따로 불러오면 화면 전환할 때마다 다시 로딩하는 게 보여서 굳이 그렇게 안 한다)

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { EventItem, fetchEvents } from '@/data/events';

const LOAD_ERROR_MESSAGE = '공연 목록을 불러오지 못했어요.';

type EventsValue = {
  events: EventItem[];
  isLoading: boolean;
  error: string | null; // 마지막 조회가 실패했으면 안내 문구, 성공했으면 null
  refresh: () => Promise<void>; // 실패했을 때 다시 시도하려고 화면에서 부른다
};

const EventsContext = createContext<EventsValue | undefined>(undefined);

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 이 Provider는 앱이 켜져 있는 동안 계속 살아 있어서(app/_layout.tsx 최상단), 화면이 사라진 뒤
  // 응답이 도착하는 상황을 따로 막아줄 필요가 없다.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setEvents(await fetchEvents());
      setError(null);
    } catch {
      // 실패해도 이미 받아둔 목록은 지우지 않는다 (쓰던 중에 화면이 갑자기 비지 않게)
      setError(LOAD_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<EventsValue>(
    () => ({ events, isLoading, error, refresh }),
    [events, isLoading, error, refresh]
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsValue {
  const value = useContext(EventsContext);
  if (!value) {
    throw new Error('useEvents는 EventsProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
