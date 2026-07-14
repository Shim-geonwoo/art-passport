// 여권(Passport) 화면 - 스탬프 페이지
//
// docs/passport-stamp-full.png (9칸 다 채움 + 쿠폰)
// docs/passport-stamp-progress.png (진행 중 + 빈 칸은 점선) 시안과
// docs/design-system.md 의 "스탬프 페이지 규칙", "1-3 라이트/다크 모드"를 참고했다.
//
// 규칙 요약 (docs/data-structure.md):
// - 여권 한 페이지 = 스탬프 9칸 (3x3 그리드). 항상 9칸을 다 그린다.
// - 관람완료한 예매 하나 = 스탬프 하나. 채운 칸만큼만 스탬프, 나머지는 점선 빈 칸.
// - 9칸을 다 채우면 쿠폰 1장(다음 예매 10% 할인)이 발급되고, 쿠폰 배너가 뜬다.
// - 아직 실제 데이터/이미지가 없어서, 아래 더미 데이터로만 화면을 채운다.

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { CategoryColors, CategoryIcons, Colors, Genre, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useColorScheme } from '@/hooks/use-color-scheme';

// 여권 한 페이지에 들어가는 스탬프 칸 개수 (3x3 고정, 항상 이만큼 그린다)
const TOTAL_STAMP_SLOTS = 9;
// 스탬프 칸 비율 (가로 / 세로). 1보다 작으면 세로가 조금 더 긴 카드가 된다
const STAMP_ASPECT_RATIO = 0.8;
// 칸과 칸 사이 가로 간격
const GRID_GAP = 8;
// 스탬프 칸 모서리 둥글기 (design-system.md radius-md)
const STAMP_RADIUS = 12;

// 스탬프 1개(=관람완료한 예매 1건)를 표현하는 더미 데이터 모양
type Stamp = {
  id: string;
  title: string; // 공연/전시 제목
  genre: Genre; // 장르 (카테고리 색 + 아이콘을 결정한다)
  venueName: string; // 관람 장소
  watchedDate: string; // 관람일 (YYYY.MM.DD)
};

// 데모 스위치: 지금은 진짜 데이터가 없어서, 아래 return 값을 바꿔가며
// 시안 2가지(진행 중 / 다 채움) 상태를 둘 다 확인할 수 있게 해뒀다.
// 'progress' = 스탬프 6개 (빈 칸 3개, 점선으로 표시)
// 'full'     = 스탬프 9개 (쿠폰 배너 표시)
function getDemoState(): 'progress' | 'full' {
  return 'progress'; // <- 'full'로 바꾸면 쿠폰 배너 상태를 볼 수 있다
}
const DEMO_STATE = getDemoState();

// 진행 중 상태용 더미 스탬프 6개
const DUMMY_STAMPS_PROGRESS: Stamp[] = [
  { id: '1', title: 'Portes Ouvertes', genre: '전시', venueName: '리움미술관', watchedDate: '2026.07.13' },
  { id: '2', title: '백조의 호수', genre: '클래식·무용', venueName: '예술의전당', watchedDate: '2026.06.28' },
  { id: '3', title: 'Summer Sound Fest', genre: '콘서트', venueName: '올림픽공원', watchedDate: '2026.06.15' },
  { id: '4', title: '햄릿', genre: '연극', venueName: '대학로 예술극장', watchedDate: '2026.05.30' },
  { id: '5', title: '레베카', genre: '뮤지컬', venueName: '샤롯데씨어터', watchedDate: '2026.05.10' },
  { id: '6', title: 'Portes Ouvertes II', genre: '전시', venueName: '리움미술관', watchedDate: '2026.04.22' },
];

// 다 채운 상태용 더미 스탬프 9개 (위 6개 + 3개 더)
const DUMMY_STAMPS_FULL: Stamp[] = [
  ...DUMMY_STAMPS_PROGRESS,
  { id: '7', title: 'Portes Ouvertes III', genre: '전시', venueName: '리움미술관', watchedDate: '2026.04.02' },
  { id: '8', title: '호두까기 인형', genre: '클래식·무용', venueName: '예술의전당', watchedDate: '2026.03.20' },
  { id: '9', title: '라이온킹', genre: '뮤지컬', venueName: '블루스퀘어', watchedDate: '2026.03.01' },
];

const DUMMY_STAMPS = DEMO_STATE === 'full' ? DUMMY_STAMPS_FULL : DUMMY_STAMPS_PROGRESS;

export default function PassportScreen() {
  // 폰의 라이트/다크 설정을 읽어서, 그에 맞는 색 묶음을 고른다
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;

  // 그리드의 실제 가로 폭을 측정해서 칸 하나의 정확한 px 크기를 계산한다.
  // (점선 테두리를 SVG로 정확히 그리려면 %가 아니라 실제 px 값이 필요하다)
  const [gridWidth, setGridWidth] = useState(0);
  const cellWidth = gridWidth > 0 ? (gridWidth - GRID_GAP * 2) / 3 : 0;
  const cellHeight = cellWidth / STAMP_ASPECT_RATIO;

  function handleGridLayout(event: LayoutChangeEvent) {
    setGridWidth(event.nativeEvent.layout.width);
  }

  // 9칸을 항상 채운다: 더미 데이터가 있는 칸은 스탬프(Stamp), 없는 칸은 null(빈 칸)
  const slots: (Stamp | null)[] = Array.from(
    { length: TOTAL_STAMP_SLOTS },
    (_, index) => DUMMY_STAMPS[index] ?? null
  );
  // 3칸씩 잘라서 3줄로 만든다 (3x3 그리드)
  const rows = [slots.slice(0, 3), slots.slice(3, 6), slots.slice(6, 9)];

  // 9칸을 다 채웠는지 여부 -> 쿠폰 배너를 보여줄지 결정
  const isPageComplete = DUMMY_STAMPS.length >= TOTAL_STAMP_SLOTS;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 상단: ART PORT 로고 + 검색 아이콘 */}
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.text }]}>ART PORT</Text>
          <Ionicons name="search-outline" size={22} color={theme.text} />
        </View>

        {/* 스탬프 3x3 그리드 (항상 9칸: 스탬프 + 점선 빈 칸) */}
        <View onLayout={handleGridLayout}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gridRow}>
              {row.map((stamp, colIndex) =>
                stamp ? (
                  <StampCard key={stamp.id} stamp={stamp} width={cellWidth} height={cellHeight} />
                ) : (
                  <EmptyStampSlot
                    key={`empty-${rowIndex}-${colIndex}`}
                    width={cellWidth}
                    height={cellHeight}
                    borderColor={theme.dashedBorder}
                    backgroundColor={theme.emptyCellBackground}
                  />
                )
              )}
            </View>
          ))}
        </View>

        {/* 9칸을 다 채웠을 때만 쿠폰 배너 표시 */}
        {isPageComplete && (
          <View style={styles.couponBanner}>
            <Text style={styles.couponText}>WE GOT A COUPON!</Text>
            <View style={styles.couponButton}>
              <Text style={styles.couponButtonText}>리워드함으로 가기</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 페이지 번호: 스크롤 영역 밖에 둬서, 항상 화면 맨 아래 · 탭 바 바로 위에 고정된다 */}
      <View style={[styles.pageNumberBar, { backgroundColor: theme.background }]}>
        <Text style={[styles.pageNumber, { color: theme.textSecondary }]}>01</Text>
      </View>
    </SafeAreaView>
  );
}

// 채워진 스탬프 칸 하나: 포스터 자리 + 하단 정보 띠(날짜 + 장소)
function StampCard({ stamp, width, height }: { stamp: Stamp; width: number; height: number }) {
  const categoryColor = CategoryColors[stamp.genre];
  const genreIconName = CategoryIcons[stamp.genre];

  return (
    <View style={[styles.stampCell, { width, height }]}>
      {/* 포스터 이미지 자리. 실제 이미지가 없어서 카테고리 색 박스로 대체 */}
      <View style={[styles.posterPlaceholder, { backgroundColor: categoryColor }]}>
        <Ionicons name="image-outline" size={28} color={Colors.textOnColor} style={styles.posterIcon} />
      </View>

      {/* 하단 정보 띠: 날짜는 왼쪽, 장소는 오른쪽. 장르 아이콘은 날짜 위에 살짝 겹친다 */}
      <View style={[styles.stampFooter, { backgroundColor: categoryColor }]}>
        <View style={styles.stampDateWrap}>
          <MaterialCommunityIcons
            name={genreIconName}
            size={16}
            color={Colors.textOnColor}
            style={styles.stampGenreIcon}
          />
          <Text style={styles.stampDate}>{stamp.watchedDate}</Text>
        </View>
        <Text style={styles.stampVenue} numberOfLines={1}>
          {stamp.venueName}
        </Text>
      </View>
    </View>
  );
}

// 안 채워진 스탬프 칸 하나: 점선 테두리만 있는 빈 자리
function EmptyStampSlot({
  width,
  height,
  borderColor,
  backgroundColor,
}: {
  width: number;
  height: number;
  borderColor: string;
  backgroundColor: string;
}) {
  // 그리드 폭을 아직 측정하기 전(최초 렌더링 찰나)에는 크기가 0이라 그리지 않는다
  if (width === 0 || height === 0) {
    return <View style={{ width, height }} />;
  }

  const strokeWidth = 1.5;

  return (
    <View style={[styles.emptyStampCell, { width, height, backgroundColor }]}>
      {/* View의 borderStyle: 'dashed'는 모서리가 둥글면(borderRadius) 일부 기기에서
          점선이 깨져 보이는 문제가 있어서, SVG로 점선 테두리를 직접 그린다 */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={STAMP_RADIUS}
          ry={STAMP_RADIUS}
          fill="none"
          stroke={borderColor}
          strokeWidth={strokeWidth}
          strokeDasharray="6,5"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1, // 남은 세로 공간을 다 차지해서, 페이지 번호 바가 항상 맨 아래로 밀리게 한다
  },
  scrollContent: {
    paddingHorizontal: 16, // 화면 좌우 여백 (design-system.md 레이아웃 기준)
    paddingBottom: 24, // xl
  },

  // 상단 로고 + 검색 아이콘
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16, // md
    marginBottom: 8, // sm
  },
  logo: {
    fontFamily: Fonts.bold,
    fontSize: 22, // Title 크기 토큰 재사용
    letterSpacing: 1,
  },

  // 스탬프 그리드 한 줄 (3칸)
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20, // 줄 사이 간격
  },

  // 채워진 스탬프 칸
  stampCell: {
    borderRadius: STAMP_RADIUS,
    overflow: 'hidden', // 안의 색 박스가 둥근 모서리 밖으로 안 나가게
  },
  posterPlaceholder: {
    flex: 1, // 하단 정보 띠를 뺀 나머지 공간을 다 채운다
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterIcon: {
    opacity: 0.6, // "포스터가 들어올 자리"라는 느낌만 주는 워터마크 아이콘
  },
  stampFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8, // sm
    paddingVertical: 6,
  },
  stampDateWrap: {
    position: 'relative',
    paddingLeft: 14, // 장르 아이콘이 겹쳐 들어올 자리
  },
  stampGenreIcon: {
    position: 'absolute',
    left: -2,
    top: -10, // 날짜 텍스트 위로 살짝 올라와 겹치도록 배치
  },
  stampDate: {
    fontFamily: Fonts.regular,
    fontSize: 11, // Label 크기
    color: Colors.textOnColor,
  },
  stampVenue: {
    fontFamily: Fonts.medium,
    fontSize: 11,
    color: Colors.textOnColor,
    marginLeft: 8, // sm: 날짜와 겹치지 않게
    flexShrink: 1, // 장소 이름이 길면 줄임표(...)로 잘리게
    textAlign: 'right',
  },

  // 안 채워진 스탬프 칸 (점선 테두리는 SVG로 그린다)
  emptyStampCell: {
    borderRadius: STAMP_RADIUS,
    overflow: 'hidden',
  },

  // 9칸 완성 쿠폰 배너
  couponBanner: {
    backgroundColor: Colors.navy,
    borderRadius: 16, // radius-card
    paddingVertical: 24, // xl
    paddingHorizontal: 20, // lg
    alignItems: 'center',
    marginTop: 8,
  },
  couponText: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: Colors.textOnColor,
    marginBottom: 16, // md
  },
  couponButton: {
    backgroundColor: Colors.gold, // 골드는 "특별한 순간"에만 소량 사용하는 포인트 색
    borderRadius: 20, // radius-pill
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  couponButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: Colors.navy,
  },

  // 하단 페이지 번호 바 (스크롤 밖, 탭 바 바로 위)
  pageNumberBar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  pageNumber: {
    fontFamily: Fonts.regular,
    fontSize: 12, // Caption 크기
  },
});
