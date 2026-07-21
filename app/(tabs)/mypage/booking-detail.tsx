// 마이페이지 > 예매관리 > 예매 상세 (하위 화면)
//
// 목록에서 예매를 누르면 오는 화면. URL의 id로 해당 예매를 찾아 상세 정보를 보여준다.
// 예매완료(관람 전) 건만 "예매 취소하기"가 가능하다. 취소 상태는 목록과 공유(BookingsProvider)된다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { GenreBadge } from '@/components/genre-badge';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { BookingStatus, deriveAllBookings } from '@/data/dummy-bookings';
import { formatDateTime, formatDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

const BOOKING_STATUS_COLOR: Record<BookingStatus, string> = {
  예매완료: Colors.blue,
  관람완료: Colors.navy,
  취소: Colors.textSecondary,
};

// 좌석은 자유석 고정. 인원(매수)은 결제 화면에서 정한 booking.quantity를 쓴다.
const SEAT_INFO = '자유석';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { bookings, cancel } = useBookings();
  const now = useNow();

  // id로 예매를 찾고, 취소한 건이면 상태를 '취소'로 덮어쓴다
  // 취소 여부는 deriveAllBookings가 이미 상태에 반영해 준다
  const booking = deriveAllBookings(bookings, now).find((b) => b.id === id);

  if (!booking) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="예매 상세" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>예매 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  const whenText = booking.event.time ? formatDateTime(booking.showAt) : formatDate(booking.showAt);
  const canCancel = booking.status === '예매완료'; // 관람 전에만 취소 가능

  // "예매 취소하기": 확인 후 취소 처리(Context에 반영). 웹은 Alert.alert가 no-op이라 window.confirm 사용
  function handleCancel() {
    if (!booking) {
      return;
    }
    const doCancel = () => cancel(booking.id);
    if (Platform.OS === 'web') {
      if (window.confirm('이 예매를 취소할까요?')) {
        doCancel();
      }
      return;
    }
    Alert.alert('예매 취소', '이 예매를 취소할까요?', [
      { text: '닫기', style: 'cancel' },
      { text: '취소하기', style: 'destructive', onPress: doCancel },
    ]);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="예매 상세" color={theme.text} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 상단: 포스터 자리(카테고리 색) + 제목/장르/상태 */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: theme.text }]}>{booking.event.title}</Text>
          <View style={styles.titleMeta}>
            <GenreBadge genre={booking.event.genre} />
            <View style={[styles.badge, { backgroundColor: BOOKING_STATUS_COLOR[booking.status] }]}>
              <Text style={styles.badgeText}>{booking.status}</Text>
            </View>
          </View>
        </View>

        {/* 관람이 임박(보딩패스 대상)하면 안내 */}
        {booking.isBoardingPass && (
          <Pressable
            style={styles.notice}
            onPress={() => router.push('/')}>
            <Ionicons name="airplane" size={16} color={Colors.navy} />
            <Text style={styles.noticeText}>관람이 임박했어요 · 보딩패스에서 확인하기</Text>
          </Pressable>
        )}

        {/* 상세 정보 카드 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <InfoRow label="예매번호" value={booking.id.toUpperCase()} theme={theme} />
          <Divider theme={theme} />
          <InfoRow label="관람일시" value={whenText} theme={theme} />
          <Divider theme={theme} />
          <InfoRow label="장소" value={booking.event.venueName} theme={theme} />
          <Divider theme={theme} />
          <InfoRow label="좌석" value={`${SEAT_INFO} ${booking.quantity}매`} theme={theme} />
          <Divider theme={theme} />
          {booking.discountRate > 0 && (
            <>
              <InfoRow
                label={`쿠폰 할인 (${booking.discountRate}%)`}
                value={`-${(booking.originalPrice - booking.totalPrice).toLocaleString('ko-KR')}원`}
                theme={theme}
              />
              <Divider theme={theme} />
            </>
          )}
          <InfoRow
            label="결제금액"
            value={`${booking.totalPrice.toLocaleString('ko-KR')}원`}
            theme={theme}
          />
        </View>

        {/* 예매완료(관람 전)일 때만 취소 버튼. 그 외엔 상태 안내 */}
        {canCancel ? (
          <Pressable style={[styles.cancelButton, { borderColor: theme.textSecondary }]} onPress={handleCancel}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>예매 취소하기</Text>
          </Pressable>
        ) : (
          <Text style={[styles.cancelHint, { color: theme.textSecondary }]}>
            {booking.status === '관람완료'
              ? '이미 관람이 끝난 예매예요.'
              : '이미 취소된 예매예요.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 라벨(왼쪽) + 값(오른쪽) 한 줄
function InfoRow({ label, value, theme }: { label: string; value: string; theme: ThemeColors }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function Divider({ theme }: { theme: ThemeColors }) {
  return <View style={[styles.divider, { backgroundColor: theme.dashedBorder }]} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  notFound: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },

  headerBlock: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  title: {
    fontFamily: Fonts.medium,
    fontSize: 22,
  },
  titleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // 보딩패스 안내
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  noticeText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: Colors.navy,
  },

  // 상세 정보 카드
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  infoLabel: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  infoValue: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    flexShrink: 1,
    textAlign: 'right',
  },

  // 뱃지
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: Colors.textOnColor,
  },

  // 취소 버튼 / 안내
  cancelButton: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  cancelHint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
});
