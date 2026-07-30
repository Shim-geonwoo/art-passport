// 마이페이지 > 리워드 (하위 화면)
//
// 여권 스탬프 진행도(+ 여권 바로가기)와 보유 쿠폰(상태 필터)을 보여준다.
// 스탬프 진행도는 data/bookings.ts에서, 쿠폰은 실제 coupons 테이블(data/coupons.ts)에서 받는다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { RefreshErrorBanner } from '@/components/refresh-error-banner';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { passportPageInfo, STAMPS_PER_PAGE } from '@/data/bookings';
import { Coupon, couponStatus, CouponStatus } from '@/data/coupons';
import { formatDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useRefreshing } from '@/hooks/use-refreshing';

// 쿠폰 상태별 뱃지 색 (사용가능=골드, 사용완료/만료=회색)
const COUPON_STATUS_COLOR: Record<CouponStatus, string> = {
  사용가능: Colors.gold,
  사용완료: Colors.textSecondary,
  만료: Colors.textSecondary,
};

// 쿠폰 상태 필터. '전체'는 굳이 안 보여줘도 되어서 뺐다.
type CouponFilter = CouponStatus;
const COUPON_FILTERS: CouponFilter[] = ['사용가능', '사용완료', '만료'];

export default function RewardsScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const now = useNow();
  const [couponFilter, setCouponFilter] = useState<CouponFilter>('사용가능');

  const { bookings, coupons: allCoupons, error, refresh } = useBookings();

  // 당겨서 새로고침. 이 화면에서 특히 중요한 이유는, 스탬프 9개를 채웠을 때의 쿠폰 발급
  // (issue_due_coupons)이 바로 이 갱신 안에서 일어나기 때문이다 — 크론이 없어서
  // "다음에 목록을 새로 받을 때" 발급되는 구조다. 여기서 당기면 그 자리에서 받아온다.
  const { isRefreshing, onRefresh } = useRefreshing(refresh);

  // 상태는 저장된 값이 아니라 지금 시각 기준으로 계산한다(만료는 시각이 지나면 그 순간부터다)
  const coupons = allCoupons.filter((c) => couponStatus(c, now) === couponFilter);

  const pageInfo = passportPageInfo(bookings, now);
  // 현재 페이지에 채워진 스탬프 수 (딱 9의 배수면 9/9로 표시)
  const filledInPage =
    pageInfo.totalStamps > 0 && pageInfo.totalStamps % STAMPS_PER_PAGE === 0
      ? STAMPS_PER_PAGE
      : pageInfo.totalStamps % STAMPS_PER_PAGE;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="리워드" color={theme.text} />

      {/* 갱신 실패 안내. 여긴 쿠폰을 보는 화면이라 조용히 넘어가면 "받아야 할 쿠폰이 없다"로
          읽힌다 — 발급이 이 갱신 안에서 일어나기 때문에 더 그렇다. (예매관리 화면과 같은 처리) */}
      {error ? <RefreshErrorBanner message={error} onRetry={refresh} theme={theme} /> : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.text} // iOS 스피너
            colors={[theme.text]} // Android 스피너
            progressBackgroundColor={theme.background} // Android 스피너 뒤 원판
          />
        }>
        {/* 스탬프 진행도 + 여권 바로가기 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <View style={styles.progressRow}>
            <Text style={[styles.label, { color: theme.text }]}>스탬프 진행도</Text>
            <Text style={[styles.stampValue, { color: theme.text }]}>
              {filledInPage} / {STAMPS_PER_PAGE}
            </Text>
          </View>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            총 {pageInfo.totalStamps}개 관람 · 다음 쿠폰까지 {pageInfo.slotsUntilNextCoupon}칸
          </Text>
          {/* 여권 탭으로 건너뛴다 (탭 이동은 push가 아니라 navigate — 위 두 곳과 같은 이유) */}
          <Pressable style={styles.passportButton} onPress={() => router.navigate('/passport')}>
            <Ionicons name="book-outline" size={16} color={Colors.textOnColor} />
            <Text style={styles.passportButtonText}>여권에서 스탬프 보기</Text>
          </Pressable>
        </View>

        {/* 보유 쿠폰 + 상태 필터 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>보유 쿠폰</Text>

        <View style={styles.chipRow}>
          {COUPON_FILTERS.map((status) => {
            const count = allCoupons.filter((c) => couponStatus(c, now) === status).length;
            const selected = status === couponFilter;
            return (
              <Pressable
                key={status}
                onPress={() => setCouponFilter(status)}
                style={[
                  styles.chip,
                  { borderColor: theme.dashedBorder },
                  selected && { backgroundColor: Colors.navy, borderColor: Colors.navy },
                ]}>
                <Text
                  style={[styles.chipText, { color: selected ? Colors.textOnColor : theme.textSecondary }]}>
                  {status} {count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {coupons.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>해당하는 쿠폰이 없어요.</Text>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            {coupons.map((coupon, index) => (
              <View key={coupon.id}>
                {index > 0 && <View style={[styles.divider, { backgroundColor: theme.dashedBorder }]} />}
                <CouponRow coupon={coupon} now={now} theme={theme} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CouponRow({ coupon, now, theme }: { coupon: Coupon; now: Date; theme: ThemeColors }) {
  const status = couponStatus(coupon, now);

  // 유효기간 안내. 이미 쓴 쿠폰엔 붙이지 않는다 — 그때는 남은 기간이 의미가 없다.
  const periodText =
    status === '사용가능'
      ? ` · ${formatDate(coupon.expiresAt)}까지`
      : status === '만료'
        ? ` · ${formatDate(coupon.expiresAt)} 만료`
        : '';

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{coupon.benefit}</Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
          {coupon.discountRate}% 할인{periodText}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: COUPON_STATUS_COLOR[status] }]}>
        <Text style={styles.badgeText}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  stampValue: {
    fontFamily: Fonts.bold,
    fontSize: 20,
  },
  caption: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    paddingTop: 4,
  },
  // 여권 바로가기 버튼
  passportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    backgroundColor: Colors.navy,
    borderRadius: 10,
    paddingVertical: 12,
  },
  passportButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textOnColor,
  },

  sectionTitle: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },

  // 쿠폰 상태 필터 칩
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },

  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  divider: {
    height: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  rowMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
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
});
