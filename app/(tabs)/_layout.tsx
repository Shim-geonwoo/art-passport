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
import { Colors, Theme } from '@/constants/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  // 하단 탭 바 색도 라이트/다크에 맞춘다. 다크에서는 탭 바 배경을 위 화면 배경과 같은
  // 다크색으로 맞춰서, 흰 막대가 도드라지지 않게 한다.
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false, // 지금은 각 화면 상단 헤더를 따로 쓰지 않는다
        tabBarShowLabel: false, // 아이콘만 보이도록 글자 라벨을 숨긴다
        // 선택된 탭 아이콘: 라이트=네이비, 다크=크림(어두운 바 위에서 잘 보이게)
        tabBarActiveTintColor: colorScheme === 'dark' ? Colors.cream : Colors.navy,
        tabBarInactiveTintColor: theme.textSecondary, // 선택 안 된 탭 아이콘 색
        tabBarButton: HapticTab, // 탭을 누를 때 살짝 진동 피드백을 준다
        tabBarStyle: {
          backgroundColor: theme.background, // 탭 바 배경 = 화면 배경 (라이트=흰색 / 다크=어두운색)
          borderTopColor: theme.dashedBorder, // 배경 위 얇은 구분선
          borderTopWidth: 0.5,
        },
        // 탭 바 자체는 화면 맨 아래에 붙어 있어서 더 내릴 수 없으므로,
        // 바 안에서 아이콘만 10px 아래로 내려 앉힌다
        tabBarIconStyle: {
          marginTop: 10,
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
