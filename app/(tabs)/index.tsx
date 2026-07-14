// 보딩패스(Boarding Pass) 화면
//
// 앱을 켰을 때 가장 먼저 보이는 첫 화면(랜딩)이다.
// (파일 이름이 index.tsx이기 때문에 탭 그룹의 기본 화면이 된다.)
// 지금은 화면 제목만 있는 빈 화면이고,
// 실제 보딩패스 카드(월렛처럼 쌓인 카드)는 다음 작업에서 만든다.

import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

export default function BoardingPassScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>보딩패스</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream, // 화면 전체 배경은 크림색
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // docs/design-system.md 타이포그래피 - "Title" 규칙 (22px / 500 / text-primary)
    fontSize: 22,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
});
