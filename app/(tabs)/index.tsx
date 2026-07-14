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
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryColors, CategoryIcons, CategoryLabels, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 보딩패스로 보여줄 수 있는 기간: 관람 3일 전부터 관람 시각까지
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BOARDING_WINDOW_MS = 3 * ONE_DAY_MS;

// 카드를 겹쳐 쌓을 때, 뒤 카드가 앞으로 얼마나 삐져나와 보일지(px)
const STACK_PEEK_HEIGHT = 64;

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

  // 카드 한 장의 실제 높이를 측정해서, 뒤 카드를 얼마나 겹칠지 계산하는 데 쓴다
  const [cardHeight, setCardHeight] = useState(0);
  // 카드마다 스크롤 컨테이너 안에서의 y 좌표를 기억해둔다 (검색 결과로 스크롤 이동할 때 쓴다)
  const cardPositionsRef = useRef<Record<string, number>>({});

  function handleCardWrapLayout(bookingId: string, index: number, event: LayoutChangeEvent) {
    const { y, height } = event.nativeEvent.layout;
    cardPositionsRef.current[bookingId] = y;
    if (index === 0 && cardHeight === 0) {
      setCardHeight(height);
    }
  }

  // 검색창 상태: 검색 아이콘을 누르면 열리고, 글자를 입력하면 콘텐츠명/장소로 찾는다
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  function handleToggleSearch() {
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
    } else {
      setIsSearchOpen(true);
    }
  }

  // 검색어가 바뀔 때마다 콘텐츠명(eventTitle) 또는 장소(venueName)에 포함되는
  // 첫 번째 보딩패스를 찾아서, 그 카드가 보이는 위치까지 스크롤을 이동시킨다
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

    const matchedY = matchedBooking ? cardPositionsRef.current[matchedBooking.id] : undefined;
    if (matchedY !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(matchedY - 16, 0), animated: true });
    }
  }, [searchQuery, visibleBookings]);

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
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
        {visibleBookings.map((booking, index) => {
          // 첫 번째 카드는 그대로, 두 번째 카드부터는 위로 끌어올려서 앞 카드 뒤에 겹치게 한다
          const overlapStyle =
            index > 0 && cardHeight > 0 ? { marginTop: -(cardHeight - STACK_PEEK_HEIGHT) } : null;

          return (
            <View
              key={booking.id}
              style={[styles.cardWrap, { zIndex: index }, overlapStyle]}
              onLayout={(event) => handleCardWrapLayout(booking.id, index, event)}
            >
              <BoardingPassCard booking={booking} />
            </View>
          );
        })}
      </ScrollView>
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

  scrollContent: {
    flexGrow: 1, // 내용이 화면보다 짧을 때도 justifyContent가 작동하도록 한다
    alignItems: 'center', // 카드 폭이 270 고정이라 화면 가운데로 정렬한다
    justifyContent: 'center', // 보딩패스를 화면 위쪽이 아니라 중간쯤으로 내린다
    paddingVertical: 32, // 2xl. 카드가 화면을 꽉 채울 땐 위아래 최소 여백 역할
  },

  // 카드를 감싸는 겹침 단위. 두 번째 장부터 marginTop을 음수로 줘서 겹친다
  cardWrap: {
    // 스타일은 대부분 인라인으로 계산해서 넣는다 (zIndex, marginTop)
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
