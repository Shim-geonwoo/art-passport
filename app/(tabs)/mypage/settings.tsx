// 마이페이지 > 설정 (하위 화면)
//
// 화면 테마(시스템/라이트/다크)를 고른다. 선택은 contexts/theme-preference.tsx에 저장되고,
// useColorScheme이 그 값을 참고해 앱 전체 색이 바뀐다.
// 계정 관련(로그아웃/회원 탈퇴)도 여기 모아둔다.

import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { ThemePreference, useThemePreference } from '@/contexts/theme-preference';
import { useColorScheme } from '@/hooks/use-color-scheme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const { preference, setPreference } = useThemePreference();
  const { signOut, deleteAccount } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  // 되돌릴 수 없는 동작이라 반드시 한 번 확인을 받는다.
  // (react-native-web은 Alert.alert가 아무 일도 안 해서, 웹에선 window.confirm으로 대신한다 —
  //  여기서 확인을 건너뛰면 웹에서 버튼 한 번에 계정이 지워진다)
  function confirmDelete(): Promise<boolean> {
    const title = '정말 탈퇴하시겠어요?';
    const body = '예매 내역과 쿠폰, 여권 스탬프가 모두 사라지고 되돌릴 수 없어요.';

    if (Platform.OS === 'web') {
      return Promise.resolve(window.confirm(`${title}\n\n${body}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, body, [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '탈퇴하기', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  }

  async function handleDeleteAccount() {
    if (isDeleting || !(await confirmDelete())) {
      return;
    }

    setIsDeleting(true);
    const { error } = await deleteAccount();
    setIsDeleting(false);

    if (error) {
      const message = `탈퇴 처리에 실패했어요. (${error})`;
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('탈퇴 실패', message);
      }
    }
    // 성공하면 세션이 사라지면서 app/_layout.tsx의 가드가 로그인 화면으로 되돌린다.
    // 이 화면은 그때 사라지므로 따로 이동시키지 않는다.
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="설정" color={theme.text} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
          <Text style={[styles.label, { color: theme.text }]}>화면 테마</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  style={[
                    styles.segmentItem,
                    { borderColor: theme.dashedBorder },
                    selected && { backgroundColor: Colors.navy, borderColor: Colors.navy },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      { color: selected ? Colors.textOnColor : theme.textSecondary },
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            &apos;시스템&apos;은 기기 설정을 따릅니다.
          </Text>
        </View>

        <Pressable style={[styles.logoutButton, { borderColor: theme.dashedBorder }]} onPress={signOut}>
          <Text style={[styles.logoutText, { color: theme.textSecondary }]}>로그아웃</Text>
        </Pressable>

        {/* 회원 탈퇴. 눌러도 바로 지워지지 않고 확인을 한 번 더 받는다.
            디자인 시스템에 경고색(빨강)이 없어서 로그아웃과 같은 차분한 스타일을 쓰고,
            대신 아래 설명과 확인 창으로 무게를 준다. */}
        <Pressable
          style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          hitSlop={8}>
          <Text style={[styles.deleteText, { color: theme.textSecondary }]}>
            {isDeleting ? '탈퇴 처리 중...' : '회원 탈퇴'}
          </Text>
        </Pressable>
        <Text style={[styles.deleteCaption, { color: theme.textSecondary }]}>
          탈퇴하면 예매 내역과 쿠폰, 여권 스탬프가 모두 사라집니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
  label: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    marginBottom: 12,
  },
  segment: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  caption: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    paddingTop: 12,
  },
  logoutButton: {
    marginTop: 20, // lg
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  // 회원 탈퇴: 실수로 누르지 않게 테두리 없는 글자 버튼으로, 로그아웃보다 한 단계 약하게 둔다
  deleteButton: {
    marginTop: 20, // lg
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  deleteCaption: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 4,
  },
});
