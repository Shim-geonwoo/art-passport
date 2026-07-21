// 장르 뱃지 (GenreBadge)
//
// 카테고리 색 배경의 알약(pill) 모양 뱃지. 공연 목록 카드와 상세 화면에서 함께 쓴다.
// 출처: docs/design-system.md "5. 컴포넌트" GenreBadge, "4. 모서리·테두리" radius-pill(20px)

import { StyleSheet, Text, View } from 'react-native';

import { CategoryColors, Colors, Genre } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

export function GenreBadge({ genre }: { genre: Genre }) {
  return (
    <View style={[styles.badge, { backgroundColor: CategoryColors[genre] }]}>
      <Text style={styles.text}>{genre}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20, // radius-pill
    paddingHorizontal: 8, // sm
    paddingVertical: 3,
  },
  text: {
    fontFamily: Fonts.medium,
    fontSize: 11, // Label 크기
    color: Colors.textOnColor,
  },
});
