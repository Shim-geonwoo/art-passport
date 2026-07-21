import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useThemePreference } from '@/contexts/theme-preference';

// 앱 전역에서 쓰는 색 스킴.
// 사용자가 설정에서 고른 테마(라이트/다크)를 우선 적용하고, '시스템'이면 기기 설정을 따른다.
export function useColorScheme(): 'light' | 'dark' {
  const systemScheme = useSystemColorScheme();
  const { preference } = useThemePreference();

  if (preference === 'system') {
    return systemScheme ?? 'light';
  }
  return preference;
}
