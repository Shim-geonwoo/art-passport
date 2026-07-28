// 로그인/회원가입 화면 그룹. 헤더 없이 화면 자체 레이아웃만 쓴다.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
