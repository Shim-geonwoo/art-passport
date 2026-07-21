// 마이페이지 > 리워드 (하위 화면)
//
// 여권 스탬프 진행도(+ 여권 바로가기)와 보유 쿠폰(상태 필터)을 보여준다.
// 데이터는 data/dummy-bookings.ts에서 파생받는다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { Coupon, CouponStatus, deriveCoupons, passportPageInfo, STAMPS_PER_PAGE } from '@/data/dummy-bookings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 쿠폰 상태별 뱃지 색 (사용가능=골드, 사용완료/만료=회색)
const COUPON_STATUS_COLOR: Record<CouponStatus, string> = {
  사용가능: Colors.gold,
  사용완료: Colors.textSecondary,
  만료: Colors.textSecondary,
};

// 쿠폰 상태 필터 ('전체' + 세 가지 상태)
type CouponFilter = '전체' | CouponStatus;
const COUPON_FILTERS: CouponFilter[] = ['전체', '사용가능', '사용완료', '만료'];

export default function RewardsScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const now = useNow();
  const [couponFilter, setCouponFilter] = useState<CouponFilter>('전체');

  const { bookings } = useBookings();

  const allCoupons = deriveCoupons(bookings, now);
  const coupons = allCoupons.filter((c) => couponFilter === '전체' || c.status === couponFilter);

  const pageInfo = passportPageInfo(bookings, now);
  // 현재 페이지에 채워진 스탬프 수 (딱 9의 배수면 9/9로 표시)
  const filledInPage =
    pageInfo.totalStamps > 0 && pageInfo.totalStamps % STAMPS_PER_PAGE === 0
      ? STAMPS_PER_PAGE
      : pageInfo.totalStamps % STAMPS_PER_PAGE;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="리워드" color={theme.text} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
          <Pressable style={styles.passportButton} onPress={() => router.push('/passport')}>
            <Ionicons name="book-outline" size={16} color={Colors.textOnColor} />
            <Text style={styles.passportButtonText}>여권에서 스탬프 보기</Text>
          </Pressable>
        </View>

        {/* 보유 쿠폰 + 상태 필터 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>보유 쿠폰</Text>

        <View style={styles.chipRow}>
          {COUPON_FILTERS.map((status) => {
            const count =
              status === '전체' ? allCoupons.length : allCoupons.filter((c) => c.status === status).length;
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
                <CouponRow coupon={coupon} theme={theme} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CouponRow({ coupon, theme }: { coupon: Coupon; theme: ThemeColors }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{coupon.benefit}</Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>{coupon.discountRate}% 할인</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: COUPON_STATUS_COLOR[coupon.status] }]}>
        <Text style={styles.badgeText}>{coupon.status}</Text>
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
