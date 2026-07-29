// 회원가입 화면 (닉네임 + 이메일 + 비밀번호)
//
// 가입에 성공하고 세션이 바로 생기면(이메일 확인이 꺼져 있으면) app/_layout.tsx가
// 자동으로 (tabs)로 넘겨준다. 이메일 확인이 켜져 있으면 세션이 없어서, 안내 문구만 보여준다.

import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-field';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MIN_PASSWORD_LENGTH = 6; // Supabase Auth 기본 최소 길이

export default function SignupScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;
  const { signUp, resendConfirmation } = useAuth();

  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // 이메일 확인 안내(성공했지만 아직 로그인 전)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // 가입 확인 메일 다시 보내기. 가입 직후(notice가 떠 있을 때)만 쓰인다.
  async function handleResend() {
    setIsResending(true);
    const { error: resendError } = await resendConfirmation(email.trim());
    setIsResending(false);
    if (resendError) {
      setError(`메일을 다시 보내지 못했어요. (${resendError})`);
      return;
    }
    setError(null);
    setNotice('확인 메일을 다시 보냈어요. 메일함을 확인해주세요.');
  }

  async function handleSignup() {
    if (!nickname.trim() || !email.trim() || !password || !confirmPassword) {
      setError('모든 항목을 입력해주세요.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않아요.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(
      email.trim(),
      password,
      nickname.trim()
    );
    setIsSubmitting(false);

    if (signUpError) {
      setError('회원가입에 실패했어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (needsEmailConfirmation) {
      setNotice('가입 확인 메일을 보냈어요. 메일함에서 확인한 뒤 로그인해주세요.');
    }
    // 확인이 필요 없으면 세션이 바로 생겨서 app/_layout.tsx가 알아서 (tabs)로 넘겨준다
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.text }]}>ART PASSPORT</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            계정을 만들고 여권을 채워보세요
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="닉네임"
            theme={theme}
            value={nickname}
            onChangeText={setNickname}
            placeholder="여권에 표시될 이름"
            maxLength={20} // 프로필 편집 화면·DB 제약(users_nickname_not_blank)과 같은 상한
          />
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
            placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
            secureTextEntry
          />
          <TextField
            label="비밀번호 확인"
            theme={theme}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="비밀번호 다시 입력"
            secureTextEntry
          />

          {error ? <Text style={[styles.error, { color: theme.textSecondary }]}>{error}</Text> : null}
          {notice ? <Text style={[styles.notice, { color: theme.text }]}>{notice}</Text> : null}

          {/* 확인 메일이 안 왔거나 링크가 만료됐을 때를 위해 다시 보낼 수 있게 한다.
              (가입은 됐는데 메일을 못 받으면 그 계정으로는 더 나아갈 방법이 없다) */}
          {notice ? (
            <Pressable onPress={handleResend} disabled={isResending} hitSlop={8}>
              <Text style={[styles.resendText, { color: theme.textSecondary }]}>
                {isResending ? '보내는 중...' : '메일이 안 왔나요? 다시 보내기'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSignup}
            disabled={isSubmitting}>
            <Text style={styles.submitButtonText}>{isSubmitting ? '가입 중...' : '가입하기'}</Text>
          </Pressable>
        </View>

        <Link href="/(auth)/login" asChild>
          <Pressable hitSlop={8}>
            <Text style={[styles.linkText, { color: theme.textSecondary }]}>
              이미 계정이 있으신가요? <Text style={styles.linkHighlight}>로그인</Text>
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
    gap: 24,
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
    gap: 14,
  },
  error: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  notice: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    textAlign: 'center',
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
