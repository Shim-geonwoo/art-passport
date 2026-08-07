// 회차 입력 폼 (날짜 · 시각 · 정원)
//
// 두 화면이 같이 쓴다:
//   admin-schedules  이미 있는 공연의 회차를 추가·수정한다 (DB에 바로 쓴다)
//   admin-event      새 공연을 등록하면서 회차를 미리 담아둔다 (저장할 때 함께 만든다)
//
// 두 번째가 별도로 필요한 이유: 회차는 event_id가 있어야 만들 수 있어서, 공연이 저장되기 전에는
// DB에 넣을 수 없다. 그래서 등록 화면은 회차를 화면에 모아뒀다가 공연을 만든 직후에 함께 넣는다.
// 채우는 칸은 두 경우가 똑같아서 폼을 나누지 않았다.
//
// 검사는 여기서 하지 않는다. 부르는 쪽이 validateScheduleDraft(data/admin.ts)로 확인한다 —
// "이미 판 매수보다 정원을 낮출 수 없다"처럼 폼이 알 수 없는 사정이 섞여 있기 때문이다.

import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CategoryColors, Colors, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { AdminScheduleDraft } from '@/data/admin';
import { formatDateInput, formatTimeInput } from '@/data/schedule';

// id가 null이면 "새 회차", 값이 있으면 그 회차를 고치는 중이다.
export type ScheduleFormState = AdminScheduleDraft & { id: string | null };

export function ScheduleForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  onDelete,
  soldCount,
  isBusy,
  theme,
  title,
  submitLabel,
}: {
  form: ScheduleFormState;
  onChange: (form: ScheduleFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  soldCount?: number;
  isBusy: boolean;
  theme: ThemeColors;
  title: string;
  submitLabel: string;
}) {
  return (
    <View style={[styles.form, { borderColor: Colors.navy }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{title}</Text>

      <View style={styles.formRow}>
        <FormField
          label="날짜"
          value={form.date}
          onChangeText={(date) => onChange({ ...form, date: formatDateInput(date) })}
          placeholder="20260814"
          theme={theme}
          flex={2}
        />
        <FormField
          label="시각"
          value={form.time}
          onChangeText={(time) => onChange({ ...form, time: formatTimeInput(time) })}
          placeholder="1930"
          theme={theme}
          flex={1}
        />
      </View>

      <FormField
        label="정원 (석)"
        value={form.capacity}
        onChangeText={(capacity) => onChange({ ...form, capacity })}
        placeholder="1200"
        theme={theme}
      />

      {/* 이미 판 표가 있으면 정원을 그 아래로 내릴 수 없다. 저장을 눌러 알기 전에 미리 적어둔다 */}
      {soldCount ? (
        <Text style={[styles.formHint, { color: theme.textSecondary }]}>
          이미 {soldCount}매가 팔려서 정원을 그보다 줄일 수 없어요.
        </Text>
      ) : null}

      <View style={styles.formButtons}>
        <Pressable
          style={[styles.formSubmit, isBusy && styles.disabled]}
          onPress={onSubmit}
          disabled={isBusy}
          accessibilityRole="button">
          <Text style={styles.formSubmitText}>{isBusy ? '처리 중...' : submitLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.formQuiet, { borderColor: theme.dashedBorder }]}
          onPress={onCancel}
          disabled={isBusy}
          accessibilityRole="button">
          <Text style={[styles.formQuietText, { color: theme.textSecondary }]}>취소</Text>
        </Pressable>
        {onDelete ? (
          <Pressable
            style={[styles.formQuiet, { borderColor: CategoryColors['연극'] }]}
            onPress={onDelete}
            disabled={isBusy}
            accessibilityRole="button">
            <Text style={[styles.formQuietText, { color: CategoryColors['연극'] }]}>삭제</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// 폼 안의 입력칸 하나 (라벨 + TextInput). 날짜와 시각을 한 줄에 나눠 놓으려고 flex를 받는다.
// 세 칸 모두 숫자만 받는다 — 구분자는 위 두 함수가 넣는다.
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  theme: ThemeColors;
  flex?: number;
}) {
  return (
    <View style={flex ? { flex } : undefined}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor: theme.dashedBorder,
            backgroundColor: theme.emptyCellBackground,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        // 웹에서는 number-pad가 문자 입력을 막지 않아서, 붙여넣기까지 감안해 위 함수들이 걸러낸다
        inputMode={Platform.OS === 'web' ? 'numeric' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 목록 줄과 구분되게 테두리를 네이비로 두른다
  form: {
    borderWidth: 0.5,
    borderRadius: 10, // 보딩패스류 radius
    padding: 12,
    gap: 8,
  },
  formTitle: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formHint: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldLabel: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },

  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  formSubmit: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSubmitText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textOnColor,
  },
  formQuiet: {
    height: 40,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formQuietText: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.6,
  },
});
