// 라벨(위) + 테두리 입력창 한 쌍. 로그인/회원가입 화면에서 공통으로 쓴다.

import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

export function TextField({
  label,
  theme,
  ...inputProps
}: { label: string; theme: ThemeColors } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.dashedBorder }]}
        placeholderTextColor={theme.textSecondary}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6, // xs
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
});
