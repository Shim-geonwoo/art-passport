// 마이페이지(My Page) 탭 안의 화면 이동 스택
//
// 허브(index)에서 항목을 누르면 해당 하위 화면으로 이동한다:
//   index(허브) -> bookings(예매관리) -> booking-detail(예매 상세) / rewards(리워드) / settings(설정)
// 각 화면은 BackHeader로 뒤로가기를 직접 그리므로 기본 헤더는 꺼둔다.
//
// "취소" 상태(BookingsProvider)는 보딩패스 탭도 함께 봐야 해서 app/_layout.tsx(앱 최상단)에 있다.

import { Stack } from 'expo-router';

export default function MyPageStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="bookings" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="rewards" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
