// 예매(Booking) 탭 - 화면 1: 공연 목록
//
// 상단 카테고리 탭(전시/클래식·무용/콘서트/연극/뮤지컬)으로 공연을 필터링하고,
// 목록에서 카드를 고르면 공연 상세 화면([id].tsx)으로 이동한다.
// 참고: docs/design-system.md "1-2 카테고리 색", "1-3 라이트/다크 모드"

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreBadge } from '@/components/genre-badge';
import { LoadError } from '@/components/load-error';
import { CategoryColors, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useEvents } from '@/contexts/events';
import { EventItem, formatEventSchedule, isBookable } from '@/data/events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 상단 카테고리 탭 목록 (design-system.md 1-2 순서 그대로)
const GENRES: Genre[] = ['전시', '클래식·무용', '콘서트', '연극', '뮤지컬'];

export default function BookingListScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  // 처음 화면을 열었을 때는 첫 번째 카테고리(전시)만 필터링된 상태로 보여준다
  const [selectedGenre, setSelectedGenre] = useState<Genre>(GENRES[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const now = useNow();
  const { events, isLoading, error, refresh } = useEvents();

  // 검색 중에는 카테고리를 무시하고 전체에서 찾는다.
  // "레베카"를 찾으려고 뮤지컬 탭을 먼저 골라야 한다면 검색을 쓰는 의미가 없기 때문이다.
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  // 어느 쪽이든 "아직 예매 가능한 것"만 보여준다(지났거나 매진된 건 제외)
  const filteredEvents = events.filter((event) => {
    if (!isBookable(event, now)) {
      return false;
    }
    if (isSearching) {
      // 제목과 장소로 찾는다 — 공연장 이름만 기억나는 경우도 흔하다
      return (
        event.title.toLowerCase().includes(query) ||
        event.venueName.toLowerCase().includes(query)
      );
    }
    return event.genre === selectedGenre;
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      {/* 검색창. 카탈로그가 50건이라 카테고리만으로는 찾기 어려워서 상시 노출한다
          (보딩패스 탭은 티켓이 몇 장뿐이라 아이콘을 눌러야 열리는 방식이지만, 여긴 목록이 크다) */}
      <View style={[styles.searchBar, { borderColor: theme.dashedBorder }]}>
        <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="공연·전시나 장소 검색"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {isSearching ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* 상단 카테고리 탭. 검색 중에는 감춘다 — 전체에서 찾고 있는데 특정 탭이 선택된 것처럼
          보이면 "이 카테고리 안에서만 찾는 중"으로 오해하게 된다. */}
      {isSearching ? (
        <Text style={[styles.searchSummary, { color: theme.textSecondary }]}>
          전체에서 검색 · {filteredEvents.length}건
        </Text>
      ) : (
        /* 5개 탭이 항상 화면 폭 안에 들어오게 그냥 한 줄(View)로 놓는다.
           예전엔 가로 ScrollView였는데, 탭이 폭을 아주 조금 넘겨서 미세하게 스크롤되는 게
           오히려 불편했다. 좁은 화면에서도 안 넘치도록 각 탭은 flexShrink로 줄어들 수 있게 해뒀다. */
        <View style={styles.tabRow}>
          {GENRES.map((genre) => (
            <CategoryTab
              key={genre}
              genre={genre}
              selected={genre === selectedGenre}
              theme={theme}
              onPress={() => setSelectedGenre(genre)}
            />
          ))}
        </View>
      )}

      {/* 선택된 카테고리의 공연 목록 (세로 스크롤) */}
      {/* 카탈로그를 못 불러왔고 보여줄 목록도 없으면, 목록 자리에 안내 + 다시 시도를 놓는다.
          (한 번 받아둔 목록이 있으면 그건 계속 보여준다 — 실패했다고 화면을 뺏지 않는다) */}
      {error && events.length === 0 ? (
        <LoadError message={error} onRetry={refresh} />
      ) : (
        /* flex:1로 탭 바를 뺀 나머지 세로 공간을 차지하고, 그 안에서만 스크롤되게 한다 */
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {isLoading ? (
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>불러오는 중...</Text>
          ) : filteredEvents.length === 0 ? (
            // 검색 결과가 없는 것과 그 카테고리가 비어 있는 것은 다른 상황이라 문구를 나눈다
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {isSearching
                ? `'${searchQuery.trim()}'과 맞는 공연·전시가 없어요.`
                : '예매할 수 있는 공연이 없어요.'}
            </Text>
          ) : (
            filteredEvents.map((event, index) => (
              <EventCard
                key={event.id}
                event={event}
                theme={theme}
                showDivider={index !== filteredEvents.length - 1}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// 카테고리 탭 하나 (선택 시 카테고리 색 + 흰 글씨 / 미선택 시 크림 배경 + 회색 글씨)
function CategoryTab({
  genre,
  selected,
  theme,
  onPress,
}: {
  genre: Genre;
  selected: boolean;
  theme: { dashedBorder: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        {
          backgroundColor: selected ? CategoryColors[genre] : Colors.cream,
          borderColor: selected ? CategoryColors[genre] : theme.dashedBorder,
        },
      ]}>
      {/* '클래식·무용'처럼 긴 이름이 두 줄로 넘어가지 않게 한 줄 고정 + 아주 좁은 화면에서만 살짝 축소 */}
      <Text
        style={[styles.tabText, { color: selected ? Colors.textOnColor : Colors.textSecondary }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}>
        {genre}
      </Text>
    </Pressable>
  );
}

// 공연 카드 한 장: 좌측 포스터 자리 + 우측 공연 정보. 누르면 상세 화면으로 이동한다
function EventCard({
  event,
  theme,
  showDivider,
}: {
  event: EventItem;
  theme: { text: string; textSecondary: string; dashedBorder: string };
  showDivider: boolean;
}) {
  return (
    <Link href={{ pathname: '/booking/[id]', params: { id: event.id } }} asChild>
      <Pressable>
        <View style={styles.card}>
          {/* 포스터 자리. posterUrl이 있으면 그 이미지를, 없으면 카테고리 색 박스로 대체한다 */}
          <View style={[styles.poster, { backgroundColor: CategoryColors[event.genre] }]}>
            {event.posterUrl ? (
              <Image source={{ uri: event.posterUrl }} style={styles.posterImage} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={20} color={Colors.textOnColor} style={styles.posterIcon} />
            )}
          </View>

          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {event.title}
            </Text>
            <GenreBadge genre={event.genre} />
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{formatEventSchedule(event)}</Text>
            <Text style={[styles.cardMeta, { color: theme.textSecondary }]}>{event.venueName}</Text>
            <Text style={[styles.cardPrice, { color: theme.text }]}>
              {event.price.toLocaleString('ko-KR')}원
            </Text>
          </View>
        </View>
        {showDivider && <View style={[styles.divider, { backgroundColor: theme.dashedBorder }]} />}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  // 상단 카테고리 탭
  // 검색창 (카테고리 탭 위에 상시 노출)
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // sm
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10, // TextField와 같은 값
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: 14,
    padding: 0, // 안드로이드 TextInput의 기본 여백을 없애 아이콘과 높이를 맞춘다
  },
  // 검색 중일 때 카테고리 탭 자리에 들어가는 요약 줄
  searchSummary: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 16, // 탭 줄과 같은 높이라 목록이 아래위로 튀지 않는다
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-start', // 탭이 세로로 stretch돼서 길쭉한 막대가 되는 걸 막는다
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 16, // md
  },
  tab: {
    flexShrink: 1, // 5개가 화면 폭을 넘길 것 같으면 스스로 줄어든다 (가로 스크롤 방지)
    borderRadius: 20, // radius-pill
    borderWidth: 1,
    // 좌우 여백을 16 -> 10으로 줄였다. 5개 탭을 스크롤 없이 한 화면에 넣기 위한 값
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
  },

  // 공연 목록
  list: {
    flex: 1, // 탭 바를 뺀 나머지 세로 공간을 차지 (겹침 방지 + 목록만 스크롤)
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24, // xl
  },
  statusText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
  },
  cardTouchable: {
    // Link asChild가 Text를 클릭 가능하게 감싸는 자리. 자체 텍스트 스타일은 없다
  },
  card: {
    flexDirection: 'row',
    paddingVertical: 16, // md
    gap: 12,
  },
  poster: {
    width: 60,
    height: 80,
    borderRadius: 12, // radius-md — 목록 카드 이미지 자리 (design-system.md 5. 모서리·테두리)
    overflow: 'hidden', // 포스터 이미지가 둥근 모서리 밖으로 안 나가게
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterIcon: {
    opacity: 0.6,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    flex: 1,
    gap: 4, // xs
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: Fonts.medium,
    fontSize: 16, // color는 theme.text를 인라인으로 적용 (라이트/다크 대응, design-system.md 2-4)
  },
  cardMeta: {
    fontFamily: Fonts.regular,
    fontSize: 12, // Caption. color는 theme.textSecondary 인라인 적용
  },
  cardPrice: {
    fontFamily: Fonts.medium,
    fontSize: 13, // color는 theme.text 인라인 적용
  },
  divider: {
    height: 0.5, // color(theme.dashedBorder)는 인라인 적용 — border-hairline의 라이트/다크 짝
  },
});
