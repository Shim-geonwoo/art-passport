// 데이터를 못 불러왔을 때 보여주는 전체 화면 안내 + "다시 시도" 버튼.
//
// 왜 필요한가: 네트워크가 끊기거나 서버가 응답을 안 하면 조회가 실패하는데, 그때 아무 표시도
// 없으면 화면이 "예매가 0건인 상태"와 똑같이 보인다. 사용자는 데이터가 없는 건지 못 불러온 건지
// 알 수 없고, 다시 시도할 방법도 없다. 그래서 실패를 실패라고 말해주고 재시도 버튼을 준다.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  message: string;
  onRetry: () => void;
};

export function LoadError({ message, onRetry }: Props) {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        네트워크 상태를 확인한 뒤 다시 시도해주세요.
      </Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  message: {
    fontFamily: Fonts.medium,
    fontSize: 16,
    textAlign: 'center',
  },
  hint: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16, // md
    backgroundColor: Colors.navy,
    borderRadius: 8, // radius-button
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 15,
    color: Colors.textOnColor,
  },
});
