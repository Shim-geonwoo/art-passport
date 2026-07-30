// 목록 위에 얹는 얇은 안내 줄 — "새로 못 받아왔다"를 알리고 다시 시도하게 한다.
//
// LoadError(전체 화면)와 역할이 다르다:
//   LoadError          : 처음부터 못 불러와서 보여줄 게 아예 없을 때. 화면을 통째로 차지한다.
//   RefreshErrorBanner : 예전에 받아둔 목록은 있는데 갱신에 실패했을 때. 목록은 그대로 두고
//                        위에 한 줄만 얹는다.
//
// 뒤쪽이 중요한 이유: 갱신 실패로 화면을 뺏으면 이미 보고 있던 티켓까지 사라진다.
// 그렇다고 조용히 넘어가면 "방금 예매했는데 목록에 없다"를 사용자가 오해하게 된다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

type Props = {
  message: string;
  onRetry: () => void;
  theme: ThemeColors;
};

export function RefreshErrorBanner({ message, onRetry, theme }: Props) {
  return (
    <View style={[styles.banner, { backgroundColor: theme.emptyCellBackground }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={theme.textSecondary} />
      <Text style={[styles.message, { color: theme.textSecondary }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        {/* 글씨색을 테마에서 가져온다. 예전엔 navy로 고정돼 있었는데, 다크 모드에서는
            배너 바탕(emptyCellBackground #242426) 위에 navy(#1B2A4A)가 얹혀서 거의 안 보였다 —
            하필 "다시 시도"가 이 배너에서 유일하게 누를 수 있는 곳이다.
            라이트 모드의 theme.text는 그대로 navy라 보이던 모습은 달라지지 않는다. */}
        <Text style={[styles.retry, { color: theme.text }]}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // sm
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    flex: 1, // 남는 폭을 차지해서 "다시 시도"를 오른쪽 끝으로 민다
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  retry: {
    fontFamily: Fonts.medium,
    fontSize: 12,
    textDecorationLine: 'underline', // color는 theme.text를 인라인으로 적용 (라이트/다크 대응)
  },
});
