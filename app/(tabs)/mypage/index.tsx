// 마이페이지 허브 화면
//
// 여기엔 프로필과 "메뉴"만 둔다. 실제 내용(예매 목록/쿠폰/설정)은 항목을 누르면
// 각 하위 화면으로 들어가서 본다. (한 페이지에 다 넣지 않아 깔끔하게 유지)

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useBookings } from '@/contexts/bookings';
import { deriveAllBookings, passportPageInfo } from '@/data/bookings';
import { isCouponUsable } from '@/data/coupons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useRefreshing } from '@/hooks/use-refreshing';

export default function MyPageHomeScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  // 프로필(public.users)에서 닉네임을 읽는다. 아직 안 불러왔으면 기본값으로 대체한다.
  // isAdmin은 아래 관리자 메뉴를 띄울지 정하는 데만 쓴다(권한 자체는 DB가 판단한다).
  const { profile, isAdmin } = useAuth();
  const nickname = profile?.nickname || '사용자';

  const now = useNow();

  // 메뉴 옆에 살짝 보여줄 요약값 계산
  const { bookings, coupons, refresh } = useBookings();

  // 당겨서 새로고침. 여기 요약값(관람 N · 쿠폰 N)도 같은 목록에서 나오므로 함께 갱신된다.
  // 갱신 실패 안내(RefreshErrorBanner)는 일부러 안 붙였다 — 이 화면은 메뉴일 뿐이고,
  // 실제 내용을 보는 하위 화면(예매관리·리워드)이 각자 배너를 갖고 있다.
  const { isRefreshing, onRefresh } = useRefreshing(refresh);

  const bookingCount = deriveAllBookings(bookings, now).length;
  const pageInfo = passportPageInfo(bookings, now);
  const availableCouponCount = coupons.filter((c) => isCouponUsable(c, now)).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
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
        {/* 프로필 (누르면 프로필 편집으로) */}
        <Pressable style={styles.profile} onPress={() => router.push('/mypage/profile')}>
          <View style={[styles.avatar, { backgroundColor: theme.emptyCellBackground }]}>
            {profile?.profileImage ? (
              <Image source={{ uri: profile.profileImage }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={28} color={theme.textSecondary} />
            )}
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.nickname, { color: theme.text }]}>{nickname}</Text>
            <Text style={[styles.profileSub, { color: theme.textSecondary }]}>
              관람 {pageInfo.totalStamps} · 쿠폰 {availableCouponCount}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>

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

        {/* 관리자 메뉴. 관리자 계정에서만 나타난다.
            일반 사용자에게는 이 카드 자체가 없어서 앱이 지금과 똑같아 보인다.
            메뉴를 감추는 건 편의일 뿐이고, 실제 차단은 DB의 RLS가 한다 —
            그래서 이 값 조회에 실패해도(=false로 떨어져도) 위험한 쪽으로 틀리지 않는다.

            다른 메뉴와 카드를 나눠 둔 이유: 예매관리·리워드·설정은 모든 사용자의 것이고
            여기는 운영자의 자리라, 한 덩어리로 붙여두면 성격이 섞여 보인다. */}
        {isAdmin ? (
          <View style={[styles.card, styles.adminCard, { backgroundColor: theme.emptyCellBackground }]}>
            <MenuRow
              label="관리자"
              hint="공연 관리"
              theme={theme}
              onPress={() => router.push('/mypage/admin')}
            />
          </View>
        ) : null}
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
    overflow: 'hidden', // 사진이 원 밖으로 삐져나오지 않게
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileText: {
    flex: 1, // 남는 가로 공간을 차지해 오른쪽 화살표를 끝으로 민다
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
  // 관리자 카드는 위 메뉴 카드와 성격이 달라서 사이를 띄운다 (여백은 4의 배수)
  adminCard: {
    marginTop: 12,
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
