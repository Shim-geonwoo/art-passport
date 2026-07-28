// Supabase 클라이언트 (앱 전체가 공유하는 싱글턴 인스턴스)
//
// URL/anon key는 .env 파일(EXPO_PUBLIC_ 접두사)에서 읽는다. .env는 git에 커밋하지 않는다
// (.env.example에 형식만 남겨둠). anon key는 공개돼도 되는 값이지만(RLS로 접근을 제어하는 게
// 원칙), service_role key는 절대 이 파일이나 앱 코드에 넣지 않는다.
//
// AsyncStorage로 로그인 세션을 기기에 저장해서, 앱을 껐다 켜도 로그인이 유지되게 한다.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase 환경변수가 없습니다. .env.example을 참고해 .env에 ' +
      'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY를 채워주세요.'
  );
}

// Expo Router는 웹 빌드를 Node.js 환경(SSR)에서도 한 번 그려본다. 그 환경엔 `window`가 없는데,
// AsyncStorage의 웹 구현은 내부적으로 localStorage(=window)를 쓰기 때문에 그대로 두면
// SSR 단계에서 "window is not defined"로 죽는다. 그래서 그 순간만 아무 것도 안 하는 가짜
// storage로 대체한다 — 실제 브라우저에서 열릴 때는 정상적으로 AsyncStorage(localStorage)를 쓴다.
const isWebSsr = Platform.OS === 'web' && typeof window === 'undefined';
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWebSsr ? noopStorage : AsyncStorage,
    autoRefreshToken: !isWebSsr,
    persistSession: !isWebSsr,
    detectSessionInUrl: false, // 네이티브 앱이라 웹 URL 기반 세션 감지는 필요 없다
  },
});
