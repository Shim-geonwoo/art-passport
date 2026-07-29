// 예매(Booking) 탭 - 화면 2: 공연 상세
//
// 목록 화면(index.tsx)에서 카드를 눌렀을 때 오는 화면.
// URL의 [id] 값으로 더미 데이터에서 해당 공연을 찾아 큰 포스터 + 정보 + 예매 버튼을 보여준다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreBadge } from '@/components/genre-badge';
import { LoadError } from '@/components/load-error';
import { CategoryColors, Colors, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useEvents } from '@/contexts/events';
import { formatEventSchedule, isBookable } from '@/data/events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { events, isLoading, error, refresh } = useEvents();
  const now = useNow();
  const event = events.find((item) => item.id === id);

  // 남은 회차가 있고 자리도 남았는가 (전시는 기간이 안 지났는가). 매진이면 false가 된다.
  const bookable = !!event && isBookable(event, now);

  // "예매하기"를 누르면 결제(checkout) 화면으로 넘어간다. 실제 예매 생성은 거기서 한다.
  // checkout은 고정 경로라, 어떤 공연인지는 쿼리 파라미터(id)로 넘긴다.
  function handleBook() {
    if (!event || !bookable) {
      return;
    }
    router.push({ pathname: '/booking/checkout', params: { id: event.id } });
  }

  // 아직 카탈로그를 불러오는 중이면 "찾을 수 없음"으로 착각하지 않게 로딩 문구를 먼저 보여준다
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <Text style={[styles.notFoundText, { color: theme.text }]}>불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  // 카탈로그를 못 불러온 것과 "그런 공연이 없는 것"은 다르다.
  // 조회가 실패한 거라면 다시 시도할 수 있게 해준다 (아래 "찾을 수 없어요"로 넘기면
  // 사용자는 공연이 사라진 줄 알고 그냥 돌아가게 된다)
  if (error && events.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <LoadError message={error} onRetry={refresh} />
      </SafeAreaView>
    );
  }

  // 잘못된 id로 들어온 경우(카탈로그에 없음) 안내만 하고 뒤로가기를 유도한다
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
        {/* 상단 포스터. posterUrl이 있으면 그 이미지를, 없으면 카테고리 색 박스로 대체한다 */}
        <View style={[styles.poster, { backgroundColor: CategoryColors[event.genre] }]}>
          {event.posterUrl ? (
            <Image source={{ uri: event.posterUrl }} style={styles.posterImage} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={48} color={Colors.textOnColor} style={styles.posterIcon} />
          )}

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
            <LabelValue label="날짜" value={formatEventSchedule(event)} theme={theme} />
            <LabelValue label="장소" value={event.venueName} theme={theme} />
            <LabelValue label="가격" value={`${event.price.toLocaleString('ko-KR')}원`} theme={theme} />
          </View>

          {/* 상세 내용. 더미 카탈로그엔 아직 소개글이 없어서(description undefined) 빈 상태 문구로 대신한다 */}
          <View style={styles.descriptionBlock}>
            <Text style={[styles.descriptionLabel, { color: theme.text }]}>상세 내용</Text>
            <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
              {event.description && event.description.length > 0
                ? event.description
                : '상세 내용이 준비 중이에요.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 예매하기 버튼.
          목록에서는 예매 가능한 것만 보여주지만, 화면을 열어둔 사이 마지막 회차가 지나거나
          매진될 수 있고 딥링크로 바로 들어올 수도 있어서 여기서도 한 번 더 확인한다. */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <Pressable
          style={[styles.bookButton, !bookable && styles.bookButtonDisabled]}
          onPress={handleBook}
          disabled={!bookable}>
          <Text style={styles.bookButtonText}>{bookable ? '예매하기' : '예매 마감'}</Text>
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
  posterImage: {
    width: '100%',
    height: '100%',
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

  // 상세 내용
  descriptionBlock: {
    marginTop: 20, // lg
    gap: 8, // sm
  },
  descriptionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  descriptionText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 22,
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
  bookButtonDisabled: {
    opacity: 0.4,
  },
  bookButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
});
