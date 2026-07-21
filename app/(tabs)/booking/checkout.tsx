// 예매(Booking) 탭 - 화면 3: 결제(체크아웃)
//
// 상세 화면([id])에서 "예매하기"를 누르면 오는 화면.
// 여기서 자유석 인원(매수)을 고르고 "테스트 결제하기"를 누르면 실제 예매 1건이 생긴다.
// (그 한 건이 마이페이지 예매 내역 → 보딩패스 → 여권 스탬프로 이어진다)
//
// CLAUDE.md: 결제는 "테스트 결제만" (데모/포트폴리오용). 실제 PG 연동은 없다.
// 좌석은 좌석맵이 아니라 "자유석 + 인원(CAP)" 모델이다 (보딩패스 카드 SEAT/CAP과 맞춤).

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { GenreBadge } from '@/components/genre-badge';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { bookingOffsetDaysFor } from '@/data/dummy-bookings';
import { DUMMY_EVENTS } from '@/data/dummy-events';
import { formatDate, formatDateTime, offsetToDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 자유석이라 좌석 지정은 없고, 인원(매수)만 고른다. 데모라 1~4매로 제한한다.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 4;
const SEAT_INFO = '자유석';

export default function CheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { add } = useBookings();

  const event = DUMMY_EVENTS.find((item) => item.id === id);

  // 인원(매수). − / + 버튼으로 1~4 사이에서 조절한다.
  const [quantity, setQuantity] = useState(MIN_QUANTITY);

  if (!event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="결제" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  // 내가 실제로 관람할 날짜 (전시는 기간형이라 카탈로그 날짜와 다르다 — bookingOffsetDaysFor 참고)
  const showAt = offsetToDate(bookingOffsetDaysFor(event), event.time);
  const whenText = event.time ? formatDateTime(showAt) : formatDate(showAt);
  const totalPrice = event.price * quantity;

  function changeQuantity(delta: number) {
    setQuantity((prev) => Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, prev + delta)));
  }

  // "테스트 결제하기": 실제 예매를 만들고(인원 포함), 완료를 알린 뒤 예매 목록으로 돌아간다.
  function handlePay() {
    if (!event) {
      return;
    }
    add(event, quantity);

    const detail = `${event.title}\n${whenText} · ${event.venueName}\n${SEAT_INFO} ${quantity}매 · ${totalPrice.toLocaleString('ko-KR')}원`;

    // 완료 후에는 결제·상세를 건너뛰고 예매 목록으로 바로 돌아온다 (뒤로가기로 결제창에 안 걸리게)
    const goToList = () => router.dismissTo('/booking');

    // react-native-web은 Alert.alert가 no-op이라 웹에서는 window.alert로 대신한다
    if (Platform.OS === 'web') {
      window.alert(`결제가 완료되었습니다\n\n${detail}`);
      goToList();
      return;
    }
    Alert.alert('결제가 완료되었습니다', detail, [{ text: '확인', onPress: goToList }]);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="결제" color={theme.text} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 무엇을 예매하는지 요약 */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: theme.text }]}>{event.title}</Text>
          <GenreBadge genre={event.genre} />
        </View>

        {/* 관람 정보 카드 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <InfoRow label="관람일시" value={whenText} theme={theme} />
          <Divider theme={theme} />
          <InfoRow label="장소" value={event.venueName} theme={theme} />
          <Divider theme={theme} />
          <InfoRow label="좌석" value={SEAT_INFO} theme={theme} />
        </View>

        {/* 인원(매수) 선택 */}
        <View style={styles.quantityBlock}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>인원</Text>
          <View style={styles.stepper}>
            <StepperButton
              label="−"
              disabled={quantity <= MIN_QUANTITY}
              onPress={() => changeQuantity(-1)}
              theme={theme}
            />
            <Text style={[styles.quantityValue, { color: theme.text }]}>{quantity}</Text>
            <StepperButton
              label="+"
              disabled={quantity >= MAX_QUANTITY}
              onPress={() => changeQuantity(1)}
              theme={theme}
            />
          </View>
        </View>

        {/* 금액 계산 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <InfoRow
            label="1매 가격"
            value={`${event.price.toLocaleString('ko-KR')}원`}
            theme={theme}
          />
          <Divider theme={theme} />
          <InfoRow label="인원" value={`${quantity}매`} theme={theme} />
          <Divider theme={theme} />
          <InfoRow
            label="결제금액"
            value={`${totalPrice.toLocaleString('ko-KR')}원`}
            theme={theme}
            emphasize
          />
        </View>
      </ScrollView>

      {/* 하단 고정 결제 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <Pressable style={styles.payButton} onPress={handlePay}>
          <Text style={styles.payButtonText}>
            {totalPrice.toLocaleString('ko-KR')}원 테스트 결제하기
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// − / + 스텝 버튼 (자유석 인원 조절)
function StepperButton({
  label,
  disabled,
  onPress,
  theme,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  theme: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={[
        styles.stepperButton,
        { borderColor: theme.dashedBorder },
        disabled && styles.stepperButtonDisabled,
      ]}>
      <Text style={[styles.stepperButtonText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

// 라벨(왼쪽) + 값(오른쪽) 한 줄. emphasize면 값이 진하고 커진다(결제금액 강조).
function InfoRow({
  label,
  value,
  theme,
  emphasize,
}: {
  label: string;
  value: string;
  theme: ThemeColors;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          { color: theme.text },
          emphasize && styles.infoValueEmphasis,
        ]}>
        {value}
      </Text>
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
    gap: 16, // md
  },
  notFound: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },

  headerBlock: {
    paddingTop: 8,
    gap: 8,
  },
  title: {
    fontFamily: Fonts.medium,
    fontSize: 22, // Title
  },

  // 정보 카드 (관람 정보 / 금액)
  card: {
    borderRadius: 16, // radius-card
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
  infoValueEmphasis: {
    fontSize: 18, // 결제금액 강조
  },

  // 인원 선택
  quantityBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18, // 원형
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 20,
    lineHeight: 24,
  },
  quantityValue: {
    fontFamily: Fonts.medium,
    fontSize: 18,
    minWidth: 24,
    textAlign: 'center',
  },

  // 하단 고정 결제 버튼
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  payButton: {
    backgroundColor: Colors.navy,
    borderRadius: 8, // radius-button
    paddingVertical: 16,
    alignItems: 'center',
  },
  payButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
});
