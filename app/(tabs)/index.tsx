// 보딩패스(Boarding Pass) 화면
//
// 앱을 켰을 때 가장 먼저 보이는 첫 화면(랜딩)이다.
// (파일 이름이 index.tsx이기 때문에 탭 그룹의 기본 화면이 된다.)
//
// docs/boarding-pass-single.png (카드 한 장) / docs/boarding-pass-stack.png (여러 장 겹침)
// 시안과 docs/design-system.md "8-1. 보딩패스 카드" 실측값을 그대로 따른다.
//
// 화면 동작 규칙:
// - "관람 3일 전 ~ 관람 시각" 사이인 예매만 보딩패스로 보여준다. (그 전/후는 안 보임)
// - 여러 장이면 애플 월렛처럼 겹쳐 쌓고, 스크롤로 뒤에 깔린 카드를 볼 수 있다.
// - 보여줄 티켓이 하나도 없으면, 안내 문구 없이 완전히 빈 화면으로 둔다.
// - 아직 실제 예매 데이터가 없어서, 더미 데이터로만 화면을 채운다.

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryColors, CategoryIcons, CategoryLabels, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 보딩패스로 보여줄 수 있는 기간: 관람 3일 전부터 관람 시각까지
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BOARDING_WINDOW_MS = 3 * ONE_DAY_MS;

// 카드 스택 한 칸의 크기 (docs/design-system.md 8-1: 270 x 380)
const CARD_WIDTH = 270;
const CARD_HEIGHT = 380;

// 스택에서 카드가 있을 수 있는 자리(앞/중간/뒤)별 top 값. index 0 = 맨 앞.
// 뒤 카드일수록 top이 작아서(=더 위) 앞 카드 위로 살짝 삐져나와 보인다.
const STACK_TOP_BY_POSITION = [48, 24, 0];

// 자리별 그림자 값. 앞으로 올수록 그림자가 진하고 커진다.
const STACK_SHADOW_BY_POSITION = [
  { shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }, // 맨 앞
  { shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 }, // 중간
  { shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 }, // 맨 뒤
];

const STACK_ANIMATION_DURATION_MS = 350;

// 카드가 4장 이상이면(자리가 3개보다 많으면) 정의 안 된 자리는 "맨 뒤" 값을 그대로 재사용한다
function getStackSlot(position: number) {
  const clampedIndex = Math.min(position, STACK_TOP_BY_POSITION.length - 1);
  return {
    top: STACK_TOP_BY_POSITION[clampedIndex],
    ...STACK_SHADOW_BY_POSITION[clampedIndex],
  };
}

// 이 화면(보딩패스 탭) 전용 배경색.
// constants/colors.ts의 공통 Theme.background(크림/#1A1A1C)와는 다르게,
// 이 화면만 다크 #2C2C2C / 라이트 #FFFFFF를 쓰기로 했다.
const SCREEN_BACKGROUND_DARK = '#2C2C2C';
const SCREEN_BACKGROUND_LIGHT = '#FFFFFF';

// design-system.md 8-1 실측값에만 나오는 카드 전용 색.
// 1. 색상(Color) 표에 있는 공통 토큰이 아니라 보딩패스 카드에서만 쓰는 값이라 여기 따로 둔다.
const CARD_ICON_COLOR = '#000000'; // 카테고리 아이콘 / 비행기 아이콘
const CARD_LABEL_COLOR = '#2C2C2C'; // Bold 10 라벨 글씨
const CARD_VALUE_COLOR = '#FFFFFF'; // DemiLight 값 글씨

// 보딩패스는 "출발 = 자택(HOME)", "도착 = 관람 도시(SEOUL)"인
// 가상의 비행기 티켓 컨셉이다. 실제 도시가 아니라 시안 그대로 고정 문구를 쓴다.
const DEPARTURE_LABEL = '자택';
const DEPARTURE_VALUE = 'HOME';
const ARRIVAL_VALUE = 'SEOUL';

// 화면 맨 위 타이틀 (피그마 "art - boarding pass" 프레임 상단 헤더)
const SCREEN_TITLE = 'ART PASS';

// 예매 한 건 = 보딩패스 카드 한 장
type Booking = {
  id: string;
  genre: Genre; // 장르 (카드 배경색 + 아이콘을 결정한다)
  eventTitle: string; // 공연/전시 제목
  venueName: string; // 관람 장소 (도착지 라벨로 쓰인다)
  passengerName: string; // 예매자 이름
  showAt: Date; // 관람 시작 시각
  dateText: string; // 관람일 (YYYY.MM.DD)
  timeText: string; // 관람 시간 (HH:MM)
  seatInfo: string; // 좌석 정보
  capacity: number; // 인원 수
};

// 데모 스위치: 지금은 진짜 예매 데이터가 없어서, 아래 return 값을 바꿔가며
// 두 가지 상태를 확인할 수 있게 해뒀다.
// 'some' = 더미 티켓 여러 장 보여주기 (겹쳐 쌓인 모습 확인)
// 'none' = 표시할 티켓이 없는 빈 화면 확인
function getDemoTicketMode(): 'some' | 'none' {
  return 'some'; // <- 'none'으로 바꾸면 빈 월렛 화면을 볼 수 있다
}

// 숫자를 항상 두 자리로 만든다 (예: 3 -> "03")
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
}

function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// 더미 예매 원본 데이터: 관람 시각을 "지금부터 몇 시간/며칠 뒤(또는 전)"로 표현해서,
// 앱을 언제 실행해도 "3일 전 ~ 관람 시각" 필터가 항상 의미 있게 동작하도록 만들었다.
const DUMMY_BOOKING_SEEDS: {
  id: string;
  genre: Genre;
  eventTitle: string;
  venueName: string;
  offsetMs: number; // "지금"으로부터 관람 시각까지 남은 시간 (음수면 이미 지난 시각)
  seatInfo: string;
  capacity: number;
}[] = [
  {
    id: '1',
    genre: '뮤지컬',
    eventTitle: '라이온킹',
    venueName: '블루스퀘어',
    offsetMs: 18 * 60 * 60 * 1000, // 18시간 뒤 -> 보딩패스 뜸
    seatInfo: '자유석',
    capacity: 1,
  },
  {
    id: '2',
    genre: '전시',
    eventTitle: '행성 지구 아카이브',
    venueName: '리움미술관',
    offsetMs: 1 * ONE_DAY_MS, // 1일 뒤 -> 보딩패스 뜸
    seatInfo: '자유석',
    capacity: 1,
  },
  {
    id: '3',
    genre: '콘서트',
    eventTitle: 'Summer Sound Fest',
    venueName: '올림픽공원',
    offsetMs: 2 * ONE_DAY_MS + 12 * 60 * 60 * 1000, // 2.5일 뒤 -> 보딩패스 뜸 (3일 이내)
    seatInfo: '자유석',
    capacity: 1,
  },
  {
    id: '4',
    genre: '연극',
    eventTitle: '햄릿',
    venueName: '대학로 예술극장',
    offsetMs: 5 * ONE_DAY_MS, // 5일 뒤 -> 아직 3일 전이 아니라서 안 보임
    seatInfo: '자유석',
    capacity: 1,
  },
  {
    id: '5',
    genre: '클래식·무용',
    eventTitle: '백조의 호수',
    venueName: '예술의전당',
    offsetMs: -2 * 60 * 60 * 1000, // 2시간 전 -> 관람 시각이 지나서 안 보임
    seatInfo: '자유석',
    capacity: 1,
  },
];

function buildDummyBookings(now: Date): Booking[] {
  return DUMMY_BOOKING_SEEDS.map((seed) => {
    const showAt = new Date(now.getTime() + seed.offsetMs);
    return {
      id: seed.id,
      genre: seed.genre,
      eventTitle: seed.eventTitle,
      venueName: seed.venueName,
      passengerName: 'SHIM GEONWOO', // 아직 로그인 기능이 없어서 더미 이름 고정
      showAt,
      dateText: formatDate(showAt),
      timeText: formatTime(showAt),
      seatInfo: seed.seatInfo,
      capacity: seed.capacity,
    };
  });
}

// "관람 3일 전 ~ 관람 시각" 사이인지 확인한다
function isWithinBoardingWindow(showAt: Date, now: Date): boolean {
  const msUntilShow = showAt.getTime() - now.getTime();
  return msUntilShow >= 0 && msUntilShow <= BOARDING_WINDOW_MS;
}

export default function BoardingPassScreen() {
  // 폰의 라이트/다크 설정을 읽어서, 화면 배경색만 그에 맞게 바꾼다.
  // (카드 자체는 카테고리 색을 그대로 쓰기 때문에 라이트/다크 상관없이 동일하다)
  // 이 화면은 다크모드가 기본이라, "라이트로 확실히 설정된 경우"만 라이트를 쓴다.
  const colorScheme = useColorScheme();
  const screenBackground = colorScheme === 'light' ? SCREEN_BACKGROUND_LIGHT : SCREEN_BACKGROUND_DARK;
  // 헤더 글씨/아이콘도 화면 배경(라이트=흰색/다크=진회색)에 맞춰 색을 바꾼다
  const headerColor = colorScheme === 'light' ? Colors.textPrimary : Colors.textOnColor;
  const headerPlaceholderColor = colorScheme === 'light' ? Theme.light.textSecondary : Theme.dark.textSecondary;

  const ticketMode = getDemoTicketMode();

  // "지금" 시각을 화면이 처음 열릴 때 한 번만 고정한다 (렌더링 중간에 결과가 안 바뀌게)
  const [now] = useState(() => new Date());

  const allBookings = ticketMode === 'none' ? [] : buildDummyBookings(now);
  // 보딩패스로 보여줄 조건에 맞는 예매만 남기고, 관람 시각이 가까운 순서로 정렬한다
  const visibleBookings = allBookings
    .filter((booking) => isWithinBoardingWindow(booking.showAt, now))
    .sort((a, b) => a.showAt.getTime() - b.showAt.getTime());

  // 스택에서 카드가 쌓인 순서. index 0 = 맨 앞 카드.
  // 처음엔 관람일이 가까운 순서를 그대로 앞-뒤 순서로 쓴다.
  const [frontOrder, setFrontOrder] = useState<string[]>(() =>
    visibleBookings.map((booking) => booking.id)
  );

  // 카드마다 "지금 스택에서 몇 번째 자리인지"를 담는 애니메이션 값을 하나씩 준비해둔다.
  // ref에 담아서 한 번만 만들고 계속 재사용한다 (렌더될 때마다 새로 만들면 애니메이션이 끊긴다).
  const stackAnimsRef = useRef<Record<string, Animated.Value>>({});
  visibleBookings.forEach((booking) => {
    if (!stackAnimsRef.current[booking.id]) {
      const initialPosition = frontOrder.indexOf(booking.id);
      stackAnimsRef.current[booking.id] = new Animated.Value(initialPosition === -1 ? 0 : initialPosition);
    }
  });

  // 카드를 탭했을 때 실행: 그 카드를 맨 앞으로, 나머지는 한 칸씩 뒤로 민다.
  // zIndex(누가 위에 그려질지)는 즉시 바꾸고, 위치/그림자만 350ms 동안 부드럽게 움직인다.
  function bringCardToFront(bookingId: string) {
    if (frontOrder[0] === bookingId) {
      return; // 이미 맨 앞이면 아무것도 하지 않는다
    }

    const rest = frontOrder.filter((id) => id !== bookingId);
    const nextOrder = [bookingId, ...rest];

    nextOrder.forEach((id, nextPosition) => {
      const previousPosition = frontOrder.indexOf(id);
      if (previousPosition === nextPosition) {
        return; // 자리가 안 바뀐 카드는 애니메이션할 필요 없다
      }
      const animValue = stackAnimsRef.current[id];
      if (!animValue) {
        return;
      }
      Animated.timing(animValue, {
        toValue: nextPosition,
        duration: STACK_ANIMATION_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false, // top/그림자는 레이아웃 속성이라 네이티브 드라이버를 못 쓴다
      }).start();
    });

    setFrontOrder(nextOrder);
  }

  // 검색창 상태: 검색 아이콘을 누르면 열리고, 글자를 입력하면 콘텐츠명/장소로 찾는다
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  function handleToggleSearch() {
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
    } else {
      setIsSearchOpen(true);
    }
  }

  // 검색어가 바뀔 때마다 콘텐츠명(eventTitle) 또는 장소(venueName)에 포함되는
  // 첫 번째 보딩패스를 찾아서, 탭했을 때와 똑같이 맨 앞으로 올려준다.
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') {
      return;
    }

    const matchedBooking = visibleBookings.find(
      (booking) =>
        booking.eventTitle.toLowerCase().includes(query) ||
        booking.venueName.toLowerCase().includes(query)
    );

    if (matchedBooking) {
      bringCardToFront(matchedBooking.id);
    }
    // searchQuery가 바뀔 때만 실행한다 (bringCardToFront/visibleBookings는 매 렌더 새로 만들어지는
    // 함수/배열이라 deps에 넣으면 검색어가 그대로여도 계속 다시 실행돼버린다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // 보여줄 티켓이 없어도, 화면 타이틀(ART PASS)과 검색 아이콘은 계속 보여준다
  // ("안내 문구 없이 빈 화면"은 카드 목록에만 해당하는 규칙이다)
  if (visibleBookings.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBackground }]} edges={['top']}>
        <BoardingPassHeader
          color={headerColor}
          placeholderColor={headerPlaceholderColor}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          onToggleSearch={handleToggleSearch}
          onChangeSearch={setSearchQuery}
        />
      </SafeAreaView>
    );
  }

  // 애니메이션 보간(interpolate)에 쓸 "자리별 값" 배열. 카드 수만큼 만들되 최소 2칸은 있어야 한다
  // (interpolate는 최소 2개의 입력/출력 값 쌍이 필요하다).
  const slotCount = Math.max(visibleBookings.length, 2);
  const stackPositions = Array.from({ length: slotCount }, (_, i) => i);
  const topRange = stackPositions.map((position) => getStackSlot(position).top);
  const shadowOpacityRange = stackPositions.map((position) => getStackSlot(position).shadowOpacity);
  const shadowRadiusRange = stackPositions.map((position) => getStackSlot(position).shadowRadius);
  const elevationRange = stackPositions.map((position) => getStackSlot(position).elevation);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBackground }]} edges={['top']}>
      <BoardingPassHeader
        color={headerColor}
        placeholderColor={headerPlaceholderColor}
        isSearchOpen={isSearchOpen}
        searchQuery={searchQuery}
        onToggleSearch={handleToggleSearch}
        onChangeSearch={setSearchQuery}
      />

      {/* 카드 스택 영역: 화면 가운데에 카드 3장이 겹쳐 쌓인 고정 자리를 만든다 */}
      <View style={styles.stackArea}>
        <View style={styles.stackContainer}>
          {visibleBookings.map((booking) => {
            const categoryColor = CategoryColors[booking.genre];
            const animValue = stackAnimsRef.current[booking.id];
            const stackPosition = frontOrder.indexOf(booking.id);

            // 하나의 애니메이션 값(0,1,2...)에서 top/그림자를 동시에 보간해서 뽑아낸다
            // -> 카드가 앞으로 올수록 위치와 그림자가 같이 움직인다
            const animatedTop = animValue.interpolate({ inputRange: stackPositions, outputRange: topRange });
            const animatedShadowOpacity = animValue.interpolate({
              inputRange: stackPositions,
              outputRange: shadowOpacityRange,
            });
            const animatedShadowRadius = animValue.interpolate({
              inputRange: stackPositions,
              outputRange: shadowRadiusRange,
            });
            const animatedElevation = animValue.interpolate({
              inputRange: stackPositions,
              outputRange: elevationRange,
            });

            return (
              <Animated.View
                key={booking.id}
                style={[
                  styles.cardShadowWrap,
                  {
                    // 안드로이드는 elevation 그림자를 이 배경의 불투명한 모양대로 그리기 때문에,
                    // 카드와 같은 색을 배경으로 깔아준다 (카드가 그 위를 정확히 덮는다)
                    backgroundColor: categoryColor,
                    top: animatedTop,
                    // zIndex는 애니메이션 없이 바로 바뀐다 -> 탭하자마자 그 카드가 맨 위로 그려진다
                    zIndex: stackPosition === -1 ? 0 : visibleBookings.length - stackPosition,
                    shadowOpacity: animatedShadowOpacity,
                    shadowRadius: animatedShadowRadius,
                    elevation: animatedElevation,
                  },
                ]}
              >
                {/* 카드 전체를 누를 수 있게 한다. 뒤 카드는 앞 카드에 아랫부분이 가려져 있어서,
                    실제로는 눈에 보이는 윗부분(삐져나온 부분)만 눌린다 */}
                <Pressable onPress={() => bringCardToFront(booking.id)}>
                  <BoardingPassCard booking={booking} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

// 화면 맨 위 헤더: "ART PASS" 타이틀 + 검색 아이콘
// 피그마 "art - boarding pass" 프레임의 화면 상단 TOP 영역(390 x 42)을 그대로 따른다.
// 검색 아이콘을 누르면 타이틀 자리가 검색창으로 바뀌고, 아이콘은 닫기(X)로 바뀐다.
function BoardingPassHeader({
  color,
  placeholderColor,
  isSearchOpen,
  searchQuery,
  onToggleSearch,
  onChangeSearch,
}: {
  color: string;
  placeholderColor: string;
  isSearchOpen: boolean;
  searchQuery: string;
  onToggleSearch: () => void;
  onChangeSearch: (text: string) => void;
}) {
  return (
    <View style={styles.header}>
      {isSearchOpen ? (
        <TextInput
          style={[styles.searchInput, { color }]}
          value={searchQuery}
          onChangeText={onChangeSearch}
          placeholder="콘텐츠명 또는 장소 검색"
          placeholderTextColor={placeholderColor}
          autoFocus
        />
      ) : (
        <Text style={[styles.headerTitle, { color }]}>{SCREEN_TITLE}</Text>
      )}

      <Pressable onPress={onToggleSearch} hitSlop={8}>
        <Ionicons name={isSearchOpen ? 'close' : 'search-outline'} size={24} color={color} />
      </Pressable>
    </View>
  );
}

// 보딩패스 카드 한 장
// 피그마 Dev Mode 좌표값을 그대로 옮긴 정적 컴포넌트(components/boarding-pass-card.tsx)를
// 기반으로, 카드 안 글자만 예매 데이터(booking)로 바꿔 끼운 버전이다.
// 모든 라벨/값은 position:'absolute' + 정확한 left/top으로 배치한다 (270 x 380, radius 10).
function BoardingPassCard({ booking }: { booking: Booking }) {
  const categoryColor = CategoryColors[booking.genre];
  const categoryIconName = CategoryIcons[booking.genre];
  const categoryLabel = CategoryLabels[booking.genre];

  return (
    <View style={[styles.card, { backgroundColor: categoryColor }]}>
      {/* 상단 (270 x 42) */}
      <View style={styles.topSection}>
        <Text style={styles.categoryName}>{categoryLabel}</Text>
        {/* 카테고리 아이콘: 37x37 칸 가운데에 놓는다 (피그마 실측 칸 크기) */}
        <View style={styles.topIconSlot}>
          <MaterialCommunityIcons name={categoryIconName} size={24} color={CARD_ICON_COLOR} />
        </View>
      </View>

      {/* 중간 (270 x 170) */}
      <View style={styles.middleSection}>
        {/* 왼쪽: 자택(출발) - 항상 같은 고정 문구 */}
        <Text style={[styles.smallLabel, styles.posDepartureLabel]}>{DEPARTURE_LABEL}</Text>
        <Text style={[styles.bigValue, styles.posDepartureValue]}>{DEPARTURE_VALUE}</Text>

        {/* 오른쪽: 관람 장소(도착). 장소명 길이가 제각각이라 한 줄로 줄여 보여준다 */}
        <Text
          style={[styles.smallLabel, styles.posVenueLabel]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {booking.venueName}
        </Text>
        <Text style={[styles.bigValue, styles.posArrivalValue]}>{ARRIVAL_VALUE}</Text>

        {/* 비행기 아이콘: 37x37 칸 가운데 (피그마 실측 아이콘은 채워진 airplane) */}
        <View style={styles.posPlaneIconSlot}>
          <Ionicons name="airplane" size={28} color={CARD_ICON_COLOR} />
        </View>

        {/* PASSENGER / DATE / TIME 라벨 */}
        <Text style={[styles.smallLabel, styles.posPassengerLabel]}>PASSENGER</Text>
        <Text style={[styles.smallLabel, styles.posDateLabel]}>DATE</Text>
        <Text style={[styles.smallLabel, styles.posTimeLabel]}>TIME</Text>

        {/* PASSENGER / DATE / TIME 값. DATE 값만 피그마 원본에 letterSpacing이 없다 */}
        <Text
          style={[styles.smallValue, styles.trackedValue, styles.posPassengerValue]}
          numberOfLines={1}
        >
          {booking.passengerName}
        </Text>
        <Text style={[styles.smallValue, styles.posDateValue]}>{booking.dateText}</Text>
        <Text style={[styles.smallValue, styles.trackedValue, styles.posTimeValue]}>
          {booking.timeText}
        </Text>

        {/* SEAT / CAP 라벨 + 값 */}
        <Text style={[styles.smallLabel, styles.posSeatLabel]}>SEAT</Text>
        <Text style={[styles.smallLabel, styles.posCapLabel]}>CAP</Text>
        <Text style={[styles.smallValue, styles.trackedValue, styles.posSeatValue]}>
          {booking.seatInfo}
        </Text>
        <Text style={[styles.smallValue, styles.trackedValue, styles.posCapValue]}>
          {String(booking.capacity)}
        </Text>
      </View>

      {/* 하단 (270 x 168): CONTENT 라벨/값 + QR 자리(회색 네모, 100x100) */}
      <View style={styles.bottomSection}>
        <View style={styles.contentBox}>
          <Text style={styles.contentLabel}>CONTENT</Text>
          {/* 콘텐츠명이 길어서 두 줄로 넘어가도 아래 회색 QR 자리를 안 가리도록,
              라벨/값을 원래 좌표(top 0 / top 12)보다 한 줄(12px) 위로 올려뒀다 */}
          <Text style={styles.contentValue} numberOfLines={2}>
            {booking.eventTitle}
          </Text>
          {/* 실제 QR코드는 아직 없어서 회색 네모로 자리만 표시해둔다 (나중에 QR 이미지로 교체) */}
          <View style={styles.qrPlaceholder} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  // 화면 맨 위 헤더 (피그마 TOP 390x42, 화면 좌우 여백 16px)
  header: {
    height: 42,
    paddingHorizontal: 16, // 화면 좌우 여백 (design-system.md 7. 레이아웃 기준)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 20,
  },
  // 검색 아이콘을 누르면 타이틀 자리에 나타나는 입력창 (타이틀과 같은 글씨 크기/굵기)
  searchInput: {
    flex: 1,
    marginRight: 12,
    padding: 0, // iOS/Android 기본 여백을 없애서 타이틀과 위치가 어긋나지 않게 한다
    fontFamily: Fonts.bold,
    fontSize: 20,
  },

  // 카드 스택을 화면 가운데(위아래/좌우)로 오게 하는 바깥 영역
  stackArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center', // 보딩패스를 화면 위쪽이 아니라 중간쯤으로 내린다
  },
  // 카드가 절대좌표(top)로 쌓이는 실제 자리. 맨 앞 카드 기준(top 48 + 카드높이 380)으로 크기를 잡는다
  stackContainer: {
    width: CARD_WIDTH,
    height: STACK_TOP_BY_POSITION[0] + CARD_HEIGHT,
  },

  // 카드 한 장을 감싸는 그림자 전용 껍데기.
  // 카드 자체(styles.card)는 overflow:'hidden'이 있어서 그 위에 그림자를 직접 그리면 잘려 안 보인다.
  // 그래서 overflow가 없는 이 바깥 View에 그림자(shadow*, elevation)를 걸고, 안에 카드를 넣는다.
  cardShadowWrap: {
    position: 'absolute',
    left: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 10, // 카드와 같은 radius를 줘야 그림자 실루엣도 카드 모양과 맞는다
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
  },

  // 보딩패스 카드 한 장 (270 x 380, radius 10)
  // 안의 라벨/값을 전부 position:'absolute'로 배치하기 때문에,
  // 카드 자신의 높이는 (자식 높이 합이 아니라) 여기서 직접 380으로 정해줘야 한다.
  card: {
    width: 270,
    height: 380,
    borderRadius: 10,
    overflow: 'hidden',
  },

  // 상단 (270 x 42)
  topSection: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 270,
    height: 42,
  },
  categoryName: {
    position: 'absolute',
    left: 11,
    top: 9,
    width: 118,
    height: 24,
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: CARD_VALUE_COLOR,
  },
  topIconSlot: {
    position: 'absolute',
    left: 229,
    top: 3,
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 중간 (270 x 170, 피그마 실측: 42 + 170 + 168 = 380)
  middleSection: {
    position: 'absolute',
    left: 0,
    top: 42,
    width: 270,
    height: 170,
  },
  posDepartureLabel: { position: 'absolute', left: 13, top: 19 },
  posDepartureValue: { position: 'absolute', left: 13, top: 33 },
  posVenueLabel: { position: 'absolute', left: 210, top: 19, width: 47 },
  posArrivalValue: { position: 'absolute', left: 182, top: 31 },
  posPlaneIconSlot: {
    position: 'absolute',
    left: 116,
    top: 29,
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posPassengerLabel: { position: 'absolute', left: 13, top: 70 },
  posDateLabel: { position: 'absolute', left: 152, top: 70 },
  posTimeLabel: { position: 'absolute', left: 227, top: 70 },
  posPassengerValue: { position: 'absolute', left: 13, top: 82, width: 130 },
  posDateValue: { position: 'absolute', left: 152, top: 82 },
  posTimeValue: { position: 'absolute', left: 227, top: 82 },
  posSeatLabel: { position: 'absolute', left: 13, top: 116 },
  posCapLabel: { position: 'absolute', left: 227, top: 116 },
  posSeatValue: { position: 'absolute', left: 13, top: 128 },
  posCapValue: { position: 'absolute', left: 227, top: 128 },

  bigValue: {
    fontFamily: Fonts.demiLight,
    fontSize: 24,
    color: CARD_VALUE_COLOR,
  },
  smallLabel: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: CARD_LABEL_COLOR,
  },
  smallValue: {
    fontFamily: Fonts.demiLight,
    fontSize: 12,
    color: CARD_VALUE_COLOR,
  },
  // 피그마 실측: NAME/TIME/SEAT/CAP/CONTENT 값엔 letterSpacing 0.24가 있고, DATE 값만 없다
  trackedValue: {
    letterSpacing: 0.24,
  },

  // 하단 (270 x 168)
  bottomSection: {
    position: 'absolute',
    left: 0,
    top: 212,
    width: 270,
    height: 168,
  },
  contentBox: {
    position: 'absolute',
    left: 85,
    top: 16,
    width: 100,
    height: 136,
  },
  // 원래 피그마 좌표는 top 0인데, 콘텐츠명이 두 줄이 되면 아래 qrPlaceholder(top 36)와
  // 겹치는 문제가 있어서 라벨/값을 한 줄(12px)만큼 위로 올렸다 (0 -> -12)
  contentLabel: {
    position: 'absolute',
    left: 2,
    top: -12,
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: CARD_LABEL_COLOR,
  },
  // 값도 라벨과 같이 한 줄 위로 올렸다 (12 -> 0)
  contentValue: {
    position: 'absolute',
    left: 2,
    top: 0,
    width: 96,
    fontFamily: Fonts.demiLight,
    fontSize: 12,
    color: CARD_VALUE_COLOR,
    letterSpacing: 0.24,
  },
  // QR코드가 나중에 들어갈 자리. 지금은 회색 네모로만 표시해둔다
  qrPlaceholder: {
    position: 'absolute',
    left: 0,
    top: 36,
    width: 100,
    height: 100,
    backgroundColor: '#CCCCCC',
    borderRadius: 10,
  },
});
