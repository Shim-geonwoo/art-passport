// 마이페이지 > 예매관리 > 예매 상세 (하위 화면)
//
// 목록에서 예매를 누르면 오는 화면. URL의 id로 해당 예매를 찾아 상세 정보를 보여준다.
// 예매완료(관람 전) 건만 "예매 취소하기"가 가능하다. 취소 상태는 목록과 공유(BookingsProvider)된다.
//
// 오픈 데이트 티켓(기간 안에 아무 때나 가는 전시)에는 "관람했어요"가 하나 더 있다.
// 전시장에서 티켓을 쓰는 동작을 대신하는 버튼이다 — 누르면 오늘 관람한 것으로 기록되고 다음 날
// 여권에 스탬프가 찍힌다. **안 누르고 기한이 지나면 만료다** — 스탬프도 안 찍힌다.
// 안 갔는데 기록이 남으면 여권이 거짓이 되기 때문이다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { GenreBadge } from '@/components/genre-badge';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { BookingStatus, deriveAllBookings, markTicketUsed } from '@/data/bookings';
import { isPeriodBased } from '@/data/events';
import { formatDateTime, formatDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

const BOOKING_STATUS_COLOR: Record<BookingStatus, string> = {
  예매완료: Colors.blue,
  관람완료: Colors.navy,
  취소: Colors.textSecondary,
  // 만료: 기간 안에 안 쓰고 흘려보낸 티켓. 취소와 같은 회색을 쓴다 —
  // 둘 다 "이 표로는 더 아무 일도 일어나지 않는다"는 뜻이라 굳이 색을 나눌 이유가 없다.
  만료: Colors.textSecondary,
};

// 좌석은 자유석 고정. 인원(매수)은 결제 화면에서 정한 booking.quantity를 쓴다.
const SEAT_INFO = '자유석';

// 안내 알림. 웹에서는 Alert.alert가 아무 일도 안 해서 window.alert로 대신한다.
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}

${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { bookings, cancel, refresh } = useBookings();
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

  // 아직 안 쓴 오픈 데이트 티켓인가. 이 경우 관람 시각이 아예 없고 기한만 있다.
  const isUnusedOpenDate = isPeriodBased(booking.event) && !booking.watchedAt;

  // 언제 가는(갔던) 표인가.
  //  - 아직 안 쓴 오픈 데이트: 고른 날이 없으니 기간을 보여준다
  //  - 쓴 오픈 데이트: 실제로 다녀온 날
  //  - 회차형: 회차 날짜와 시각
  const whenText = isUnusedOpenDate
    ? `${formatDate(booking.event.showAt)} ~ ${formatDate(booking.event.showEndAt!)} 중 하루`
    : booking.event.showEndAt
      ? formatDate(booking.showAt)
      : formatDateTime(booking.showAt);

  // "관람했어요"를 누를 수 있는가는 파생 로직이 이미 판단해 둔다(data/bookings.ts).
  // 서버 mark_ticket_used와 같은 조건이라 여기서 다시 계산하면 두 곳이 어긋날 수 있다.
  const canMarkWatched = booking.canUseTicket;
  // 공연 시작 전에만 취소할 수 있다. status가 아니라 canCancel을 쓰는 이유는 data/bookings.ts에
  // 적어뒀다 — 스탬프 기준이 "관람일 다음 날"이라, 공연이 시작된 뒤에도 그날 안에는
  // status가 예매완료로 남는다.
  const canCancel = booking.canCancel;

  // "예매 취소하기": 확인 후 취소 처리(Context에 반영, 실패하면 안내). 웹은 Alert.alert가 no-op이라 window.confirm 사용
  async function doCancel() {
    if (!booking) {
      return;
    }
    try {
      await cancel(booking.id);
    } catch {
      const message = '취소 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('취소 실패', message);
      }
    }
  }

  // "관람했어요": 티켓을 쓴다. 관람 시각이 지금으로 채워진다.
  // 되돌릴 수 없다 — 쓰고 나면 그 예매는 취소할 수 없다. 그래서 한 번 물어본다.
  async function doMarkWatched() {
    if (!booking) {
      return;
    }
    try {
      await markTicketUsed(booking.id);
      await refresh();
      notify('사용했어요', '오늘 관람한 것으로 기록했어요. 내일 여권에 스탬프가 찍혀요.');
    } catch {
      notify('처리 실패', '티켓을 사용하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }

  function handleMarkWatched() {
    if (Platform.OS === 'web') {
      if (window.confirm('오늘 관람한 것으로 기록할까요? 기록하면 이 예매는 취소할 수 없어요.')) {
        doMarkWatched();
      }
      return;
    }
    Alert.alert('관람했어요', '오늘 관람한 것으로 기록할까요? 기록하면 이 예매는 취소할 수 없어요.', [
      { text: '닫기', style: 'cancel' },
      { text: '기록하기', onPress: doMarkWatched },
    ]);
  }

  function handleCancel() {
    if (!booking) {
      return;
    }
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

        {/* 관람이 임박(오늘 포함 3일 이내)했을 때만 안내.
            "월렛에 있나"(isBoardingPass)가 아니라 "임박한가"(isSoon)를 봐야 한다 —
            예매완료면 전부 월렛에 올라가므로, 그걸 조건으로 쓰면 석 달 뒤 공연에도 이 문구가 뜬다.

            누르면 보딩패스 탭으로 건너뛴다. push를 쓰면 히스토리에 쌓여서, 이 화면으로 되돌아온 뒤
            뒤로가기를 눌렀을 때 예매 내역이 아니라 보딩패스로 가버린다 → navigate를 쓴다. */}
        {booking.isSoon && (
          <Pressable
            style={styles.notice}
            onPress={() => router.navigate('/')}>
            <Ionicons name="airplane" size={16} color={Colors.navy} />
            <Text style={styles.noticeText}>관람이 임박했어요 · 보딩패스에서 확인하기</Text>
          </Pressable>
        )}

        {/* 상세 정보 카드 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <InfoRow label="예매번호" value={booking.id.toUpperCase()} theme={theme} />
          <Divider theme={theme} />
          {/* 언제 샀는지. 관람일시와 달리 항상 분 단위까지 보여준다 — 영수증처럼 "그때 그 결제"를
              가리키는 값이라, 같은 날 두 번 예매했으면 시각으로 구분돼야 하기 때문이다. */}
          <InfoRow label="예매일시" value={formatDateTime(booking.bookedAt)} theme={theme} />
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

        {/* 오픈 데이트 티켓을 다녀왔을 때. 관람 시각이 기간 마지막 날로 잡혀 있어서,
            이걸 안 누르면 기간이 끝날 때까지 스탬프가 안 찍힌다 */}
        {canMarkWatched ? (
          <View style={[styles.watchedCard, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.watchedTitle, { color: theme.text }]}>다녀오셨나요?</Text>
            <Text style={[styles.watchedHint, { color: theme.textSecondary }]}>
              관람한 것으로 기록하면 다음 날 여권에 스탬프가 찍혀요.{' '}
              {formatDate(booking.event.showEndAt!)}까지 안 쓰면 만료되고 스탬프도 안 찍혀요.
            </Text>
            <Pressable
              style={styles.watchedButton}
              onPress={handleMarkWatched}
              accessibilityRole="button">
              <Text style={styles.watchedButtonText}>관람했어요</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 예매완료(관람 전)일 때만 취소 버튼. 그 외엔 상태 안내 */}
        {canCancel ? (
          <Pressable style={[styles.cancelButton, { borderColor: theme.textSecondary }]} onPress={handleCancel}>
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>예매 취소하기</Text>
          </Pressable>
        ) : (
          <Text style={[styles.cancelHint, { color: theme.textSecondary }]}>
            {booking.status === '취소'
              ? '이미 취소된 예매예요.'
              : booking.status === '관람완료'
                ? '이미 관람이 끝난 예매예요.'
                : // 예매완료인데 취소가 안 되는 경우 = 공연이 이미 시작됐다.
                  // (스탬프는 내일 찍히지만 취소는 지금부터 안 된다)
                  '이미 시작된 공연은 취소할 수 없어요.'}
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

  // "관람했어요" 카드 (오픈 데이트 티켓에만 나온다)
  watchedCard: {
    marginTop: 20,
    borderRadius: 16, // 일반 정보 카드 radius
    padding: 12,
    gap: 6,
  },
  watchedTitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  watchedHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  watchedButton: {
    marginTop: 4,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchedButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
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
