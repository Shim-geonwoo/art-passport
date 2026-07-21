// 앱 전역 "테마 설정" 저장소 (시스템 / 라이트 / 다크)
//
// 원래 다크모드는 기기(OS) 설정만 따라갔다(읽기 전용).
// 사용자가 앱 안에서 직접 테마를 고르게 하려면, 그 선택을 여기에 담아두고
// hooks/use-color-scheme.ts가 이 값을 참고하게 만든다.
//
// 지금은 앱을 껐다 켜면 초기화되는 메모리 저장이다(데모용).
// 나중에 기기에 저장하려면 AsyncStorage를 붙이면 된다.

import { createContext, ReactNode, useContext, useState } from 'react';

// 시스템 = 기기 설정을 따름 / 라이트 / 다크
export type ThemePreference = 'system' | 'light' | 'dark';

type ThemePreferenceValue = {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  // 기본값은 '시스템'(기존 동작과 동일: 기기 설정을 따라감)
  const [preference, setPreference] = useState<ThemePreference>('system');

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemePreferenceContext.Provider>
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
