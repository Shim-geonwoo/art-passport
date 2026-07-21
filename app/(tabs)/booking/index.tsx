// 예매(Booking) 탭 - 화면 1: 공연 목록
//
// 상단 카테고리 탭(전시/클래식·무용/콘서트/연극/뮤지컬)으로 공연을 필터링하고,
// 목록에서 카드를 고르면 공연 상세 화면([id].tsx)으로 이동한다.
// 참고: docs/design-system.md "1-2 카테고리 색", "1-3 라이트/다크 모드"

import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreBadge } from '@/components/genre-badge';
import { CategoryColors, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { DUMMY_EVENTS, EventItem, formatEventSchedule, isBookable } from '@/data/dummy-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';

// 상단 카테고리 탭 목록 (design-system.md 1-2 순서 그대로)
const GENRES: Genre[] = ['전시', '클래식·무용', '콘서트', '연극', '뮤지컬'];

export default function BookingListScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  // 처음 화면을 열었을 때는 첫 번째 카테고리(전시)만 필터링된 상태로 보여준다
  const [selectedGenre, setSelectedGenre] = useState<Genre>(GENRES[0]);

  const now = useNow();

  // 선택한 카테고리 중, 아직 예매 가능한(지나거나 종료되지 않은) 이벤트만 보여준다.
  const filteredEvents = DUMMY_EVENTS.filter(
    (event) => event.genre === selectedGenre && isBookable(event, now)
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      {/* 상단 카테고리 탭 */}
      {/* 5개 탭이 항상 화면 폭 안에 들어오게 그냥 한 줄(View)로 놓는다.
          예전엔 가로 ScrollView였는데, 탭이 폭을 아주 조금 넘겨서 미세하게 스크롤되는 게
          오히려 불편했다. 좁은 화면에서도 안 넘치도록 각 탭은 flexShrink로 줄어들 수 있게 해뒀다. */}
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

      {/* 선택된 카테고리의 공연 목록 (세로 스크롤) */}
      {/* flex:1로 탭 바를 뺀 나머지 세로 공간을 차지하고, 그 안에서만 스크롤되게 한다 */}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filteredEvents.map((event, index) => (
          <EventCard
            key={event.id}
            event={event}
            theme={theme}
            showDivider={index !== filteredEvents.length - 1}
          />
        ))}
      </ScrollView>
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
          {/* 포스터 자리. 실제 이미지가 없어서 카테고리 색 박스로 대체한다 */}
          <View style={[styles.poster, { backgroundColor: CategoryColors[event.genre] }]}>
            <Ionicons name="image-outline" size={20} color={Colors.textOnColor} style={styles.posterIcon} />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterIcon: {
    opacity: 0.6,
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
