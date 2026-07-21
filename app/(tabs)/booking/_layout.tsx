// 예매(Booking) 탭 안의 화면 이동 스택
//
// 예매 탭 안에는 화면이 3개 있다: 공연 목록(index) -> 공연 상세([id]) -> 결제(checkout)
// 세 화면 모두 자체적으로 뒤로가기 버튼 등 헤더를 직접 그리므로,
// Expo Router가 기본으로 붙여주는 상단 헤더는 꺼둔다(headerShown: false).

import { Stack } from 'expo-router';

export default function BookingStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="checkout" />
    </Stack>
  );
}
