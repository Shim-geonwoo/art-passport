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
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth';
import { BookingsProvider } from '@/contexts/bookings';
import { EventsProvider } from '@/contexts/events';
import { ThemePreferenceProvider } from '@/contexts/theme-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 폰트 로딩이 끝날 때까지 스플래시 화면을 계속 띄워둔다 (흰 화면이 잠깐 보이는 걸 막아준다)
SplashScreen.preventAutoHideAsync();

// 스플래시를 최소한 이만큼은 보여준다.
//
// Noto Sans KR은 앱 번들에 들어 있어서 보통 눈 깜짝할 새에 준비된다. 그러면 스플래시가
// 한두 프레임만 스쳤다가 사라져서, 로고를 봤다는 느낌 없이 화면이 툭 튀는 것처럼 보였다.
// 이 값은 "하한"이지 고정 지연이 아니다 — 폰트가 이보다 오래 걸리면(첫 실행이나 느린 기기)
// 그때까지 계속 기다린다. 즉 앱이 느려지는 경우는 없고, 너무 빠를 때만 붙잡아 둔다.
const MINIMUM_SPLASH_MS = 500;

export default function RootLayout() {
  // 앱 전체에서 쓸 Noto Sans KR 폰트를 한 번만 불러온다.
  // (docs/design-system.md "2. 타이포그래피" - 폰트: 전체 Noto Sans KR)
  // useFonts는 [불러왔는가, 실패했는가] 두 값을 준다.
  // 예전엔 앞의 것만 받아 썼는데, 그러면 폰트 로딩이 실패했을 때 fontsLoaded가 영영
  // false로 남는다 — 스플래시가 안 내려가고 앱이 그 자리에서 멈춘다.
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_300Light,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });

  // 폰트를 못 불러왔어도 앱은 떠야 한다. 글씨가 시스템 기본 글꼴로 보일 뿐,
  // 예매도 보딩패스도 다 된다. 글꼴 하나 때문에 아무것도 못 하게 두는 것보다 낫다.
  // ("성공했거나 실패했거나" = 더 기다릴 이유가 없다는 뜻)
  const fontsSettled = fontsLoaded || !!fontError;

  // 최소 노출 시간이 지났는가. 폰트 로딩과는 상관없이 앱이 뜨자마자 따로 흐른다.
  const [minimumSplashPassed, setMinimumSplashPassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumSplashPassed(true), MINIMUM_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // 준비가 끝났는가 = 폰트 결과가 나왔고, 최소 노출 시간도 지났는가.
  // 둘 중 늦게 끝나는 쪽에 맞춰지므로, 폰트가 오래 걸리면 폰트를 기다리고
  // 폰트가 순식간에 끝나면 MINIMUM_SPLASH_MS를 채운다.
  //
  // 폰트 쪽 조건이 fontsLoaded가 아니라 fontsSettled인 게 중요하다. 폰트 로딩이 실패했을 때
  // fontsLoaded는 영영 false라, 그걸 기다리면 스플래시가 안 내려가고 앱이 멈춘다.
  const isReady = fontsSettled && minimumSplashPassed;

  useEffect(() => {
    if (isReady) {
      // 준비가 끝났으니 스플래시 화면을 내린다
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  // 아직 준비 중이면 아무것도 그리지 않고 기다린다 (스플래시가 대신 보여준다)
  if (!isReady) {
    return null;
  }

  // 테마 설정(시스템/라이트/다크)을 앱 전체에 제공한다. 실제 색 스킴 계산은 그 안쪽에서 한다.
  // 로그인 세션(AuthProvider)도 앱 전체에 둔다. 로그인 여부로 (auth)/(tabs) 중 뭘 보여줄지
  // RootLayoutNav가 정하기 때문에, Stack보다 바깥에 있어야 한다.
  // 예매 목록(BookingsProvider)도 앱 전체에 둔다. 예매/취소/쿠폰사용 결과가 모든 탭에
  // 함께 반영돼야 하고 기기 저장소에 유지되므로, 두 탭을 함께 감싸는 여기가 제자리다.
  return (
    <ThemePreferenceProvider>
      <AuthProvider>
        <EventsProvider>
          <BookingsProvider>
            <RootLayoutNav />
          </BookingsProvider>
        </EventsProvider>
      </AuthProvider>
    </ThemePreferenceProvider>
  );
}

// ThemePreferenceProvider 안에서 실제 색 스킴을 읽어 화면을 구성한다.
// (useColorScheme이 테마 설정 값을 참고하므로 반드시 Provider 안에서 호출해야 한다)
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();

  // 저장된 로그인 세션을 불러오는 아주 짧은 순간에는 아무것도 그리지 않는다
  // (스플래시 화면이 이미 내려간 뒤라, 로그인/탭 화면 중 뭘 보여줄지 정해지기 전엔 비워둔다)
  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* 로그인했으면 탭 화면들을, 안 했으면 로그인/회원가입 화면을 보여준다.
            세션이 바뀌면(로그인/로그아웃) 이 가드가 자동으로 화면을 전환해준다. */}
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {/* 상태바(시계·배터리) 글씨색을 앱 배경에 맞춘다.
          style="dark" = 어두운 글씨(밝은 배경용) / "light" = 밝은 글씨(어두운 배경용)

          예전엔 style="auto"였는데, 이 'auto'는 앱 설정이 아니라 기기(OS)의 색 스킴을 본다.
          그런데 앱 배경은 hooks/use-color-scheme.ts가 정하고, 그건 설정 화면에서 고른 테마를
          우선한다 — 두 판단이 서로 다른 곳을 보고 있었다.
          그래서 "기기는 다크인데 앱 테마는 라이트"일 때 흰 배경 위에 흰 글씨가 돼서
          시계와 배터리가 보이지 않았다. 여기서는 앱이 실제로 그리는 색(colorScheme)을 그대로 쓴다. */}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
