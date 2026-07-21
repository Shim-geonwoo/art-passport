import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useThemePreference } from '@/contexts/theme-preference';

/**
 * 웹: 정적 렌더(SSR)를 지원하려면 색 스킴을 클라이언트에서 다시 계산해야 한다.
 * 사용자가 고른 테마를 우선하고, '시스템'이면 브라우저 설정(prefers-color-scheme)을 따른다.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const systemScheme = useSystemColorScheme();
  const { preference } = useThemePreference();

  const resolved = preference === 'system' ? systemScheme ?? 'light' : preference;

  if (hasHydrated) {
    return resolved;
  }

  return 'light';
}
