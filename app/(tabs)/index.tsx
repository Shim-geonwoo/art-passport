// 보딩패스(Boarding Pass) 화면
//
// 앱을 켰을 때 가장 먼저 보이는 첫 화면(랜딩)이다.
// (파일 이름이 index.tsx이기 때문에 탭 그룹의 기본 화면이 된다.)
//
// docs/boarding-pass-single.png (카드 한 장) / docs/boarding-pass-stack.png (여러 장 겹침)
// 시안과 docs/design-system.md "8-1. 보딩패스 카드" 실측값을 그대로 따른다.
//
// 화면 동작 규칙:
// - 예매를 마치면 바로 보딩패스로 올라오고, 관람 시각이 지나면 사라진다(그때 여권 스탬프가 된다).
// - 마이페이지에서 취소한 예매는 보딩패스에서도 즉시 사라진다.
// - 여러 장이면 애플 월렛처럼 겹쳐 쌓고, 스크롤로 뒤에 깔린 카드를 볼 수 있다.
// - 보여줄 티켓이 하나도 없으면, 안내 문구 없이 완전히 빈 화면으로 둔다.
// - 임박(오늘 포함 3일 이내)한 티켓에만 D-day 배지를 붙인다.
// - 카드에 찍히는 이름(PASSENGER)은 로그인한 회원의 닉네임이다.

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RefreshErrorBanner } from '@/components/refresh-error-banner';
import { CategoryColors, CategoryIcons, CategoryLabels, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useAuth } from '@/contexts/auth';
import { useBookings } from '@/contexts/bookings';
import { DerivedBooking, deriveBoardingPasses } from '@/data/bookings';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useRefreshing } from '@/hooks/use-refreshing';

// 카드 스택 한 칸의 크기 (docs/design-system.md 8-1: 270 x 380)
const CARD_WIDTH = 270;
const CARD_HEIGHT = 380;

// 스택에서 카드가 있을 수 있는 자리(앞/중간/뒤)별 top 값. index 0 = 맨 앞.
// 뒤 카드일수록 top이 작아서(=더 위) 앞 카드 위로 살짝 삐져나와 보인다.
//
// 간격이 40px인 이유: 뒤 카드에서 드러나는 부분에 카테고리 이름(EXHIBITION 등)이
// 온전히 보여야 한다. 카드 안에서 그 요소들이 놓인 자리는 이렇다 —
//   카테고리 아이콘  3 ~ 40
//   카테고리 라벨    9 ~ 33
//   D-day 배지      11 ~ 31
// 예전 값(24px)에서는 라벨 위쪽 절반만 나오고 잘렸다. 40px이면 셋 다 온전히 드러난다.
// (4의 배수 - design-system.md "7. 레이아웃"의 간격 규칙)
const STACK_TOP_BY_POSITION = [80, 40, 0];

// 자리별 그림자 값. 앞으로 올수록 그림자가 진하고 커진다.
const STACK_SHADOW_BY_POSITION = [
  { shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }, // 맨 앞
  { shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 }, // 중간
  { shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 }, // 맨 뒤
];

const STACK_ANIMATION_DURATION_MS = 350;

// 스택에 한 번에 겹쳐 보여주는 카드 수. 자리(STACK_TOP_BY_POSITION)가 3개뿐이라
// 4장째부터는 3장째와 같은 자리에 겹쳐서 안 보이기 때문에, 애플 월렛처럼
// 앞 3장만 쌓아 보여주고 나머지는 "+N장" 표시로 알린다.
const MAX_VISIBLE_CARDS = STACK_TOP_BY_POSITION.length;

// 자리가 3개보다 뒤인 경우(스택을 돌리는 중 잠깐 지나가는 상태)는 "맨 뒤" 값을 그대로 재사용한다
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

// 좌석은 자유석 고정, 인원(CAP)은 결제 화면에서 정한 booking.quantity를 쓴다.
// (예매자 이름은 로그인한 회원의 닉네임을 쓴다 — 아래 BoardingPassScreen 참고)
const SEAT_INFO = '자유석';

// 프로필을 아직 못 불러왔을 때 쓸 이름. 회원가입 트리거가 넣는 기본 닉네임과 같은 값이다.
const FALLBACK_PASSENGER_NAME = '사용자';

// QR 자리 크기 (피그마 실측 100x100). QR은 사방에 여백이 있어야 스캐너가 인식하므로,
// 흰 판을 100으로 두고 그 안에 코드를 조금 작게 그린다.
const QR_SIZE = 100;
const QR_PADDING = 6;

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
  dDayText: string | null; // 임박한 티켓에만 붙는 배지 문구 ('D-DAY' / 'D-1'). 임박 아니면 null
};

// 임박한 티켓에 붙일 배지 문구를 만든다. 임박이 아니면 배지를 달지 않는다(null).
// 월렛엔 예매완료 티켓이 전부 쌓이기 때문에, 여러 장이 쌓여도 "지금 챙길 것"이 묻히지 않게
// 임박한 카드에만 이 배지를 붙인다. (임박 판정 자체는 data/bookings.ts의 isSoon이 한다)
function dDayLabel(booking: DerivedBooking): string | null {
  if (!booking.isSoon) {
    return null;
  }
  return booking.daysUntilShow === 0 ? 'D-DAY' : `D-${booking.daysUntilShow}`;
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

// 중앙 데이터(data/bookings.ts)에서 파생된 예매 한 건을,
// 이 화면의 카드가 그릴 수 있는 표현용 형태로 옮긴다.
// "지금 보딩패스로 보여줄지"의 판단(=아직 관람 전인가)과 정렬은 deriveBoardingPasses가 이미 해준다.
function toCardBooking(booking: DerivedBooking, passengerName: string): Booking {
  return {
    id: booking.id,
    genre: booking.event.genre,
    eventTitle: booking.event.title,
    venueName: booking.event.venueName,
    passengerName,
    showAt: booking.showAt,
    dateText: formatDate(booking.showAt),
    // 전시(기간형, showEndAt 있음)는 시각이 없는 관람이라 시간 칸을 비워 둔다
    timeText: booking.event.showEndAt ? '' : formatTime(booking.showAt),
    seatInfo: SEAT_INFO,
    capacity: booking.quantity, // 결제 화면에서 고른 인원 (deriveBooking이 1 이상으로 정규화해 둠)
    dDayText: dDayLabel(booking),
  };
}

export default function BoardingPassScreen() {
  // 폰의 라이트/다크 설정을 읽어서, 화면 배경색만 그에 맞게 바꾼다.
  // (카드 자체는 카테고리 색을 그대로 쓰기 때문에 라이트/다크 상관없이 동일하다)
  // 이 화면은 다크모드가 기본이라, "라이트로 확실히 설정된 경우"만 라이트를 쓴다.
  const colorScheme = useColorScheme();
  const screenBackground = colorScheme === 'light' ? SCREEN_BACKGROUND_LIGHT : SCREEN_BACKGROUND_DARK;
  // 헤더 글씨/아이콘도 화면 배경(라이트=흰색/다크=진회색)에 맞춰 색을 바꾼다
  const headerColor = colorScheme === 'light' ? Colors.textPrimary : Colors.textOnColor;
  // 이 화면은 배경색만 따로 쓰고, 글씨·안내 배너 같은 나머지는 공통 토큰을 그대로 쓴다.
  // 배경과 같은 기준("라이트로 확실히 설정된 경우만 라이트")으로 골라야 색이 서로 어긋나지 않는다.
  const theme = colorScheme === 'light' ? Theme.light : Theme.dark;
  const headerPlaceholderColor = theme.textSecondary;

  // "지금" 시각을 화면이 처음 열릴 때 한 번만 고정한다 (렌더링 중간에 결과가 안 바뀌게)
  const now = useNow();

  // 앱 전체가 공유하는 예매 목록 (앱 최상단 BookingsProvider)
  const { bookings, error, refresh } = useBookings();
  const { profile } = useAuth();

  // 당겨서 새로고침. 이 화면은 앱을 켜자마자 보이는 곳인데, 예매 목록을 다시 받아오는 시점이
  // 로그인 직후와 예매·취소 직후뿐이라 앱을 켜 둔 채로는 다른 기기에서 산 티켓이 영영 안 들어왔다.
  // (useNow는 "지금 시각"만 새로 읽을 뿐 서버를 다시 부르지는 않는다)
  const { isRefreshing, onRefresh } = useRefreshing(refresh);

  // 보딩패스 PASSENGER 칸에 찍을 이름 = 로그인한 회원의 닉네임(public.users).
  // 프로필을 아직 못 불러온 아주 짧은 순간엔 기본값으로 대체한다.
  const passengerName = profile?.nickname || FALLBACK_PASSENGER_NAME;

  // 보딩패스로 보여줄 예매만(아직 관람 전) 관람일 가까운 순으로 이미 걸러져 온다.
  // 취소한 예매는 status가 '취소'라 deriveBoardingPasses가 알아서 빼준다.
  const visibleBookings = deriveBoardingPasses(bookings, now).map((booking) =>
    toCardBooking(booking, passengerName)
  );

  // 사용자가 카드를 탭해서 만든 앞-뒤 순서. index 0 = 맨 앞 카드.
  // 처음엔 관람일이 가까운 순서를 그대로 쓴다.
  const [frontOrder, setFrontOrder] = useState<string[]>(() =>
    visibleBookings.map((booking) => booking.id)
  );

  // 실제로 그릴 스택 순서.
  // frontOrder에는 취소돼서 이제 안 보이는 카드의 id가 남아 있을 수 있으므로,
  // "지금 보이는 카드"만 남기고 걸러낸다. 이렇게 해야 앞 카드가 취소됐을 때
  // 뒷 카드들이 빈 자리를 메우며 한 칸씩 앞으로 당겨진다.
  // (frontOrder에 아직 없는 새 카드는 뒤에 붙인다)
  const visibleIds = visibleBookings.map((booking) => booking.id);
  const stackOrder = [
    ...frontOrder.filter((id) => visibleIds.includes(id)),
    ...visibleIds.filter((id) => !frontOrder.includes(id)),
  ];

  // 카드마다 "지금 스택에서 몇 번째 자리인지"를 담는 애니메이션 값을 하나씩 준비해둔다.
  // ref에 담아서 한 번만 만들고 계속 재사용한다 (렌더될 때마다 새로 만들면 애니메이션이 끊긴다).
  const stackAnimsRef = useRef<Record<string, Animated.Value>>({});
  visibleBookings.forEach((booking) => {
    if (!stackAnimsRef.current[booking.id]) {
      stackAnimsRef.current[booking.id] = new Animated.Value(Math.max(0, stackOrder.indexOf(booking.id)));
    }
  });

  // 스택 순서가 바뀔 때마다(탭해서 앞으로 꺼냈든, 취소돼서 한 장 빠졌든)
  // 각 카드를 자기 새 자리로 350ms 동안 부드럽게 움직인다.
  // zIndex(누가 위에 그려질지)는 애니메이션 없이 즉시 바뀐다.
  const stackOrderKey = stackOrder.join(',');
  useEffect(() => {
    stackOrder.forEach((id, position) => {
      const animValue = stackAnimsRef.current[id];
      if (!animValue) {
        return;
      }
      Animated.timing(animValue, {
        toValue: position,
        duration: STACK_ANIMATION_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false, // top/그림자는 레이아웃 속성이라 네이티브 드라이버를 못 쓴다
      }).start();
    });
    // 순서가 실제로 바뀐 경우에만 실행한다 (stackOrder 배열은 매 렌더 새로 만들어져서 deps로 못 쓴다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackOrderKey]);

  // 카드를 탭했을 때 실행: 그 카드를 맨 앞으로, 나머지는 한 칸씩 뒤로 민다.
  // (실제 움직임은 위 useEffect가 stackOrder 변화를 보고 처리한다)
  function bringCardToFront(bookingId: string) {
    if (stackOrder[0] === bookingId) {
      return; // 이미 맨 앞이면 아무것도 하지 않는다
    }
    setFrontOrder([bookingId, ...stackOrder.filter((id) => id !== bookingId)]);
  }

  // "+N장"을 탭했을 때: 맨 앞 카드를 맨 뒤로 보낸다.
  // 그러면 뒤에 숨어 있던 카드가 한 칸씩 앞으로 당겨와 스택에 나타난다.
  // (카드를 탭하는 것만으로는 4장째 이후를 볼 수 없어서, 이 버튼이 유일한 통로다)
  function cycleStack() {
    if (stackOrder.length <= MAX_VISIBLE_CARDS) {
      return;
    }
    const [front, ...rest] = stackOrder;
    setFrontOrder([...rest, front]);
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

  // 티켓이 하나도 없는 경우를 따로 분기하지 않는다 — 아래 그리기 코드가 그대로 빈 화면을 만든다
  // (카드 목록이 비고, "+N장" 뱃지도 안 붙는다). 예전엔 여기서 헤더만 그리고 일찍 돌아갔는데,
  // 그러면 티켓이 없을 때는 당겨서 새로고침을 할 수 없었다 — 하필 새로고침이 가장 필요한 상황이다.
  // ("안내 문구 없이 빈 화면"이라는 규칙은 그대로다. 헤더와 검색 아이콘만 계속 보인다)

  // 애니메이션 보간(interpolate)에 쓸 "자리별 값" 배열. 카드 수만큼 만들되 최소 2칸은 있어야 한다
  // (interpolate는 최소 2개의 입력/출력 값 쌍이 필요하다).
  const slotCount = Math.max(visibleBookings.length, 2);
  const stackPositions = Array.from({ length: slotCount }, (_, i) => i);
  const topRange = stackPositions.map((position) => getStackSlot(position).top);
  const shadowOpacityRange = stackPositions.map((position) => getStackSlot(position).shadowOpacity);
  const shadowRadiusRange = stackPositions.map((position) => getStackSlot(position).shadowRadius);
  const elevationRange = stackPositions.map((position) => getStackSlot(position).elevation);

  // 앞에서부터 MAX_VISIBLE_CARDS장만 실제로 그린다. 나머지는 "+N장"으로만 알린다.
  const renderedIds = stackOrder.slice(0, MAX_VISIBLE_CARDS);
  const hiddenCount = stackOrder.length - renderedIds.length;

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

      {/* 갱신에 실패했으면 한 줄로 알린다. 받아둔 티켓은 그대로 두고 위에 얹기만 한다 —
          조용히 넘어가면 "방금 예매했는데 지갑에 없다"를 사용자가 오해하게 된다.
          (첫 조회부터 실패한 경우는 BookingsProvider가 전체 화면으로 안내하므로 여기까지 오지 않는다) */}
      {error ? <RefreshErrorBanner message={error} onRetry={refresh} theme={theme} /> : null}

      {/* 카드 스택 영역: 화면 가운데에 카드 3장이 겹쳐 쌓인 고정 자리를 만든다.
          ScrollView인 이유는 스크롤이 필요해서가 아니라 당겨서 새로고침을 붙이기 위해서다.
          카드가 몇 장이든 화면 안에 들어가므로 실제로 스크롤되지는 않는다. */}
      <ScrollView
        style={styles.stackScroll}
        contentContainerStyle={styles.stackArea}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={headerColor} // iOS 스피너
            colors={[headerColor]} // Android 스피너
            progressBackgroundColor={screenBackground} // Android 스피너 뒤 원판
          />
        }>
        <View style={styles.stackContainer}>
          {visibleBookings
            .filter((booking) => renderedIds.includes(booking.id))
            .map((booking) => {
            const categoryColor = CategoryColors[booking.genre];
            const animValue = stackAnimsRef.current[booking.id];
            const stackPosition = stackOrder.indexOf(booking.id);

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

        {/* 스택에 다 못 보여준 카드가 몇 장 남았는지. 누르면 맨 앞 카드가 뒤로 가면서 다음 카드가 나온다 */}
        {hiddenCount > 0 ? (
          <Pressable style={styles.moreBadge} onPress={cycleStack}>
            <Text style={styles.moreBadgeText}>+{hiddenCount}장</Text>
          </Pressable>
        ) : null}
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
        {/* 'CLASSIC & DANCE'처럼 긴 라벨이 2줄로 넘어가지 않게 한 줄 고정 + 필요하면 글자 크기 축소 */}
        <Text
          style={[styles.categoryName, booking.dDayText ? styles.categoryNameWithBadge : null]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {categoryLabel}
        </Text>
        {/* D-day 배지: 임박한 티켓에만. 카테고리 아이콘 왼쪽 빈자리에 놓는다.
            흰 알약 + 카드와 같은 카테고리 색 글씨 — 5가지 카테고리 색 위에서 전부 또렷하게 읽히고,
            새 색을 들이지 않으면서 카드와 한 몸처럼 보인다. */}
        {booking.dDayText ? (
          <View style={styles.dDayBadge}>
            <Text style={[styles.dDayText, { color: categoryColor }]}>{booking.dDayText}</Text>
          </View>
        ) : null}
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

        {/* 오른쪽: 관람 장소(도착). 맞은편 '자택'과 같은 10px로 고정한다.
            예전엔 adjustsFontSizeToFit으로 글자 수에 맞춰 줄였는데, 그러면 장소 이름 길이에 따라
            카드마다 5~10px로 제각각이 됐다(맞은편 '자택'은 항상 10px이라 좌우도 안 맞았다).
            이제는 크기를 고정하고, 이름이 길면 오른쪽 정렬이라 왼쪽으로 늘어난다. */}
        <Text style={[styles.smallLabel, styles.posVenueLabel]} numberOfLines={1}>
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

      {/* 하단 (270 x 168): CONTENT 라벨/값 + QR (100x100) */}
      <View style={styles.bottomSection}>
        <View style={styles.contentBox}>
          <Text style={styles.contentLabel}>CONTENT</Text>
          {/* 콘텐츠명이 길어서 두 줄로 넘어가도 아래 QR을 안 가리도록,
              라벨/값을 원래 좌표(top 0 / top 12)보다 한 줄(12px) 위로 올려뒀다 */}
          <Text style={styles.contentValue} numberOfLines={2}>
            {booking.eventTitle}
          </Text>
          {/* 예매번호(booking.id)를 담은 QR. 흰 바탕에 네이비로 그려서 어떤 카테고리 색 위에서도 읽힌다.
              예매 상세의 "예매번호"와 같은 값이다(거기선 보기 좋으라고 대문자로 표시할 뿐).
              실제 공연장에서 쓰려면 위조 방지 서명이 필요하지만, 이 앱은 테스트 결제 전용이라
              번호만 담는다. */}
          <View style={styles.qrBox}>
            <QRCode
              value={booking.id}
              size={QR_SIZE - QR_PADDING * 2}
              color={Colors.navy}
              backgroundColor={Colors.textOnColor}
            />
          </View>
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

  // 헤더 아래 남은 세로 공간을 스크롤 영역이 전부 차지하게 한다.
  // (이게 없으면 ScrollView가 내용 높이에 맞춰 줄어들어서, 당길 수 있는 범위가 카드 높이로 좁아진다)
  stackScroll: {
    flex: 1,
  },
  // 카드 스택을 화면 가운데(위아래/좌우)로 오게 하는 바깥 영역.
  // ScrollView의 contentContainerStyle이라 flex가 아니라 flexGrow를 쓴다 —
  // "남는 공간을 채우되, 내용이 더 크면 그만큼 늘어난다"가 여기서 필요한 동작이다.
  stackArea: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center', // 보딩패스를 화면 위쪽이 아니라 중간쯤으로 내린다
  },
  // 카드가 절대좌표(top)로 쌓이는 실제 자리. 맨 앞 카드 기준(top 48 + 카드높이 380)으로 크기를 잡는다
  stackContainer: {
    width: CARD_WIDTH,
    height: STACK_TOP_BY_POSITION[0] + CARD_HEIGHT,
  },

  // 스택 아래 "+N장" 알약 뱃지 (design-system.md: radius-pill 20, gold는 뱃지 포인트로 소량)
  moreBadge: {
    marginTop: 16, // md
    borderRadius: 20, // radius-pill
    paddingHorizontal: 12,
    paddingVertical: 4, // xs
    backgroundColor: Colors.gold,
  },
  moreBadgeText: {
    fontFamily: Fonts.medium,
    fontSize: 11, // Label 크기
    color: Colors.textOnColor,
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
    width: 210, // 오른쪽 아이콘(left 229) 앞까지 넓혀서 'CLASSIC & DANCE'가 한 줄에 들어가게 한다
    height: 24,
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: CARD_VALUE_COLOR,
  },
  // D-day 배지가 붙는 날엔 라벨이 배지 밑으로 들어가지 않게 폭을 줄인다 (배지는 left 163부터 시작)
  categoryNameWithBadge: {
    width: 148,
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
  // D-day 배지 (임박한 티켓에만). 카테고리 아이콘(left 229) 바로 왼쪽에 오른쪽 정렬로 붙는다.
  dDayBadge: {
    position: 'absolute',
    right: 45, // 270 - 45 = 225 에서 끝난다 (아이콘 앞 4px 여백)
    top: 11,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10, // 알약 모양 (height의 절반)
    backgroundColor: Colors.textOnColor, // 흰 알약
    alignItems: 'center',
    justifyContent: 'center',
  },
  dDayText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.3,
    // 글씨 색은 카드의 카테고리 색을 그대로 쓴다 (컴포넌트에서 넘겨준다)
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
  // 장소 이름은 오른쪽 끝을 기준으로 붙인다. 아래 ARRIVAL 값(SEOUL)도 오른쪽 끝이 257px이라
  // (left 182 + 24px 글씨 폭) 둘이 한 쌍으로 오른쪽 정렬된다 —
  // 왼쪽에서 '자택'/'HOME'이 둘 다 left 13으로 왼쪽 정렬된 것의 거울이다.
  //
  // maxWidth 105: 카탈로그에서 가장 긴 장소 이름('예술의전당 CJ토월극장')이 10px에서 약 104px다.
  // 오른쪽 끝 257에서 105px이면 시작점이 x=153 — 비행기 아이콘 칸(left 116, 폭 37)이 끝나는
  // 지점이라 겹치지 않는다. 이보다 긴 이름이 들어오면 말줄임(…)으로 잘린다.
  posVenueLabel: { position: 'absolute', right: 13, top: 19, maxWidth: 105, textAlign: 'right' },
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
  // QR이 들어가는 흰 판. 피그마 실측 자리(left 0, top 36, 100x100)를 그대로 쓴다.
  // QR 자체는 여백(quiet zone)이 있어야 인식되므로, 흰 판 안쪽에 조금 작게 그린다.
  qrBox: {
    position: 'absolute',
    left: 0,
    top: 36,
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: 10,
    backgroundColor: Colors.textOnColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
