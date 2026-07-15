// 예매(Booking) 탭 - 화면 2: 공연 상세
//
// 목록 화면(index.tsx)에서 카드를 눌렀을 때 오는 화면.
// URL의 [id] 값으로 더미 데이터에서 해당 공연을 찾아 큰 포스터 + 정보 + 예매 버튼을 보여준다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreBadge } from '@/components/genre-badge';
import { CategoryColors, Colors, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { DUMMY_EVENTS } from '@/data/dummy-events';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const event = DUMMY_EVENTS.find((item) => item.id === id);

  // 잘못된 id로 들어온 경우(더미 데이터에 없음) 안내만 하고 뒤로가기를 유도한다
  if (!event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <Text style={[styles.notFoundText, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 상단 포스터. 실제 이미지가 없어서 카테고리 색 박스로 대체한다 */}
        <View style={[styles.poster, { backgroundColor: CategoryColors[event.genre] }]}>
          <Ionicons name="image-outline" size={48} color={Colors.textOnColor} style={styles.posterIcon} />

          {/* 뒤로가기 버튼: 포스터 위에 겹쳐서 배치 */}
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.textOnColor} />
          </Pressable>
        </View>

        {/* 공연 정보 */}
        <View style={styles.info}>
          <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
          <GenreBadge genre={event.genre} />

          <View style={styles.infoList}>
            <LabelValue label="날짜" value={event.showAt} theme={theme} />
            <LabelValue label="장소" value={event.venueName} theme={theme} />
            <LabelValue label="가격" value={`${event.price.toLocaleString('ko-KR')}원`} theme={theme} />
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 예매하기 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <Pressable style={styles.bookButton}>
          <Text style={styles.bookButtonText}>예매하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// 라벨(연한 회색, 작은 글씨) + 값(진한 색, 조금 더 큰 글씨) 한 줄
function LabelValue({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: { textSecondary: string; text: string };
}) {
  return (
    <View style={styles.labelValueRow}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24, // xl
  },
  notFoundText: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },

  // 상단 큰 포스터 (화면 너비 꽉 채움, 높이 280)
  poster: {
    width: '100%',
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterIcon: {
    opacity: 0.6,
  },
  backButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 공연 정보 영역
  info: {
    paddingHorizontal: 16,
    paddingTop: 20, // lg
    gap: 8, // sm
  },
  title: {
    fontFamily: Fonts.medium,
    fontSize: 22, // Title
  },
  infoList: {
    marginTop: 8, // sm
    gap: 12,
  },
  labelValueRow: {
    gap: 4, // xs
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 11, // Label 크기
  },
  value: {
    fontFamily: Fonts.regular,
    fontSize: 15, // Value 크기
  },

  // 하단 고정 예매하기 버튼
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bookButton: {
    backgroundColor: Colors.navy,
    borderRadius: 8, // radius-button
    paddingVertical: 16,
    alignItems: 'center',
  },
  bookButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
});
