// 비밀번호 찾기 화면 (이메일로 6자리 코드 → 새 비밀번호)
//
// 왜 코드 방식인가: 메일 링크(딥링크) 방식은 앱을 다시 열어야 하고 웹에서는 따로 처리해야 한다.
// 코드를 옮겨 적는 방식은 네이티브·웹에서 똑같이 동작하고, 실기기 없이도 확인할 수 있다.
// (Supabase 대시보드에서 'Reset Password' 메일 템플릿에 {{ .Token }}이 들어 있어야 코드가 온다)
//
// 두 단계를 한 화면에서 처리한다:
//   1) 이메일 입력 → 코드 발송
//   2) 코드 + 새 비밀번호 입력 → 확인 후 변경
//
// 성공하면 그대로 로그인된 상태가 되어, app/_layout.tsx가 알아서 (tabs)로 넘겨준다.

import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { TextField } from '@/components/text-field';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MIN_PASSWORD_LENGTH = 6; // Supabase Auth 기본 최소 길이 (회원가입 화면과 같은 값)
const CODE_LENGTH = 6;

// Supabase 원문 에러에 자주 나오는 것들만 한글 안내로 바꿔준다.
function describeResetError(message: string): string {
  if (message.includes('expired') || message.includes('invalid')) {
    return '코드가 올바르지 않거나 만료됐어요. 코드를 다시 받아주세요.';
  }
  if (message.includes('same password')) {
    return '지금 쓰고 있는 비밀번호와 달라야 해요.';
  }
  return `처리에 실패했어요. (${message})`;
}

export default function ResetPasswordScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;
  const { sendPasswordResetCode, confirmPasswordReset } = useAuth();

  // 'email' = 코드 받기 전, 'code' = 코드와 새 비밀번호 입력 중
  const [step, setStep] = useState<'email' | 'code'>('email');

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1단계: 입력한 이메일로 코드를 보낸다.
  // 그 이메일로 가입한 계정이 없어도 Supabase는 성공으로 응답한다(가입 여부가 새어나가지 않게).
  // 그래서 안내 문구도 "계정이 있다면 보냈다"는 식으로 적는다.
  async function handleSendCode() {
    if (!email.trim()) {
      setError('가입한 이메일을 입력해주세요.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const { error: sendError } = await sendPasswordResetCode(email.trim());
    setIsSubmitting(false);

    if (sendError) {
      setError(describeResetError(sendError));
      return;
    }
    setStep('code');
    setNotice('그 이메일로 가입한 계정이 있다면 6자리 코드를 보냈어요.');
  }

  // 2단계: 코드 확인 + 비밀번호 변경.
  // 형식 검사를 먼저 다 끝내는 게 중요하다 — 코드가 확인되는 순간 로그인 상태가 되면서
  // 이 화면이 사라지기 때문에, 그 뒤에 "비밀번호가 짧아요" 같은 걸 띄울 자리가 없다.
  async function handleConfirm() {
    if (code.trim().length !== CODE_LENGTH) {
      setError(`메일로 받은 ${CODE_LENGTH}자리 코드를 입력해주세요.`);
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
    const { error: confirmError } = await confirmPasswordReset(email.trim(), code.trim(), password);
    setIsSubmitting(false);

    if (confirmError) {
      // 코드 확인까지 통과한 뒤에 실패했다면 이 화면은 이미 사라졌을 수 있다.
      // 그때도 사용자가 알 수 있게 화면 문구가 아니라 알림창으로 알린다.
      const message = describeResetError(confirmError);
      setError(message);
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('비밀번호 변경 실패', message);
      }
      return;
    }
    // 성공하면 세션이 생기면서 app/_layout.tsx가 (tabs)로 넘겨준다 — 여기서 따로 이동시키지 않는다.
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="비밀번호 찾기" color={theme.text} />

      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {step === 'email'
            ? '가입한 이메일로 6자리 코드를 보내드려요.'
            : '메일로 받은 코드와 새 비밀번호를 입력해주세요.'}
        </Text>

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
            editable={step === 'email'} // 코드를 받은 뒤엔 못 바꾼다 (코드는 이 주소로 발급된 것이라)
          />

          {step === 'code' ? (
            <>
              <TextField
                label={`인증 코드 (${CODE_LENGTH}자리)`}
                theme={theme}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
              />
              <TextField
                label="새 비밀번호"
                theme={theme}
                value={password}
                onChangeText={setPassword}
                placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
                secureTextEntry
              />
              <TextField
                label="새 비밀번호 확인"
                theme={theme}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="비밀번호 다시 입력"
                secureTextEntry
              />
            </>
          ) : null}

          {error ? <Text style={[styles.error, { color: theme.textSecondary }]}>{error}</Text> : null}
          {notice ? <Text style={[styles.notice, { color: theme.text }]}>{notice}</Text> : null}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={step === 'email' ? handleSendCode : handleConfirm}
            disabled={isSubmitting}>
            <Text style={styles.submitButtonText}>
              {isSubmitting
                ? '처리 중...'
                : step === 'email'
                  ? '코드 받기'
                  : '비밀번호 변경'}
            </Text>
          </Pressable>

          {/* 코드가 안 왔을 때를 위해 다시 받을 수 있게 한다 */}
          {step === 'code' ? (
            <Pressable onPress={handleSendCode} disabled={isSubmitting} hitSlop={8}>
              <Text style={[styles.resendText, { color: theme.textSecondary }]}>
                코드가 안 왔나요? 다시 받기
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Text style={[styles.linkText, { color: theme.textSecondary }]}>
            비밀번호가 기억났나요? <Text style={styles.linkHighlight}>로그인</Text>
          </Text>
        </Pressable>
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
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
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
    textAlign: 'center',
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
