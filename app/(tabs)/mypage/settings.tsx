// 마이페이지 > 설정 (하위 화면)
//
// 화면 테마(시스템/라이트/다크)를 고른다. 선택은 contexts/theme-preference.tsx에 저장되고,
// useColorScheme이 그 값을 참고해 앱 전체 색이 바뀐다.

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
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
});
