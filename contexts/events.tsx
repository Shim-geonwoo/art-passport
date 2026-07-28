// 예매 카탈로그(events)를 앱 전체가 함께 보는 저장소.
//
// Supabase에서 한 번만 불러와서 예매 목록/상세/결제 화면이 나눠 쓴다.
// (매 화면마다 따로 불러오면 화면 전환할 때마다 다시 로딩하는 게 보여서 굳이 그렇게 안 한다)

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { EventItem, fetchEvents } from '@/data/events';

type EventsValue = {
  events: EventItem[];
  isLoading: boolean;
  error: string | null;
};

const EventsContext = createContext<EventsValue | undefined>(undefined);

export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('공연 목록을 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <EventsContext.Provider value={{ events, isLoading, error }}>{children}</EventsContext.Provider>
  );
}

export function useEvents(): EventsValue {
  const value = useContext(EventsContext);
  if (!value) {
    throw new Error('useEvents는 EventsProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
