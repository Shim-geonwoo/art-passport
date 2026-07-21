import {
  NotoSansKR_300Light,
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans-kr';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { BookingsProvider } from '@/contexts/bookings';
import { ThemePreferenceProvider } from '@/contexts/theme-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 폰트 로딩이 끝날 때까지 스플래시 화면을 계속 띄워둔다 (흰 화면이 잠깐 보이는 걸 막아준다)
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // 앱 전체에서 쓸 Noto Sans KR 폰트를 한 번만 불러온다.
  // (docs/design-system.md "2. 타이포그래피" - 폰트: 전체 Noto Sans KR)
  const [fontsLoaded] = useFonts({
    NotoSansKR_300Light,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      // 폰트 준비가 끝났으니 스플래시 화면을 내린다
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // 폰트가 아직 준비 안 됐으면 아무것도 그리지 않고 기다린다 (스플래시가 대신 보여준다)
  if (!fontsLoaded) {
    return null;
  }

  // 테마 설정(시스템/라이트/다크)을 앱 전체에 제공한다. 실제 색 스킴 계산은 그 안쪽에서 한다.
  // 예매 취소 상태(BookingsProvider)도 앱 전체에 둔다. 마이페이지에서 취소한 예매가
  // 보딩패스 탭에서도 바로 사라져야 하므로, 두 탭을 함께 감싸는 여기가 제자리다.
  return (
    <ThemePreferenceProvider>
      <BookingsProvider>
        <RootLayoutNav />
      </BookingsProvider>
    </ThemePreferenceProvider>
  );
}

// ThemePreferenceProvider 안에서 실제 색 스킴을 읽어 화면을 구성한다.
// (useColorScheme이 테마 설정 값을 참고하므로 반드시 Provider 안에서 호출해야 한다)
function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
