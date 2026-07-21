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
import { bookingOffsetDaysFor, COUPON_DISCOUNT_RATE, firstUsableCoupon } from '@/data/dummy-bookings';
import { DUMMY_EVENTS, isBookable } from '@/data/dummy-events';
import { formatDate, formatDateTime, offsetToDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 자유석이라 좌석 지정은 없고, 인원(매수)만 고른다. 데모라 1~4매로 제한한다.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 4;
const SEAT_INFO = '자유석';

export default function CheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { add, bookings } = useBookings();
  const now = useNow();

  const event = DUMMY_EVENTS.find((item) => item.id === id);

  // 인원(매수). − / + 버튼으로 1~4 사이에서 조절한다.
  const [quantity, setQuantity] = useState(MIN_QUANTITY);

  // 지금 쓸 수 있는 쿠폰 1장(있으면). 있으면 기본으로 적용해 둔다(혜택이라 사용자가 원할 가능성이 높다).
  const usableCoupon = firstUsableCoupon(bookings);
  const [applyCoupon, setApplyCoupon] = useState(true);

  if (!event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="결제" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  // 내가 실제로 관람할 날짜 (전시는 기간형이라 카탈로그 날짜와 다르다 — bookingOffsetDaysFor 참고)
  const showAt = offsetToDate(bookingOffsetDaysFor(event), event.time, now);
  const whenText = event.time ? formatDateTime(showAt) : formatDate(showAt);

  // 목록에서 걸러지지만, 화면을 열어둔 사이 공연 시각이 지나거나 딥링크로 바로 들어올 수 있어
  // 여기서도 예매 가능 여부를 확인한다. 불가하면 결제 버튼을 막는다.
  const bookable = isBookable(event, now);

  // 금액: 원가 → (쿠폰 적용 시) 10% 할인 → 결제금액
  const originalPrice = event.price * quantity;
  const couponApplied = !!usableCoupon && applyCoupon;
  const discountAmount = couponApplied ? Math.round(originalPrice * (COUPON_DISCOUNT_RATE / 100)) : 0;
  const totalPrice = originalPrice - discountAmount;

  function changeQuantity(delta: number) {
    setQuantity((prev) => Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, prev + delta)));
  }

  // "테스트 결제하기": 실제 예매를 만들고(인원·쿠폰 포함), 완료를 알린 뒤 예매 목록으로 돌아간다.
  function handlePay() {
    if (!event || !bookable) {
      return;
    }
    // 쿠폰을 적용했으면 그 쿠폰 id를 함께 넘긴다 → 예매에 기록되고 쿠폰이 '사용완료'가 된다
    add(event, quantity, couponApplied ? usableCoupon.id : undefined);

    const couponLine = couponApplied ? `\n쿠폰 ${COUPON_DISCOUNT_RATE}% 할인 적용` : '';
    const detail = `${event.title}\n${whenText} · ${event.venueName}\n${SEAT_INFO} ${quantity}매 · ${totalPrice.toLocaleString('ko-KR')}원${couponLine}`;

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

        {/* 쿠폰 적용 (쓸 수 있는 쿠폰이 있을 때만 보인다). 누르면 켜고 끈다. */}
        {usableCoupon ? (
          <Pressable
            style={[styles.couponRow, { borderColor: theme.dashedBorder }]}
            onPress={() => setApplyCoupon((prev) => !prev)}>
            <View style={styles.couponInfo}>
              <Text style={[styles.couponTitle, { color: theme.text }]}>{usableCoupon.benefit}</Text>
              <Text style={[styles.couponMeta, { color: theme.textSecondary }]}>
                {COUPON_DISCOUNT_RATE}% 할인 쿠폰 사용
              </Text>
            </View>
            {/* 체크 표시: 적용 중이면 골드 채움, 아니면 빈 테두리 */}
            <View
              style={[
                styles.checkbox,
                { borderColor: theme.dashedBorder },
                couponApplied && styles.checkboxOn,
              ]}>
              {couponApplied ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
          </Pressable>
        ) : null}

        {/* 금액 계산 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <InfoRow
            label="1매 가격"
            value={`${event.price.toLocaleString('ko-KR')}원`}
            theme={theme}
          />
          <Divider theme={theme} />
          <InfoRow label="인원" value={`${quantity}매`} theme={theme} />
          {couponApplied ? (
            <>
              <Divider theme={theme} />
              <InfoRow
                label={`쿠폰 할인 (${COUPON_DISCOUNT_RATE}%)`}
                value={`-${discountAmount.toLocaleString('ko-KR')}원`}
                theme={theme}
              />
            </>
          ) : null}
          <Divider theme={theme} />
          <InfoRow
            label="결제금액"
            value={`${totalPrice.toLocaleString('ko-KR')}원`}
            theme={theme}
            emphasize
          />
        </View>
      </ScrollView>

      {/* 하단 고정 결제 버튼. 예매 마감(지난 공연/종료된 전시)이면 막고 안내한다. */}
      <View style={[styles.bottomBar, { backgroundColor: theme.background }]}>
        <Pressable
          style={[styles.payButton, !bookable && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={!bookable}>
          <Text style={styles.payButtonText}>
            {bookable ? `${totalPrice.toLocaleString('ko-KR')}원 테스트 결제하기` : '예매 마감된 공연이에요'}
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

  // 쿠폰 적용 토글 행
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16, // radius-card
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  couponInfo: {
    flex: 1,
    gap: 4,
  },
  couponTitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  couponMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  checkboxMark: {
    fontFamily: Fonts.bold,
    fontSize: 14,
    lineHeight: 16,
    color: Colors.textOnColor,
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
  payButtonDisabled: {
    opacity: 0.4,
  },
  payButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
});
