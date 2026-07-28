// 로그인 화면 (이메일 + 비밀번호)
//
// 로그인에 성공하면 이 화면이 직접 다음 화면으로 이동시키지 않는다.
// app/_layout.tsx가 세션 유무로 (auth)/(tabs) 그룹을 자동으로 바꿔 보여주기 때문이다.

import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-field';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Supabase가 돌려주는 원문 에러를 화면에 그대로 노출한다(디버깅에 필요).
// 자주 나오는 두 가지만 한글로 안내를 덧붙인다.
function describeSignInError(message: string): string {
  if (message.includes('Email not confirmed')) {
    return '이메일 인증이 아직 안 됐어요. 메일함에서 인증 링크를 눌러주세요.';
  }
  if (message.includes('Invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않아요.';
  }
  return `로그인에 실패했어요. (${message})`;
}

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setIsSubmitting(false);
    if (signInError) {
      setError(describeSignInError(signInError));
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.text }]}>ART PASSPORT</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            로그인하고 예매를 시작하세요
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="이메일"
            theme={theme}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextField
            label="비밀번호"
            theme={theme}
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            secureTextEntry
          />

          {error ? <Text style={[styles.error, { color: theme.textSecondary }]}>{error}</Text> : null}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}>
            <Text style={styles.submitButtonText}>{isSubmitting ? '로그인 중...' : '로그인'}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/signup" asChild>
          <Pressable hitSlop={8}>
            <Text style={[styles.linkText, { color: theme.textSecondary }]}>
              계정이 없으신가요? <Text style={styles.linkHighlight}>회원가입</Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  header: {
    gap: 8, // sm
    alignItems: 'center',
  },
  logo: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  form: {
    gap: 16, // md
  },
  error: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: Colors.navy,
    borderRadius: 8, // radius-button
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    color: Colors.textOnColor,
  },
  linkText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  linkHighlight: {
    fontFamily: Fonts.medium,
    color: Colors.gold,
  },
});
