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
      {/* 관리자 전용. 여기 등록해 둬도 허브(index)에서 관리자에게만 항목이 보인다.
          라우트 자체를 막지는 않는데, 막아야 할 것은 화면이 아니라 저장이라서다 —
          그건 DB의 RLS가 한다(20260806150000_admin_role.sql). */}
      <Stack.Screen name="admin" />
      {/* 공연 편집. id를 주면 편집, 안 주면 새 공연 등록이 된다 */}
      <Stack.Screen name="admin-event" />
    </Stack>
  );
}
