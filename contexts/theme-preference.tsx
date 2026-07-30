// 앱 전역 "테마 설정" 저장소 (시스템 / 라이트 / 다크)
//
// 원래 다크모드는 기기(OS) 설정만 따라갔다(읽기 전용).
// 사용자가 앱 안에서 직접 테마를 고르게 하려면, 그 선택을 여기에 담아두고
// hooks/use-color-scheme.ts가 이 값을 참고하게 만든다.
//
// 고른 값은 기기에 저장한다(AsyncStorage). 예전엔 메모리에만 두어서 앱을 껐다 켜면
// 매번 '시스템'으로 돌아갔는데, 설정 화면에서 일부러 고른 값이 사라지는 건
// "설정"이라는 이름과 맞지 않는다. (로그인 세션도 같은 저장소를 쓴다 — lib/supabase.ts)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// 시스템 = 기기 설정을 따름 / 라이트 / 다크
export type ThemePreference = 'system' | 'light' | 'dark';

// 저장 키. 다른 값과 섞이지 않게 앱 이름을 앞에 붙인다.
const STORAGE_KEY = 'art-passport.theme-preference';

// 저장소에서 읽은 값이 정말 우리가 아는 세 가지 중 하나인지 확인한다.
// (예전 버전이 남긴 값이나 손상된 값이 들어와도 앱이 이상한 상태가 되지 않게)
function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

type ThemePreferenceValue = {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  // 기본값은 '시스템'(기기 설정을 따라감). 저장된 값이 있으면 아래에서 덮어쓴다.
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // 앱이 뜰 때 저장된 선택을 한 번 읽어온다.
  //
  // 읽어오는 동안 화면을 막지 않는다(기본값으로 먼저 그린다). 막으면 그 사이 빈 화면이
  // 보일 수 있는데, 저장소 읽기는 보통 몇 ms라서 스플래시가 내려가기 전에 끝난다.
  // 혹시 늦더라도 "잠깐 시스템 테마로 보였다가 바뀌는" 쪽이 "잠깐 아무것도 없는" 쪽보다 낫다.
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        // 화면이 이미 사라진 뒤에 응답이 오면 그냥 버린다
        if (!cancelled && isThemePreference(saved)) {
          setPreferenceState(saved);
        }
      })
      .catch(() => {
        // 못 읽어도 앱은 떠야 한다. 기본값('시스템')으로 그대로 간다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    // 화면 색은 즉시 바꾸고, 저장은 뒤에서 따로 한다.
    // (저장이 끝나기를 기다리면 버튼을 눌러도 잠깐 반응이 없는 것처럼 보인다)
    setPreferenceState(next);

    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // 저장에 실패해도 이번 실행 동안은 고른 대로 보인다. 다음에 켤 때 기본값으로 돌아갈 뿐이다.
    });
  }, []);

  const value = useMemo<ThemePreferenceValue>(
    () => ({ preference, setPreference }),
    [preference, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

// 테마 설정을 읽고 바꾸는 훅. 반드시 ThemePreferenceProvider 안에서 써야 한다.
export function useThemePreference(): ThemePreferenceValue {
  const value = useContext(ThemePreferenceContext);
  if (!value) {
    throw new Error('useThemePreference는 ThemePreferenceProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
