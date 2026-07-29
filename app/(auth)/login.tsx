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
  const { signIn, resendConfirmation } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // 이메일 인증이 안 돼서 로그인이 막힌 경우에만 "인증 메일 다시 보내기"를 띄운다
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setError(null);
    setNotice(null);
    setNeedsConfirmation(false);
    setIsSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setIsSubmitting(false);
    if (signInError) {
      setError(describeSignInError(signInError));
      setNeedsConfirmation(signInError.includes('Email not confirmed'));
    }
  }

  // 인증 메일 다시 보내기. 메일을 못 받으면 그 계정으로는 로그인할 방법이 없어서 필요하다.
  async function handleResend() {
    setIsResending(true);
    const { error: resendError } = await resendConfirmation(email.trim());
    setIsResending(false);
    if (resendError) {
      setError(`메일을 다시 보내지 못했어요. (${resendError})`);
      return;
    }
    setError(null);
    setNotice('인증 메일을 다시 보냈어요. 메일함을 확인해주세요.');
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
          {notice ? <Text style={[styles.error, { color: theme.text }]}>{notice}</Text> : null}

          {needsConfirmation ? (
            <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
              <Text style={[styles.resendText, { color: theme.textSecondary }]}>
                {isResending ? '보내는 중...' : '인증 메일 다시 보내기'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}>
            <Text style={styles.submitButtonText}>{isSubmitting ? '로그인 중...' : '로그인'}</Text>
          </Pressable>

          {/* 비밀번호를 잊으면 그 계정으로 들어갈 방법이 없어지므로, 로그인 바로 아래에 둔다 */}
          <Link href="/(auth)/reset-password" asChild>
            <Pressable hitSlop={8}>
              <Text style={[styles.forgotText, { color: theme.textSecondary }]}>
                비밀번호를 잊으셨나요?
              </Text>
            </Pressable>
          </Link>
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
  resendText: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  forgotText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 4,
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
