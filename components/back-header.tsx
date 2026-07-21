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
      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.back}>
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
