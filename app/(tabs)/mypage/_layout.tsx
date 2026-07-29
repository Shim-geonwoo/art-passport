// 마이페이지(My Page) 탭 안의 화면 이동 스택
//
// 허브(index)에서 항목을 누르면 해당 하위 화면으로 이동한다:
//   index(허브) -> bookings(예매관리) -> booking-detail(예매 상세) / rewards(리워드) / settings(설정)
//   프로필(index 상단) -> profile(프로필 편집)
// 각 화면은 BackHeader로 뒤로가기를 직접 그리므로 기본 헤더는 꺼둔다.
//
// "취소" 상태(BookingsProvider)는 보딩패스 탭도 함께 봐야 해서 app/_layout.tsx(앱 최상단)에 있다.

import { Stack } from 'expo-router';

// 이 스택의 기준(맨 아래) 화면은 항상 허브(index)다.
// 여권의 "리워드함으로 가기"처럼 다른 탭에서 하위 화면으로 바로 건너뛰어 들어와도,
// 그 아래에 허브가 깔려 있어서 뒤로가기가 마이페이지 안에서 자연스럽게 이어진다.
export const unstable_settings = {
  anchor: 'index',
};

export default function MyPageStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="bookings" />
      <Stack.Screen name="booking-detail" />
      <Stack.Screen name="rewards" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
