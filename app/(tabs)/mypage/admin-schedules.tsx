// 마이페이지 > 관리자 > 공연 편집 > 회차 관리 (하위 화면)
//
// 공연 하나의 회차(날짜·시각·정원)를 만들고 고치고 지운다.
//
// 여기서 회차를 만드는 행위가 곧 이 공연을 어떻게 팔지 정한다. 회차가 하나라도 생기면 회차형이
// 되고(회차를 골라 산다, 정원이 있다), 전부 지우면 기간형으로 돌아간다
// (20260807103000_schedules_decide_type.sql — create_booking도 같은 순서로 가른다).
//
// 그래서 전시도 여기 온다. 종료일이 있는 전시에 회차를 만들면 시간지정 입장 전시가 된다.
// 지금 어느 쪽으로 팔리는지와 회차를 만들면 무엇이 달라지는지를 화면 위에 적어둔다.
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { LoadError } from '@/components/load-error';
import { ScheduleForm, ScheduleFormState } from '@/components/schedule-form';
import { CategoryColors, Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useEvents } from '@/contexts/events';
import {
  AdminEventItem,
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

// 새 회차의 처음 값.
//
// 마지막 회차의 "다음 날 같은 시각, 같은 정원"으로 채운다. 공연 회차는 보통 며칠씩 이어져서
// 이렇게 두면 대개 손댈 곳이 없거나 날짜 하나만 고치면 된다.
// 회차가 하나도 없으면 공연 시작일(events.show_at)에서 시작한다 — 첫 회차는 보통 그 날이다.
function newScheduleForm(schedules: AdminScheduleItem[], event: AdminEventItem): ScheduleFormState {
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
  const [form, setForm] = useState<ScheduleFormState | null>(null);
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

  const upcomingCount = schedules.filter((s) => s.startsAt.getTime() > now.getTime()).length;
  const soldTotal = schedules.reduce((sum, s) => sum + s.soldCount, 0);

  // 카탈로그 정렬(events.show_at 기준)과 첫 회차가 어긋났는지.
  // 일정 표기는 회차가 있으면 회차를 따라가지만(data/events.ts의 formatEventSchedule), 목록의
  // 순서는 여전히 show_at을 본다. 어긋나면 예매 탭에서 엉뚱한 자리에 놓인다.
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

        {/* 회차를 만드는 순간 파는 방식이 바뀐다. 지금 어느 쪽인지와 무엇이 달라지는지 알린다.
            종료일이 있는 전시라면 지금은 기간형이고, 회차를 만들면 시간지정 입장이 된다.
            종료일도 없으면 지금은 팔 방법이 없어서 예매 탭에 아예 안 뜬다 */}
        {schedules.length === 0 ? (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {event.showEndAt ? '지금은 기간형이에요' : '회차가 없어요'}
            </Text>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              {event.showEndAt
                ? `${formatDate(event.showAt)} ~ ${formatDate(event.showEndAt)} 안에서 관람일을 고르는 방식이고 정원이 없어요. 회차를 하나라도 만들면 그 회차 중에서 고르는 방식으로 바뀌고, 회차마다 정원이 생겨요.`
                : '회차가 없고 종료일도 없어서 예매 탭에 보이지 않아요. 회차를 하나 이상 추가해주세요.'}
            </Text>
          </View>
        ) : null}

        {/* 회차가 생겨서 기간형에서 회차형으로 넘어온 전시. 종료일이 더 이상 안 쓰인다는 걸 알린다 */}
        {schedules.length > 0 && event.showEndAt ? (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>회차로 파는 중이에요</Text>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              회차가 있어서 종료일({formatDate(event.showEndAt)})은 예매에 쓰이지 않아요. 회차를
              전부 지우면 다시 기간 안에서 관람일을 고르는 방식으로 돌아가요.
            </Text>
          </View>
        ) : null}

        {startMismatch ? (
          <View style={[styles.card, { backgroundColor: theme.emptyCellBackground }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>시작일과 첫 회차가 달라요</Text>
            <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
              시작일은 {formatDate(event.showAt)}인데 첫 회차는 {formatDate(first.startsAt)}예요.
              예매 탭 목록은 시작일 순서로 정렬되니 공연 편집에서 시작일을 맞춰주세요.
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
            onSubmit={handleSave}
            onCancel={() => setForm(null)}
            isBusy={isSaving}
            theme={theme}
            title="새 회차"
            submitLabel="저장"
          />
        ) : null}

        {schedules.map((schedule) =>
          form?.id === schedule.id ? (
            <ScheduleForm
              key={schedule.id}
              form={form}
              onChange={setForm}
              onSubmit={handleSave}
              onCancel={() => setForm(null)}
              onDelete={handleDelete}
              soldCount={schedule.soldCount}
              isBusy={isSaving}
              theme={theme}
              title="회차 수정"
              submitLabel="저장"
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


  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
});
