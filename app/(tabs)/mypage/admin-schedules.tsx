// 마이페이지 > 관리자 > 공연 편집 > 회차 관리 (하위 화면)
//
// 공연 하나의 회차(날짜·시각·정원)를 만들고 고치고 지운다.
//
// 3단계까지 비어 있던 구멍이 여기서 막힌다. 공연을 등록해도 회차가 없으면 예매 탭에 아예 뜨지
// 않는데(create_booking이 회차를 요구한다), 그때까지 회차를 만들 방법이 앱에 없었다.
// 관리자 목록의 '회차 없음' 뱃지가 가리키던 곳이 이 화면이다.
//
// 전시(기간형)는 여기 올 일이 없다. 전시는 회차 행 자체가 없고 그 없음이 곧 기간형의 정의라,
// 관람일은 기간 안에서 고르고 정원도 없다. 다만 주소로 직접 들어올 수는 있어서 안내는 남겨둔다.
//
// 편집은 줄을 눌러 그 자리에서 펼치는 방식으로 했다. 회차가 가진 값은 세 개(날짜·시각·정원)뿐이라
// 화면을 하나 더 만들면 오가는 품이 더 든다. 한 번에 하나만 펼친다 — 여러 줄을 동시에 열어두면
// 저장 버튼이 무엇을 저장하는지 헷갈린다.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { LoadError } from '@/components/load-error';
import { CategoryColors, Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useEvents } from '@/contexts/events';
import {
  AdminEventItem,
  AdminScheduleDraft,
  AdminScheduleItem,
  SCHEDULE_IN_USE,
  createAdminSchedule,
  deleteAdminSchedule,
  fetchAdminEvent,
  fetchAdminSchedules,
  updateAdminSchedule,
  validateScheduleDraft,
} from '@/data/admin';
import { formatDate, formatMonthDayWeekday, formatTime, toDateKey } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

const LOAD_ERROR_MESSAGE = '회차를 불러오지 못했어요.';

// DB의 event_schedules.capacity 기본값과 같은 값. 첫 회차를 만들 때 미리 채워둔다.
const DEFAULT_CAPACITY = '100';

// 안내/실패 알림. 웹에서는 Alert.alert가 아무 일도 안 해서 window.alert로 대신한다.
// (app/(tabs)/mypage/admin-event.tsx와 같은 처리)
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

// 삭제처럼 되돌릴 수 없는 동작은 한 번 물어본다. 웹은 Alert.alert가 no-op이라 window.confirm을 쓴다
// (app/(tabs)/mypage/booking-detail.tsx의 예매 취소와 같은 방식).
function confirmDelete(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('이 회차를 지울까요?')) {
      onConfirm();
    }
    return;
  }
  Alert.alert('회차 삭제', '이 회차를 지울까요?', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

// 편집 중인 폼. id가 null이면 "새 회차 추가", 값이 있으면 그 회차를 고치는 중이다.
type FormState = AdminScheduleDraft & { id: string | null };

// 새 회차의 처음 값.
//
// 마지막 회차의 "다음 날 같은 시각, 같은 정원"으로 채운다. 공연 회차는 보통 며칠씩 이어져서
// 이렇게 두면 대개 손댈 곳이 없거나 날짜 하나만 고치면 된다.
// 회차가 하나도 없으면 공연 시작일(events.show_at)에서 시작한다 — 첫 회차는 보통 그 날이다.
function newScheduleForm(schedules: AdminScheduleItem[], event: AdminEventItem): FormState {
  const last = schedules[schedules.length - 1];
  if (last) {
    const next = new Date(last.startsAt);
    next.setDate(next.getDate() + 1);
    return {
      id: null,
      date: toDateKey(next),
      time: formatTime(next),
      capacity: String(last.capacity),
    };
  }
  return {
    id: null,
    date: toDateKey(event.showAt),
    time: formatTime(event.showAt),
    capacity: DEFAULT_CAPACITY,
  };
}

export default function AdminSchedulesScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const now = useNow();
  const { isAdmin } = useAuth();
  // 회차가 달라지면 예매 탭 카탈로그도 달라진다(그쪽은 events와 회차를 함께 받아온다).
  const { refresh: refreshCatalog } = useEvents();

  const [event, setEvent] = useState<AdminEventItem | null>(null);
  const [schedules, setSchedules] = useState<AdminScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    try {
      // 공연 정보도 같이 받는다. 제목을 보여주려는 것도 있지만, 전시인지 확인하고
      // 첫 회차를 만들 때 시작일을 미리 채우는 데 쓴다.
      const [loadedEvent, loadedSchedules] = await Promise.all([
        fetchAdminEvent(id),
        fetchAdminSchedules(id),
      ]);
      setEvent(loadedEvent);
      setSchedules(loadedSchedules);
      setError(null);
    } catch {
      setError(LOAD_ERROR_MESSAGE);
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  // 지금 고치고 있는 회차. 팔린 매수를 알아야 정원을 얼마 아래로는 못 내리는지 판단할 수 있다.
  const editing = form?.id ? schedules.find((s) => s.id === form.id) ?? null : null;

  const handleSave = useCallback(async () => {
    if (!form || !id) {
      return;
    }

    const result = validateScheduleDraft(form, schedules, editing);
    if ('error' in result) {
      notify('저장할 수 없어요', result.error);
      return;
    }

    setIsSaving(true);
    try {
      if (form.id) {
        await updateAdminSchedule(form.id, result.input);
      } else {
        await createAdminSchedule(id, result.input);
      }
      await load();
      await refreshCatalog();
      setForm(null);
    } catch {
      // 관리자가 아니면 서버가 여기서 거절한다(RLS). 화면을 감추는 것과 별개로 실제 차단은 DB가 한다.
      notify(
        '저장 실패',
        isAdmin ? '회차를 저장하지 못했어요.' : '관리자만 회차를 고칠 수 있어요.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [form, id, schedules, editing, load, refreshCatalog, isAdmin]);

  const handleDelete = useCallback(() => {
    if (!form?.id) {
      return;
    }
    const targetId = form.id;

    confirmDelete(async () => {
      setIsSaving(true);
      try {
        await deleteAdminSchedule(targetId);
        await load();
        await refreshCatalog();
        setForm(null);
      } catch (e) {
        // 예매가 달린 회차는 DB가 거절한다. 취소된 예매도 행은 남아 있어서 똑같이 막히는데,
        // 그 회차는 화면에 '판매 0'으로 보여서 이유를 말해주지 않으면 앱이 고장 난 줄 알게 된다.
        const inUse = e instanceof Error && e.message === SCHEDULE_IN_USE;
        notify(
          '삭제할 수 없어요',
          inUse
            ? '이 회차에 예매 기록이 있어요. 취소된 예매도 기록으로 남아서 지울 수 없어요. 대신 정원을 팔린 만큼으로 줄이면 더 팔리지 않아요.'
            : isAdmin
              ? '회차를 지우지 못했어요.'
              : '관리자만 회차를 지울 수 있어요.'
        );
      } finally {
        setIsSaving(false);
      }
    });
  }, [form, load, refreshCatalog, isAdmin]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="회차 관리" color={theme.text} />
        <ActivityIndicator style={styles.loading} color={theme.textSecondary} />
      </SafeAreaView>
    );
  }

  if (error && !event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="회차 관리" color={theme.text} />
        <LoadError message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="회차 관리" color={theme.text} />
        <Text style={[styles.notice, { color: theme.text }]}>공연 정보를 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  // 전시(기간형)는 회차가 없다. 여기까지 들어왔다면 주소로 직접 온 경우다.
  if (event.showEndAt) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
        <BackHeader title="회차 관리" color={theme.text} />
        <Text style={[styles.notice, { color: theme.text }]}>
          전시는 회차가 없어요. 관람일은 전시 기간 안에서 고르고, 정원도 없어요.
        </Text>
      </SafeAreaView>
    );
  }

  const upcomingCount = schedules.filter((s) => s.startsAt.getTime() > now.getTime()).length;
  const soldTotal = schedules.reduce((sum, s) => sum + s.soldCount, 0);

  // 카탈로그 정렬(events.show_at 기준)과 첫 회차가 어긋났는지.
  // 회차가 하나뿐일 때는 카탈로그 일정 표기도 show_at을 그대로 쓴다(data/events.ts의
  // formatEventSchedule). 그래서 어긋나면 예매 탭에 실제와 다른 날짜가 뜬다.
  const first = schedules[0];
  const startMismatch = first && toDateKey(first.startsAt) !== toDateKey(event.showAt);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="회차 관리" color={theme.text} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>
            회차 {schedules.length}개 · 남은 회차 {upcomingCount}개 · 판매 {soldTotal}매
          </Text>
        </View>

        {/* 회차가 하나도 없으면 이 공연은 예매 탭에 아예 안 뜬다. 그 사실을 제일 먼저 알린다 */}
        {schedules.length === 0 ? (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>회차가 없어요</Text>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              회차가 없는 공연은 예매 탭에 보이지 않아요. 회차를 하나 이상 추가해주세요.
            </Text>
          </View>
        ) : null}

        {startMismatch ? (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>시작일과 첫 회차가 달라요</Text>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              공연 시작일은 {formatDate(event.showAt)}인데 첫 회차는 {formatDate(first.startsAt)}
              예요. 카탈로그는 시작일 순서로 정렬되니 공연 편집에서 시작일을 맞춰주세요.
            </Text>
          </View>
        ) : null}

        {/* 폼이 열려 있지 않을 때만 추가 버튼을 보여준다 — 한 번에 하나만 편집한다 */}
        {form === null ? (
          <Pressable
            style={styles.addButton}
            onPress={() => setForm(newScheduleForm(schedules, event))}
            accessibilityRole="button">
            <Ionicons name="add" size={16} color={Colors.textOnColor} />
            <Text style={styles.addButtonText}>회차 추가</Text>
          </Pressable>
        ) : null}

        {/* 새 회차 추가 폼. 편집 폼은 해당 줄 자리에 펼쳐진다 */}
        {form !== null && form.id === null ? (
          <ScheduleForm
            form={form}
            onChange={setForm}
            onSave={handleSave}
            onCancel={() => setForm(null)}
            isSaving={isSaving}
            theme={theme}
          />
        ) : null}

        {schedules.map((schedule) =>
          form?.id === schedule.id ? (
            <ScheduleForm
              key={schedule.id}
              form={form}
              onChange={setForm}
              onSave={handleSave}
              onCancel={() => setForm(null)}
              onDelete={handleDelete}
              soldCount={schedule.soldCount}
              isSaving={isSaving}
              theme={theme}
            />
          ) : (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              now={now}
              theme={theme}
              onPress={() =>
                setForm({
                  id: schedule.id,
                  date: toDateKey(schedule.startsAt),
                  time: formatTime(schedule.startsAt),
                  capacity: String(schedule.capacity),
                })
              }
            />
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 목록의 한 줄. 언제·정원 얼마·몇 장 팔렸는지. 누르면 그 자리에서 편집 폼으로 바뀐다.
function ScheduleRow({
  schedule,
  now,
  theme,
  onPress,
}: {
  schedule: AdminScheduleItem;
  now: Date;
  theme: ThemeColors;
  onPress: () => void;
}) {
  const isPast = schedule.startsAt.getTime() <= now.getTime();
  // 잔여석. 정원을 팔린 수보다 낮게 저장하는 길은 막아뒀지만(validateScheduleDraft),
  // SQL로 직접 고친 경우까지 감안해 음수는 0으로 눌러 보여준다.
  const remaining = Math.max(0, schedule.capacity - schedule.soldCount);

  return (
    <Pressable
      style={[styles.row, { borderColor: theme.dashedBorder }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatMonthDayWeekday(schedule.startsAt)} ${formatTime(schedule.startsAt)} 회차 편집`}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowWhen, { color: isPast ? theme.textSecondary : theme.text }]}>
          {formatMonthDayWeekday(schedule.startsAt)} {formatTime(schedule.startsAt)}
        </Text>
        {isPast ? <StatusBadge label="지남" tone="muted" theme={theme} /> : null}
        {!isPast && remaining === 0 ? <StatusBadge label="매진" tone="warn" theme={theme} /> : null}
      </View>

      <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
        정원 {schedule.capacity.toLocaleString('ko-KR')} · 판매 {schedule.soldCount} · 남은 자리{' '}
        {remaining.toLocaleString('ko-KR')}
      </Text>
    </Pressable>
  );
}

// 회차 추가/편집 폼. 두 경우가 채우는 칸이 같아서 하나로 쓴다 —
// 다른 건 처음 값이 무엇인지와, 편집일 때만 삭제 버튼이 있다는 것뿐이다.
function ScheduleForm({
  form,
  onChange,
  onSave,
  onCancel,
  onDelete,
  soldCount,
  isSaving,
  theme,
}: {
  form: FormState;
  onChange: (form: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  soldCount?: number;
  isSaving: boolean;
  theme: ThemeColors;
}) {
  return (
    <View style={[styles.form, { borderColor: Colors.navy }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>
        {form.id ? '회차 수정' : '새 회차'}
      </Text>

      <View style={styles.formRow}>
        <FormField
          label="날짜"
          value={form.date}
          onChangeText={(date) => onChange({ ...form, date })}
          placeholder="2026-08-14"
          theme={theme}
          flex={2}
        />
        <FormField
          label="시각"
          value={form.time}
          onChangeText={(time) => onChange({ ...form, time })}
          placeholder="19:30"
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
        keyboardType="number-pad"
      />

      {/* 이미 판 표가 있으면 정원을 그 아래로 내릴 수 없다. 저장을 눌러 알기 전에 미리 적어둔다 */}
      {soldCount ? (
        <Text style={[styles.formHint, { color: theme.textSecondary }]}>
          이미 {soldCount}매가 팔려서 정원을 그보다 줄일 수 없어요.
        </Text>
      ) : null}

      <View style={styles.formButtons}>
        <Pressable
          style={[styles.formSave, isSaving && styles.disabled]}
          onPress={onSave}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={styles.formSaveText}>{isSaving ? '저장 중...' : '저장'}</Text>
        </Pressable>
        <Pressable
          style={[styles.formQuiet, { borderColor: theme.dashedBorder }]}
          onPress={onCancel}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={[styles.formQuietText, { color: theme.textSecondary }]}>취소</Text>
        </Pressable>
        {onDelete ? (
          <Pressable
            style={[styles.formQuiet, { borderColor: CategoryColors['연극'] }]}
            onPress={onDelete}
            disabled={isSaving}
            accessibilityRole="button">
            <Text style={[styles.formQuietText, { color: CategoryColors['연극'] }]}>삭제</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// 폼 안의 입력칸 하나 (라벨 + TextInput). 날짜와 시각을 한 줄에 나눠 놓으려고 flex를 받는다.
function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  keyboardType,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  theme: ThemeColors;
  keyboardType?: 'default' | 'number-pad';
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
        keyboardType={
          keyboardType ?? (Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation')
        }
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

// 상태 뱃지. 관리자 목록(admin.tsx)과 같은 규칙으로 색을 쓴다 — 새 색을 들이지 않는다.
function StatusBadge({
  label,
  tone,
  theme,
}: {
  label: string;
  tone: 'warn' | 'muted';
  theme: ThemeColors;
}) {
  const color = tone === 'warn' ? CategoryColors['연극'] : theme.textSecondary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  loading: {
    marginTop: 32,
  },
  notice: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 40,
    marginHorizontal: 32,
  },

  // 머리말
  eventTitle: {
    fontFamily: Fonts.medium,
    fontSize: 17,
    marginBottom: 4,
  },
  summary: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },

  // 안내 카드 (회차 없음 / 시작일 어긋남)
  card: {
    borderRadius: 16, // 일반 정보 카드 radius
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  cardHint: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },

  // 회차 추가 버튼
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.navy,
  },
  addButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.textOnColor,
  },

  // 목록 한 줄
  row: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 4,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowWhen: {
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  rowMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },

  badge: {
    borderWidth: 0.5,
    borderRadius: 20, // radius-pill
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: Fonts.medium,
    fontSize: 10,
  },

  // 편집 폼. 목록 줄과 구분되게 테두리를 네이비로 두른다
  form: {
    borderWidth: 0.5,
    borderRadius: 10,
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
  formSave: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSaveText: {
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
