// 마이페이지 허브 화면
//
// 여기엔 프로필과 "메뉴"만 둔다. 실제 내용(예매 목록/쿠폰/설정)은 항목을 누르면
// 각 하위 화면으로 들어가서 본다. (한 페이지에 다 넣지 않아 깔끔하게 유지)

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { deriveAllBookings, deriveCoupons, passportPageInfo } from '@/data/dummy-bookings';
import { useColorScheme } from '@/hooks/use-color-scheme';

const NICKNAME = '심건우';

export default function MyPageHomeScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const [now] = useState(() => new Date());

  // 메뉴 옆에 살짝 보여줄 요약값 계산
  const { bookings } = useBookings();

  const bookingCount = deriveAllBookings(bookings, now).length;
  const pageInfo = passportPageInfo(bookings, now);
  const availableCouponCount = deriveCoupons(bookings, now).filter(
    (c) => c.status === '사용가능'
  ).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 프로필 */}
        <View style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: theme.emptyCellBackground }]}>
            <Ionicons name="person-outline" size={28} color={theme.textSecondary} />
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.nickname, { color: theme.text }]}>{NICKNAME}</Text>
            <Text style={[styles.profileSub, { color: theme.textSecondary }]}>
              관람 {pageInfo.totalStamps} · 쿠폰 {availableCouponCount}
            </Text>
          </View>
        </View>

        {/* 메뉴 카드 */}
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <MenuRow
            label="예매관리"
            hint={`${bookingCount}건`}
            theme={theme}
            onPress={() => router.push('/mypage/bookings')}
          />
          <Divider theme={theme} />
          <MenuRow
            label="리워드"
            hint={`쿠폰 ${availableCouponCount}`}
            theme={theme}
            onPress={() => router.push('/mypage/rewards')}
          />
          <Divider theme={theme} />
          <MenuRow label="설정" theme={theme} onPress={() => router.push('/mypage/settings')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// 메뉴 한 줄: 왼쪽 라벨 + 오른쪽 요약값 + 화살표. 누르면 하위 화면으로 이동한다
function MenuRow({
  label,
  hint,
  theme,
  onPress,
}: {
  label: string;
  hint?: string;
  theme: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {hint ? <Text style={[styles.menuHint, { color: theme.textSecondary }]}>{hint}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
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

  // 프로필
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    gap: 4,
  },
  nickname: {
    fontFamily: Fonts.medium,
    fontSize: 20,
  },
  profileSub: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },

  // 메뉴 카드
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 0.5,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  menuLabel: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuHint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
});
