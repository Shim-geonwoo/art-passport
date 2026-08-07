// 하위 페이지 공용 상단 헤더: 뒤로가기(<) + 제목
//
// 마이페이지의 하위 화면(예매관리/리워드/설정)에서 공통으로 쓴다.
// 앱 전체가 기본 헤더를 끄고 각 화면이 헤더를 직접 그리는 방식이라, 여기서도 직접 그린다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/fonts';

export function BackHeader({ title, color }: { title: string; color: string }) {
  return (
    <View style={styles.header}>
      {/* 아이콘만 있는 버튼이라 스크린리더가 읽을 글자가 없다. 라벨을 직접 달아주지 않으면
          "버튼"이라고만 읽혀서 무엇을 하는 버튼인지 알 수 없다.
          (글자가 들어 있는 버튼은 그 글자가 그대로 읽히므로 라벨을 따로 안 달아도 된다) */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기">
        <Ionicons name="chevron-back" size={24} color={color} />
      </Pressable>
      <Text style={[styles.title, { color }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  back: {
    padding: 2,
  },
  title: {
    fontFamily: Fonts.medium,
    fontSize: 18,
  },
});
