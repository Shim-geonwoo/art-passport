// 마이페이지 > 관리자 (하위 화면) — 공연·전시 목록
//
// 관리자 모드의 첫 화면이다. 카탈로그 전체를 "관리하는 쪽" 시선으로 보여준다.
// 예매 탭 목록과 비슷해 보이지만 두 가지가 다르다:
//
//   1) 숨긴 공연까지 전부 나온다. 숨긴 것이야말로 찾아서 다시 올려야 하는 대상이다.
//   2) "지금 예매 탭에 보이는가"와, 안 보인다면 그 이유를 뱃지로 붙인다.
//      특히 '회차 없음'이 중요하다 — 공연을 등록해도 회차를 안 만들면 예매 탭에 안 뜨는데,
//      이유를 안 보여주면 등록이 실패한 줄 알게 된다.
//
// 이 화면은 아직 읽기 전용이다. 편집은 3단계, 회차 관리는 4단계에서 붙인다.
//
// 화면을 감추는 것은 편의일 뿐이라는 점을 적어둔다. 관리자가 아닌 사람이 이 경로로 들어와도
// 목록은 (누구나 볼 수 있는 카탈로그라) 보이지만, 무언가를 저장하려 하면 서버가 거절한다.
// 실제 차단은 DB의 RLS 정책이 한다(20260806150000_admin_role.sql).

import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { GenreBadge } from '@/components/genre-badge';
import { LoadError } from '@/components/load-error';
import { CategoryColors, Colors, Theme, ThemeColors } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { AdminEventItem, catalogVisibility, fetchAdminEvents } from '@/data/admin';
import { formatDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

const LOAD_ERROR_MESSAGE = '카탈로그를 불러오지 못했어요.';

export default function AdminEventsScreen() {
  const colorScheme = useColorScheme();
  const theme: ThemeColors = colorScheme === 'dark' ? Theme.dark : Theme.light;

  const now = useNow();
  const { isAdmin } = useAuth();

  const [events, setEvents] = useState<AdminEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 이 목록은 앱 전역 상태(EventsProvider)를 쓰지 않는다. 그쪽은 숨긴 공연을 걸러낸 "예매용"이고,
  // 여기는 숨긴 것까지 필요해서 조회 자체가 다르다. 관리 화면에서만 잠깐 쓰는 값이라
  // 전역에 올리지 않고 이 화면이 직접 들고 있는다.
  const load = useCallback(async () => {
    try {
      setEvents(await fetchAdminEvents(new Date()));
      setError(null);
    } catch {
      setError(LOAD_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  // 제목과 장소로 찾는다 (예매 탭 검색과 같은 규칙 — 공연장 이름만 기억나는 경우도 흔하다)
  const keyword = query.trim().toLowerCase();
  const filtered = keyword
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(keyword) || e.venueName.toLowerCase().includes(keyword)
      )
    : events;

  // 목록 위에 붙일 한 줄 요약. "무엇을 채워야 하는지"가 한눈에 보이게 한다 —
  // 지금 시드 50건은 소개글이 전부 비어 있어서, 이 숫자가 곧 3단계에서 할 일의 크기다.
  const hiddenCount = events.filter((e) => e.isHidden).length;
  const noDescriptionCount = events.filter((e) => !e.description || e.description.length === 0)
    .length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <BackHeader title="관리자" color={theme.text} />

      {/* 관리자가 아닌데 이 화면에 들어온 경우. 막는 건 서버지만, 여기서도 상태를 분명히 알려준다
          (아무것도 저장이 안 되는 이유를 화면에서 알 수 있어야 한다) */}
      {!isAdmin ? (
        <View style={[styles.notice, { backgroundColor: theme.emptyCellBackground }]}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
            관리자 계정이 아니에요. 목록은 볼 수 있지만 저장은 서버가 거절합니다.
          </Text>
        </View>
      ) : null}

      {/* 검색창 (예매 탭과 같은 모양) */}
      <View style={[styles.search, { borderColor: theme.dashedBorder }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="공연·전시나 장소 검색"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.textSecondary} />
      ) : error && events.length === 0 ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.text}
              colors={[theme.text]}
              progressBackgroundColor={theme.background}
            />
          }>
          {/* 카탈로그 현황 한 줄 */}
          <Text style={[styles.summary, { color: theme.textSecondary }]}>
            전체 {events.length}건 · 숨김 {hiddenCount} · 소개글 없음 {noDescriptionCount}
          </Text>

          {filtered.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {keyword ? `'${query.trim()}'과 맞는 공연·전시가 없어요.` : '등록된 공연이 없어요.'}
            </Text>
          ) : (
            filtered.map((event) => (
              <AdminEventRow key={event.id} event={event} theme={theme} now={now} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// 목록의 한 줄. 제목 + 장르 + 일정 + "왜 안 보이는지" 뱃지들.
//
// 아직 누를 수 없다 — 편집 화면이 3단계라서다. 눌리는 것처럼 보이면 고장으로 오해하므로
// Pressable로 감싸지 않고 그냥 View로 둔다.
function AdminEventRow({
  event,
  theme,
  now,
}: {
  event: AdminEventItem;
  theme: ThemeColors;
  now: Date;
}) {
  const visibility = catalogVisibility(event, now);

  return (
    <View style={[styles.row, { borderColor: theme.dashedBorder }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {event.title}
        </Text>
        <GenreBadge genre={event.genre} />
      </View>

      <Text style={[styles.rowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
        {event.venueName} · {formatDate(event.showAt)}
        {event.showEndAt ? ` ~ ${formatDate(event.showEndAt)}` : ''} ·{' '}
        {event.price.toLocaleString('ko-KR')}원
      </Text>

      <View style={styles.badgeRow}>
        {/* 예매 탭에 보이는지. 안 보이면 그 이유를 그대로 적는다 */}
        {visibility.visible ? (
          <StatusBadge label="공개 중" tone="ok" theme={theme} />
        ) : (
          <StatusBadge label={visibility.reason ?? '안 보임'} tone="warn" theme={theme} />
        )}

        {/* 회차형(공연)만 회차 수를 보여준다. 전시는 회차 개념이 없다 */}
        {event.showEndAt === null ? (
          <StatusBadge
            label={`회차 ${event.scheduleCount}`}
            tone={event.scheduleCount === 0 ? 'warn' : 'muted'}
            theme={theme}
          />
        ) : null}

        {/* 3단계에서 채울 것들. 지금 시드는 소개글이 전부 비어 있다 */}
        {!event.description || event.description.length === 0 ? (
          <StatusBadge label="소개글 없음" tone="muted" theme={theme} />
        ) : null}
        {!event.posterUrl ? <StatusBadge label="포스터 없음" tone="muted" theme={theme} /> : null}
      </View>
    </View>
  );
}

// 상태 뱃지. 색은 세 가지뿐이다 —
//   ok    공개 중 (골드: 디자인 시스템의 포인트색, 소량만 쓴다)
//   warn  손봐야 하는 상태 (연극 카테고리색 = 주황 계열, 새 색을 들이지 않는다)
//   muted 참고 정보
function StatusBadge({
  label,
  tone,
  theme,
}: {
  label: string;
  tone: 'ok' | 'warn' | 'muted';
  theme: ThemeColors;
}) {
  const color =
    tone === 'ok' ? Colors.gold : tone === 'warn' ? CategoryColors['연극'] : theme.textSecondary;

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

  // 관리자가 아닐 때 알림 줄
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16, // 일반 정보 카드 radius
  },
  noticeText: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },

  // 검색창
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 0.5,
    borderRadius: 20, // radius-pill
  },
  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: Fonts.regular,
    fontSize: 14,
  },

  loading: {
    marginTop: 32,
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  summary: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    marginBottom: 12,
  },
  empty: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },

  // 목록 한 줄
  row: {
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flex: 1, // 제목이 길면 줄이고 장르 뱃지는 오른쪽에 붙여 둔다
    fontFamily: Fonts.medium,
    fontSize: 15,
  },
  rowMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12,
  },

  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', // 뱃지가 많아지면 다음 줄로 넘어가게
    gap: 4,
  },
  badge: {
    borderWidth: 0.5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: Fonts.medium,
    fontSize: 10,
  },
});
