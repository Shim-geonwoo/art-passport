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
import { DateCalendar } from '@/components/date-calendar';
import { GenreBadge } from '@/components/genre-badge';
import { LoadError } from '@/components/load-error';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useBookings } from '@/contexts/bookings';
import { useEvents } from '@/contexts/events';
import { createBooking } from '@/data/bookings';
import { isCouponUsable } from '@/data/coupons';
import { EventItem, isBookable, upcomingSchedules } from '@/data/events';
import {
  formatDate,
  formatDateTime,
  formatMonthDayWeekday,
  formatTime,
  isSameDay,
  MS_PER_DAY,
  startOfDay,
  startOfToday,
  toDateKey,
} from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 자유석이라 좌석 지정은 없고, 인원(매수)만 고른다. 데모라 1~4매로 제한한다.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 4;
const SEAT_INFO = '자유석';

// 전시는 정해진 시각이 없어서 "그날 18시"를 관람 시각으로 본다.
// 서버(create_booking)의 c_exhibition_hour와 반드시 같은 값이어야 한다 —
// 화면에서 고를 수 있는 날과 서버가 받아주는 날이 어긋나지 않게 하려고 맞춰둔다.
const EXHIBITION_HOUR = 18;

// 전시에서 "오늘부터 고를 수 있나, 내일부터인가"를 정한다.
// 오늘 18시가 아직 안 지났으면 오늘도 갈 수 있고, 지났으면 내일부터다.
function earliestVisitDate(event: EventItem, now: Date): Date {
  const closingToday = startOfToday(now);
  closingToday.setHours(EXHIBITION_HOUR, 0, 0, 0);

  const earliest =
    now < closingToday ? startOfToday(now) : startOfToday(new Date(now.getTime() + MS_PER_DAY));
  const opening = startOfToday(event.showAt);
  return opening > earliest ? opening : earliest;
}

export default function CheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { user } = useAuth();
  const {
    events,
    isLoading: eventsLoading,
    error: eventsError,
    refresh: refreshEvents,
  } = useEvents();
  const { coupons, refresh } = useBookings();
  const now = useNow();

  const event = events.find((item) => item.id === id);

  // 인원(매수). − / + 버튼으로 조절한다. 실제 상한은 남은 좌석에 따라 달라져서 아래에서 다시 계산한다.
  const [quantityInput, setQuantityInput] = useState(MIN_QUANTITY);

  // 언제 관람할지. 공연이면 회차를, 전시면 날짜를 고른다(둘 중 하나만 쓰인다).
  // 처음엔 아무것도 안 골라둔다 — 실수로 엉뚱한 회차를 예매하는 걸 막으려고, 직접 고르게 한다.
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 지금 쓸 수 있는 쿠폰 1장(있으면). 있으면 기본으로 적용해 둔다(혜택이라 사용자가 원할 가능성이 높다).
  // 유효기간이 지난 쿠폰은 isCouponUsable이 걸러낸다 (서버도 같은 조건으로 한 번 더 확인한다).
  const usableCoupon = coupons.find((c) => isCouponUsable(c, now)) ?? null;
  const [applyCoupon, setApplyCoupon] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (eventsLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="결제" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  // 카탈로그 조회가 실패한 거라면 "찾을 수 없음"이 아니라 다시 시도할 수 있게 해준다
  if (eventsError && events.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="결제" color={theme.text} />
        <LoadError message={eventsError} onRetry={refreshEvents} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="결제" color={theme.text} />
        <Text style={[styles.notFound, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  // 전시(기간형)인가 공연(회차형)인가 — 둘 다 달력으로 날짜를 고르고,
  // 공연은 날짜를 고른 다음 그날의 회차(시간)를 한 번 더 고른다.
  const isExhibition = !!event.showEndAt;

  // 공연: 아직 안 지난 회차만 고를 수 있다.
  const schedules = upcomingSchedules(event, now);
  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId) ?? null;

  // 공연에서 "고를 수 있는 날짜" = 그날 자리가 남은 회차가 하나라도 있는 날.
  // 그날 회차가 전부 매진이면 달력에서 아예 못 고르게 한다(들어가 봐야 고를 게 없으므로).
  const scheduleDateKeys = new Set(
    schedules.filter((s) => s.remaining > 0).map((s) => toDateKey(s.startsAt))
  );

  // 고를 수 있는 날짜 범위
  //  - 전시: 오늘(또는 전시 시작일) ~ 전시 종료일
  //  - 공연: 남은 첫 회차의 날 ~ 남은 마지막 회차의 날
  const minPickDate = isExhibition
    ? earliestVisitDate(event, now)
    : schedules.length > 0
      ? startOfDay(schedules[0].startsAt)
      : null;
  const maxPickDate = isExhibition
    ? startOfDay(event.showEndAt!)
    : schedules.length > 0
      ? startOfDay(schedules[schedules.length - 1].startsAt)
      : null;

  // 고를 날이 하루라도 남았는가. 전시는 마지막 날 18시가 지나면 기간이 안 끝났어도 갈 날이 없고,
  // 공연은 남은 회차가 없으면 고를 날도 없다.
  const canPickDate = !!minPickDate && !!maxPickDate && minPickDate <= maxPickDate;

  // 공연에서 "고른 날짜"에 열리는 회차들 (보통 1~2개). 날짜를 안 골랐으면 빈 배열.
  const schedulesOnSelectedDate = selectedDate
    ? schedules.filter((s) => isSameDay(s.startsAt, selectedDate))
    : [];

  // 내가 실제로 관람할 시각 — 고른 회차/날짜에서 나온다. 아직 안 골랐으면 없다.
  const whenText = selectedSchedule
    ? formatDateTime(selectedSchedule.startsAt)
    : selectedDate
      ? formatDate(selectedDate)
      : '선택 전';

  // 목록에서 걸러지지만, 화면을 열어둔 사이 공연 시각이 지나거나 딥링크로 바로 들어올 수 있어
  // 여기서도 예매 가능 여부를 확인한다. 불가하면 결제 버튼을 막는다.
  const bookable = isBookable(event, now) && canPickDate;

  // 관람일(공연이면 회차까지)을 골랐는가. 안 골랐으면 결제 버튼을 막는다.
  const whenChosen = isExhibition ? !!selectedDate : !!selectedSchedule;

  // 고를 수 있는 인원 상한. 전시는 정원이 없어서 그대로 4매, 공연은 그 회차에 남은 좌석까지만.
  // (남은 자리보다 많이 고를 수 있게 두면, 결제 버튼을 눌러야 서버가 거절해서 헛걸음이 된다)
  const maxQuantity = selectedSchedule
    ? Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, selectedSchedule.remaining))
    : MAX_QUANTITY;

  // 실제로 쓸 인원 수. 회차를 바꿔서 상한이 줄어들면 고른 값도 따라 줄어든다
  // (state를 그때그때 고쳐 맞추는 대신, 그릴 때 상한으로 눌러서 어긋날 여지를 없앤다)
  const quantity = Math.min(quantityInput, maxQuantity);

  // 날짜를 새로 고르면, 그 전에 골라둔 회차는 다른 날 것이라 더 이상 쓸 수 없다 → 같이 비운다.
  // (같은 날을 다시 누른 경우엔 고른 회차를 그대로 둔다)
  function handleSelectDate(date: Date) {
    if (selectedDate && isSameDay(date, selectedDate)) {
      return;
    }
    setSelectedDate(date);
    setSelectedScheduleId(null);
  }

  // 금액: 원가 → (쿠폰 적용 시) 쿠폰의 할인율만큼 할인 → 결제금액
  // 여기 계산은 화면에 미리 보여주기 위한 것이고, 실제로 저장되는 금액은 서버(create_booking)가
  // events.price와 쿠폰 행을 다시 읽어 똑같은 식으로 계산한다.
  const discountRate = usableCoupon?.discountRate ?? 0;
  const originalPrice = event.price * quantity;
  const couponApplied = !!usableCoupon && applyCoupon;
  const discountAmount = couponApplied ? Math.round(originalPrice * (discountRate / 100)) : 0;
  const totalPrice = originalPrice - discountAmount;

  function changeQuantity(delta: number) {
    setQuantityInput(Math.min(maxQuantity, Math.max(MIN_QUANTITY, quantity + delta)));
  }

  // "테스트 결제하기": 서버(create_booking)에 예매 1건을 만들어 달라고 하고, 완료를 알린 뒤 예매 목록으로 돌아간다.
  async function handlePay() {
    if (!event || !bookable || !whenChosen || !user || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      // 서버에 "무엇을·몇 매·어떤 쿠폰으로·언제"만 넘긴다. 관람 시각·금액 계산과 쿠폰 사용완료 처리,
      // 고른 회차/날짜가 올바른지 확인하는 것까지 전부 create_booking 함수가 한 트랜잭션에서 처리한다.
      await createBooking({
        eventId: event.id,
        quantity,
        couponId: couponApplied ? usableCoupon!.id : null,
        scheduleId: selectedSchedule?.id ?? null,
        visitDate: selectedDate ? toDateKey(selectedDate) : null,
      });
    } catch (error) {
      setIsSubmitting(false);
      if (Platform.OS === 'web') {
        window.alert(payErrorMessage(error));
      } else {
        Alert.alert('결제 실패', payErrorMessage(error));
      }
      return;
    }

    // 보딩패스·여권·마이페이지가 방금 만든 예매를 바로 보게 한다
    await refresh();
    setIsSubmitting(false);

    const couponLine = couponApplied ? `\n쿠폰 ${discountRate}% 할인 적용` : '';
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

        {/* 1단계: 관람일 고르기 (전시·공연 공통, 달력) */}
        <View style={styles.whenBlock}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>관람일</Text>
          <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
            {isExhibition
              ? `${formatDate(event.showAt)} ~ ${formatDate(event.showEndAt!)} 중 하루를 고르세요`
              : '공연이 있는 날만 고를 수 있어요'}
          </Text>
        </View>

        {canPickDate ? (
          <DateCalendar
            minDate={minPickDate!}
            maxDate={maxPickDate!}
            selected={selectedDate}
            onSelect={handleSelectDate}
            theme={theme}
            // 전시는 기간 안 아무 날이나 가능해서 안 넘긴다. 공연은 회차가 있는 날만.
            availableDates={isExhibition ? undefined : scheduleDateKeys}
          />
        ) : (
          <Text style={[styles.emptyWhen, { color: theme.textSecondary }]}>
            {isExhibition ? '관람할 수 있는 날이 남지 않았어요.' : '예매할 수 있는 회차가 남지 않았어요.'}
          </Text>
        )}

        {/* 2단계: 공연은 고른 날짜의 회차(시간)를 한 번 더 고른다. 전시는 이 단계가 없다. */}
        {!isExhibition && canPickDate ? (
          <>
            <View style={styles.whenBlock}>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>회차</Text>
              {selectedDate ? (
                <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
                  {formatMonthDayWeekday(selectedDate)}
                </Text>
              ) : null}
            </View>

            {selectedDate ? (
              <View style={styles.timeRow}>
                {schedulesOnSelectedDate.map((schedule) => (
                  <TimeChip
                    key={schedule.id}
                    label={formatTime(schedule.startsAt)}
                    remaining={schedule.remaining}
                    selected={schedule.id === selectedScheduleId}
                    onPress={() => setSelectedScheduleId(schedule.id)}
                    theme={theme}
                  />
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyWhen, { color: theme.textSecondary }]}>
                날짜를 먼저 골라주세요.
              </Text>
            )}
          </>
        ) : null}

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
          <View>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>인원</Text>
            {/* 남은 좌석 때문에 상한이 줄었으면 왜 더 못 늘리는지 알려준다 */}
            {maxQuantity < MAX_QUANTITY ? (
              <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
                이 회차는 {maxQuantity}매까지 가능해요
              </Text>
            ) : null}
          </View>
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
              disabled={quantity >= maxQuantity}
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
                {discountRate}% 할인 쿠폰 사용
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
                label={`쿠폰 할인 (${discountRate}%)`}
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
          style={[
            styles.payButton,
            (!bookable || !whenChosen || isSubmitting) && styles.payButtonDisabled,
          ]}
          onPress={handlePay}
          disabled={!bookable || !whenChosen || isSubmitting}>
          <Text style={styles.payButtonText}>
            {!bookable
              ? '예매 마감된 공연이에요'
              : !selectedDate
                ? '관람일을 선택해주세요'
                : !whenChosen
                  ? '회차를 선택해주세요' // 날짜는 골랐는데 공연 회차를 아직 안 고른 경우
                  : isSubmitting
                    ? '처리 중...'
                    : `${totalPrice.toLocaleString('ko-KR')}원 테스트 결제하기`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// 결제 실패 시 보여줄 문구를 고른다.
// create_booking 함수가 일부러 던지는 안내(예: "예매가 마감된 공연입니다.")는 사용자에게
// 그대로 보여주고, 그 밖의 예상 못 한 오류는 일반적인 문구로 바꾼다(DB 내부 메시지 노출 방지).
// 아래 코드들은 마이그레이션에서 raise exception에 붙여둔 errcode다.
const KNOWN_ERROR_CODES = ['22023', 'P0002', '42501'];

function payErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  if (code && message && KNOWN_ERROR_CODES.includes(code)) {
    return message;
  }
  return '결제 처리 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.';
}

// 회차 시간 알약 (공연). 고른 날짜에 열리는 시간들을 옆으로 늘어놓고 하나를 고른다.
// 고른 것은 달력에서 고른 날과 똑같이 골드로 채워서, 같은 "선택" 표시로 읽히게 맞춘다.
//
// 매진된 회차도 지우지 않고 흐리게 남겨둔다 — "이 시간대는 원래 없다"와 "있는데 다 나갔다"는
// 사용자에게 다른 정보라서, 아예 감추면 왜 못 고르는지 알 수 없다.
function TimeChip({
  label,
  remaining,
  selected,
  onPress,
  theme,
}: {
  label: string;
  remaining: number;
  selected: boolean;
  onPress: () => void;
  theme: ThemeColors;
}) {
  const soldOut = remaining <= 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={soldOut}
      style={[
        styles.timeChip,
        { borderColor: theme.dashedBorder },
        selected && styles.timeChipOn,
        soldOut && styles.timeChipSoldOut,
      ]}>
      <Text style={[styles.timeChipText, { color: theme.text }, selected && styles.timeChipTextOn]}>
        {label}
      </Text>
      <Text
        style={[
          styles.timeChipMeta,
          { color: theme.textSecondary },
          selected && styles.timeChipTextOn,
        ]}>
        {soldOut ? '매진' : `${remaining.toLocaleString('ko-KR')}석`}
      </Text>
    </Pressable>
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

  // 관람일/회차 고르기
  whenBlock: {
    paddingHorizontal: 4,
    gap: 4,
  },
  sectionHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  emptyWhen: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // 회차 시간 알약들 (한 줄에 다 안 들어가면 다음 줄로 넘어간다)
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
  },
  timeChip: {
    borderWidth: 1,
    borderRadius: 8, // radius-button
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  timeChipOn: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  timeChipSoldOut: {
    opacity: 0.4,
  },
  timeChipText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  timeChipMeta: {
    fontFamily: Fonts.regular,
    fontSize: 11,
  },
  timeChipTextOn: {
    color: Colors.textOnColor,
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
