// "지금 시각"을 주기적으로 갱신해서 돌려주는 훅.
//
// 화면들은 예매 상태(예매완료→관람완료), 보딩패스 등장/사라짐, 자동 스탬프를
// "지금과 관람 시각을 비교"해서 계산한다(data/dummy-bookings.ts). 그런데 그 "지금"을
// 화면이 열릴 때 한 번만 고정하면, 앱을 켜 둔 채 관람 시각이나 자정이 지나도 화면이
// 안 바뀐다. 이 훅은 일정 간격으로(그리고 앱이 다시 활성화될 때) 시각을 새로 읽어,
// 켜 둔 채로도 상태가 흐르게 한다. (CLAUDE.md "Living Pass(상태 변화)")

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// 기본 60초. 예매 전환·보딩패스·스탬프는 분/일 단위라 이 정도면 충분하고,
// 매 초 갱신 같은 낭비를 피한다.
const DEFAULT_INTERVAL_MS = 60_000;

export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());

    // 1) 일정 간격으로 갱신
    const timer = setInterval(tick, intervalMs);

    // 2) 앱이 백그라운드에서 다시 활성화될 때 즉시 갱신
    //    (백그라운드 동안엔 interval이 멈춰 있을 수 있어, 돌아오면 한 번 맞춰준다)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tick();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
