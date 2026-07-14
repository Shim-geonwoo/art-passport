// 앱 하단 탭 메뉴 (Bottom Tab Navigation)
//
// 탭 4개 (순서대로): 보딩패스 / 예매 / 여권 / 마이페이지
// - 앱을 켜면 맨 처음 보이는 화면은 "index" 파일(보딩패스)이다.
//   Expo Router는 폴더 안의 index.tsx를 그 그룹의 기본(첫) 화면으로 사용한다.
// - 요구사항: 탭에는 아이콘만 보이고, 아이콘 밑에 글자(라벨)는 넣지 않는다.
// - 아이콘은 실선(outline) 스타일로 통일한다 (Ionicons의 이름 끝이 "-outline"인 것들).
// - 색상은 docs/design-system.md 색상 토큰(navy, cream 등)만 사용한다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // 지금은 각 화면 상단 헤더를 따로 쓰지 않는다
        tabBarShowLabel: false, // 아이콘만 보이도록 글자 라벨을 숨긴다
        tabBarActiveTintColor: Colors.navy, // 선택된 탭 아이콘 색
        tabBarInactiveTintColor: Colors.textSecondary, // 선택 안 된 탭 아이콘 색
        tabBarButton: HapticTab, // 탭을 누를 때 살짝 진동 피드백을 준다
        tabBarStyle: {
          backgroundColor: Colors.surface, // 탭 바 배경(흰색)
          borderTopColor: Colors.borderHairline, // 크림 배경 위 카드 구분선 색
          borderTopWidth: 0.5,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '보딩패스',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="airplane-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          title: '예매',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="passport"
        options={{
          title: '여권',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mypage"
        options={{
          title: '마이페이지',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
