// 여권(Passport) 화면 - 스탬프 페이지
//
// Figma "스탬프 페이지" 시안(다크 배경 #2C2C2E, 3x3 카드 그리드 + 쿠폰/리워드 영역)을 따라 만든다.
// 규칙 요약 (docs/data-structure.md, docs/data-flow.md):
// - 여권 한 페이지 = 스탬프 9칸(3x3). 항상 9칸을 그리고, 채운 칸만 스탬프·나머지는 점선 빈 칸.
// - 관람완료한 예매 하나 = 스탬프 하나 (data/bookings.ts의 deriveStamps에서 파생).
// - 9칸을 다 채우면 쿠폰 1장이 발급되고, "WE GOT A COUPON!" + "리워드함으로 가기" 버튼이 활성화된다.
// - 그 배너는 해당 쿠폰을 실제로 쓰면 내려간다 (쿠폰 상태에서 파생 — 화면이 따로 기억하지 않는다).
// - 페이지는 아래 이전/다음 화살표로 넘긴다 (스탬프는 계속 다음 장으로 이어짐).

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { RefreshErrorBanner } from '@/components/refresh-error-banner';
import { CategoryColors, CategoryIcons, Colors, Theme } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';
import { useBookings } from '@/contexts/bookings';
import { deriveStamps, Stamp, STAMPS_PER_PAGE } from '@/data/bookings';
import { isCouponUsable } from '@/data/coupons';
import { formatDate } from '@/data/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useRefreshing } from '@/hooks/use-refreshing';

// 여권 한 페이지에 들어가는 스탬프 칸 개수 (3x3 고정, 항상 이만큼 그린다)
const TOTAL_STAMP_SLOTS = STAMPS_PER_PAGE; // 9
// 스탬프 칸 비율 (가로 / 세로). Figma 카드 120x150 = 0.8 (세로가 조금 더 긴 카드)
const STAMP_ASPECT_RATIO = 0.8;
// 칸과 칸 사이 가로 간격
const GRID_GAP = 8;
// 스탬프 칸 모서리 둥글기. Figma 카드엔 radius가 없어서 각지게(0) 둔다
const STAMP_RADIUS = 0;

// Figma 다크 배경색 (이 화면 전용). 라이트 모드에서는 공통 흰 배경을 쓴다
const PASSPORT_BG_DARK = '#2C2C2E';
// 카드 하단 띠의 어두운 글씨/아이콘 색 (Figma: 공연장명 #2C2C2E, 장르 아이콘 검정). 날짜만 흰색.
const STAMP_FOOTER_DARK = '#2C2C2E';
// "리워드함으로 가기" 버튼 색 (Figma #8CB0E2, 밝은 파랑). 두 모드 공통.
const REWARD_BUTTON_BG = '#8CB0E2';

export default function PassportScreen() {
  // 폰의 라이트/다크 설정을 읽어서, 그에 맞는 색 묶음을 고른다
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? Theme.dark : Theme.light;
  // 이 화면 배경: 다크는 Figma 색(#2C2C2E), 라이트는 공통 흰색
  const screenBackground = colorScheme === 'dark' ? PASSPORT_BG_DARK : Colors.surface;

  // "지금" 시각. 주기적으로 갱신돼서, 켜 둔 채 관람 시각이 지나면 스탬프가 새로 뜬다.
  const now = useNow();

  // 지금 보고 있는 여권 페이지 (1부터). 이전/다음 버튼이나 "리워드함으로 가기"로 바뀐다.
  const [currentPage, setCurrentPage] = useState(1);

  // 중앙 데이터에서 관람완료 예매를 스탬프로 파생받고, 현재 페이지 것만 고른다.
  // (deriveStamps가 각 스탬프에 page/slotIndex를 이미 계산해 준다)
  const { bookings, coupons, error, refresh } = useBookings();

  // 당겨서 새로고침. 여권은 "관람 시각이 지나면 스탬프가 찍히는" 화면이라 useNow만으로도
  // 시간이 흐르지만, 다른 기기에서 한 예매나 새로 발급된 쿠폰은 서버를 다시 불러야 들어온다.
  // (쿠폰 발급 issue_due_coupons()도 refresh() 안에서 함께 일어난다)
  const { isRefreshing, onRefresh } = useRefreshing(refresh);

  const allStamps = deriveStamps(bookings, now);
  // 전체 여권 페이지 수 (스탬프 9개당 1페이지, 최소 1페이지)
  const totalPages = Math.max(1, Math.ceil(allStamps.length / STAMPS_PER_PAGE));
  const pageStamps = allStamps.filter((stamp) => stamp.page === currentPage);

  // 이번 페이지 9칸을 다 채웠는지
  const isPageComplete = pageStamps.length >= TOTAL_STAMP_SLOTS;

  // 이 페이지를 완성해서 발급된 쿠폰. 서버가 쿠폰을 만들 때 몇 번째 스탬프에서 나온 건지를
  // issued_at_stamp_order(9, 18, ...)에 적어두므로, 페이지 번호 x 9로 찾을 수 있다.
  const pageCoupon =
    coupons.find((coupon) => coupon.issuedAtStampOrder === currentPage * STAMPS_PER_PAGE) ?? null;

  // 쿠폰/리워드 영역을 보여줄지: 이 페이지가 꽉 찼고, 그 쿠폰을 아직 안 썼을 때.
  // 다 쓴(또는 만료된) 쿠폰이면 "리워드함으로 가기"를 권할 이유가 없으니 배너를 내린다.
  //
  // 예전엔 화면 안의 claimedPages(useState)로 "이미 챙긴 페이지"를 기억했는데, 그건 앱을 껐다
  // 켜면 사라져서 이미 받은 쿠폰인데도 배너가 다시 떴다. 이 프로젝트의 원칙대로 —
  // 저장하지 않고 파생한다 — 실제 쿠폰 상태에서 계산하니 앱을 다시 켜도, 기기를 바꿔도 맞는다.
  const showReward = isPageComplete && (!pageCoupon || isCouponUsable(pageCoupon, now));

  // 그리드의 실제 가로 폭을 측정해서 칸 하나의 정확한 px 크기를 계산한다
  // (점선 테두리를 SVG로 정확히 그리려면 %가 아니라 실제 px 값이 필요하다)
  const [gridWidth, setGridWidth] = useState(0);
  const cellWidth = gridWidth > 0 ? (gridWidth - GRID_GAP * 2) / 3 : 0;
  const cellHeight = cellWidth / STAMP_ASPECT_RATIO;

  function handleGridLayout(event: LayoutChangeEvent) {
    setGridWidth(event.nativeEvent.layout.width);
  }

  // "리워드함으로 가기": 마이페이지의 리워드함으로 바로 간다.
  // 예전엔 여기서 여권을 다음 페이지로 넘기기도 했는데, 그건 배너를 감추려는 장치였다.
  // 이제 배너는 쿠폰을 실제로 쓰면 알아서 내려가므로, 보고 있던 페이지를 말없이 바꾸지 않는다.
  //
  // push가 아니라 navigate를 쓴다: 탭을 건너뛰는 이동에 push를 쓰면 히스토리에 항목이 쌓여서
  // 나중에 뒤로가기를 눌렀을 때 엉뚱한 탭으로 돌아간다(navigate는 이미 있는 화면으로 옮겨간다).
  function handleClaimReward() {
    router.navigate('/mypage/rewards');
  }

  // 여권 페이지 넘기기 (이전/다음). 1페이지 ~ totalPages 사이로만 이동한다.
  function goToPrevPage() {
    setCurrentPage((page) => Math.max(1, page - 1));
  }
  function goToNextPage() {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }

  // 9칸을 항상 채운다: 스탬프가 있는 칸은 Stamp, 없는 칸은 null(빈 칸)
  const slots: (Stamp | null)[] = Array.from(
    { length: TOTAL_STAMP_SLOTS },
    (_, index) => pageStamps.find((stamp) => stamp.slotIndex === index) ?? null
  );
  // 3칸씩 잘라서 3줄로 만든다 (3x3 그리드)
  const rows = [slots.slice(0, 3), slots.slice(3, 6), slots.slice(6, 9)];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: screenBackground }]} edges={['top']}>
      {/* 갱신에 실패했으면 한 줄로 알린다. 이미 찍힌 스탬프는 그대로 두고 위에 얹기만 한다.
          조용히 넘어가면 "9칸을 채웠는데 쿠폰이 안 나왔다"처럼 보인다 —
          쿠폰 발급(issue_due_coupons)이 바로 이 갱신 안에서 일어나기 때문이다.
          다른 화면들과 같이 스크롤 밖에 고정해서, 좌우 여백(16)도 똑같이 맞춘다. */}
      {error ? <RefreshErrorBanner message={error} onRetry={refresh} theme={theme} /> : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.text} // iOS 스피너
            colors={[theme.text]} // Android 스피너
            progressBackgroundColor={screenBackground} // Android 스피너 뒤 원판
          />
        }>
        {/* 상단: ART PORT 로고 + 검색 아이콘 */}
        <View style={styles.header}>
          <Text style={[styles.logo, { color: theme.text }]}>ART PORT</Text>
          {/* 크기를 24로 맞췄다 (보딩패스 헤더의 검색 아이콘과 같은 값). 예전엔 22였다 */}
          <Ionicons name="search-outline" size={24} color={theme.text} />
        </View>

        {/* 스탬프 3x3 그리드 (항상 9칸: 스탬프 + 점선 빈 칸) */}
        <View onLayout={handleGridLayout}>
          {rows.map((row, rowIndex) => (
            // 줄 "사이"에만 47px 간격을 준다 (마지막 줄 뒤에는 안 붙여서, 리워드 영역과의 간격은 따로 제어)
            <View
              key={rowIndex}
              style={[styles.gridRow, rowIndex < rows.length - 1 && styles.gridRowGap]}>
              {row.map((stamp, colIndex) =>
                stamp ? (
                  <StampCard key={stamp.id} stamp={stamp} width={cellWidth} height={cellHeight} />
                ) : (
                  <EmptyStampSlot
                    key={`empty-${rowIndex}-${colIndex}`}
                    width={cellWidth}
                    height={cellHeight}
                    borderColor={theme.dashedBorder}
                  />
                )
              )}
            </View>
          ))}
        </View>

        {/* 쿠폰 문구 + "리워드함으로 가기" 버튼.
            페이지가 꽉 안 찼거나 그 쿠폰을 이미 쓴 경우엔 "숨기되 자리는 그대로 유지"한다(opacity 0 + 클릭 불가).
            그래야 아래 페이지 번호가 리워드 유무와 상관없이 항상 같은 위치에 고정된다. */}
        <View
          style={[styles.rewardArea, !showReward && styles.rewardAreaHidden]}
          pointerEvents={showReward ? 'auto' : 'none'}>
          <Text style={[styles.couponText, { color: theme.text }]}>WE GOT A COUPON!</Text>
          <Pressable style={styles.rewardButton} onPress={handleClaimReward}>
            <Text style={styles.rewardButtonText}>리워드함으로 가기</Text>
          </Pressable>
        </View>

        {/* 페이지 넘기기: ‹ 01 › — 이전/다음 버튼으로 여권 장을 넘겨본다 (양 끝에서는 흐리게 비활성) */}
        <View style={styles.pageNav}>
          <Pressable onPress={goToPrevPage} disabled={currentPage <= 1} hitSlop={8}>
            <Ionicons
              name="chevron-back"
              size={20}
              color={theme.textSecondary}
              style={currentPage <= 1 ? styles.pageArrowDisabled : undefined}
            />
          </Pressable>
          <Text style={[styles.pageNumber, { color: theme.textSecondary }]}>
            {String(currentPage).padStart(2, '0')}
          </Text>
          <Pressable onPress={goToNextPage} disabled={currentPage >= totalPages} hitSlop={8}>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.textSecondary}
              style={currentPage >= totalPages ? styles.pageArrowDisabled : undefined}
            />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// 채워진 스탬프 칸 하나: 포스터 자리(위) + 정보 띠(아래: 장르 아이콘 + 날짜 + 공연장)
function StampCard({ stamp, width, height }: { stamp: Stamp; width: number; height: number }) {
  const { event, showAt } = stamp.booking;
  const categoryColor = CategoryColors[event.genre];
  const genreIconName = CategoryIcons[event.genre];

  return (
    <View style={[styles.stampCell, { width, height, backgroundColor: categoryColor }]}>
      {/* 포스터 프레임: 카드 너비만큼의 정사각형 창 (Figma 120x120, overflow hidden).
          posterUrl이 있으면 그 포스터를, 없으면 색 배경 + 아이콘으로 대체한다 (포스터=스탬프) */}
      <View style={[styles.posterFrame, { height: width }]}>
        {event.posterUrl ? (
          <Image source={{ uri: event.posterUrl }} style={styles.posterImage} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={28} color={Colors.textOnColor} style={styles.posterIcon} />
        )}
      </View>

      {/* 하단 정보 띠 (Figma 120x30): 공연장명=우상단(어두움), 장르 아이콘+날짜=좌하단(날짜 흰색) */}
      <View style={styles.stampFooter}>
        <Text style={styles.stampVenue} numberOfLines={1}>
          {event.venueName}
        </Text>
        <View style={styles.stampDateRow}>
          <MaterialCommunityIcons name={genreIconName} size={16} color={STAMP_FOOTER_DARK} />
          <Text style={styles.stampDate}>{formatDate(showAt)}</Text>
        </View>
      </View>
    </View>
  );
}

// 안 채워진 스탬프 칸 하나: 점선 테두리만 있고 내부는 채우지 않는(투명) 빈 자리.
// 배경색을 주지 않으므로 점선 안으로 화면 배경이 그대로 비친다 (fill 없음).
function EmptyStampSlot({
  width,
  height,
  borderColor,
}: {
  width: number;
  height: number;
  borderColor: string;
}) {
  // 그리드 폭을 아직 측정하기 전(최초 렌더링 찰나)에는 크기가 0이라 그리지 않는다
  if (width === 0 || height === 0) {
    return <View style={{ width, height }} />;
  }

  const strokeWidth = 1.5;

  return (
    <View style={[styles.emptyStampCell, { width, height }]}>
      {/* View의 borderStyle:'dashed'는 일부 기기에서 점선이 깨져 보여서, SVG로 점선 테두리를 직접 그린다 */}
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
  scrollContent: {
    paddingHorizontal: 16, // 화면 좌우 여백
    paddingBottom: 24, // xl
  },

  // 상단 로고 + 검색 아이콘
  // 보딩패스 화면의 헤더(app/(tabs)/index.tsx의 styles.header)와 같은 값으로 맞춘다.
  // 두 화면 모두 상단에 "로고 + 돋보기"가 같은 모양으로 놓이는데, 예전엔 이쪽만
  // 높이를 내용에 맡겨서(paddingVertical) 글씨와 아이콘이 미묘하게 다른 자리에 있었다.
  // 좌우 여백(16)은 scrollContent가 이미 주고 있어서 여기선 안 준다.
  header: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4, // 그리드와의 간격. 보딩패스는 다음 요소가 flex로 밀려서 이 값이 없다
  },
  logo: {
    fontFamily: Fonts.bold,
    fontSize: 20, // Figma: ART PORT 20
    // letterSpacing을 뺐다. 보딩패스 타이틀엔 자간이 없어서, 같은 크기·굵기인데도
    // 이쪽만 글자가 벌어져 보였다.
  },

  // 스탬프 그리드 한 줄 (3칸)
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // 줄과 줄 사이 세로 간격.
  // Figma 원본은 47이지만, 그대로 쓰면 폰 화면에서 세로 스크롤이 생겨서 줄였다.
  // (37 -> 22: 페이지 넘기기 버튼까지 스크롤 없이 한 화면에 들어오게 추가로 더 줄임)
  gridRowGap: {
    marginBottom: 22,
  },

  // 채워진 스탬프 칸
  stampCell: {
    borderRadius: STAMP_RADIUS,
    overflow: 'hidden', // 안의 포스터가 모서리 밖으로 안 나가게
  },
  // 포스터 프레임: 정사각형 창 (height는 카드 너비로 인라인 지정 -> Figma 120x120)
  posterFrame: {
    width: '100%',
    overflow: 'hidden', // 실제 포스터가 들어오면 창 밖으로 넘치는 부분을 잘라낸다
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterIcon: {
    opacity: 0.6, // "포스터가 들어올 자리"라는 느낌만 주는 워터마크 아이콘
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  // 하단 정보 띠: 카드 높이의 나머지(≈20%, Figma 30px). 요소는 절대좌표로 코너에 배치
  stampFooter: {
    flex: 1,
    position: 'relative',
  },
  // 공연장명: 우상단 (Figma left 68 / top 122)
  stampVenue: {
    position: 'absolute',
    right: 4,
    top: 3,
    maxWidth: '55%', // 이름이 길면 날짜 쪽으로 안 넘치게 폭 제한 + 줄임표
    fontFamily: Fonts.bold,
    fontSize: 10, // Figma: 공연장명 10, Bold
    color: STAMP_FOOTER_DARK, // 공연장명은 어두운색
    textAlign: 'right',
  },
  // 장르 아이콘 + 날짜: 좌하단 한 줄 (Figma 아이콘 left 3 / 날짜 left 3, bottom 쪽)
  stampDateRow: {
    position: 'absolute',
    left: 3,
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stampDate: {
    fontFamily: Fonts.demiLight,
    fontSize: 12, // Figma: 날짜 12
    color: Colors.textOnColor, // 날짜는 흰색
  },

  // 안 채워진 스탬프 칸 (점선 테두리는 SVG로 그린다)
  emptyStampCell: {
    borderRadius: STAMP_RADIUS,
    overflow: 'hidden',
  },

  // 9칸 완성 시 쿠폰 + 리워드 영역 (Figma: 네이비 카드 없이 텍스트 + 밝은 파랑 버튼)
  rewardArea: {
    alignItems: 'center',
    marginTop: 16, // 37 -> 16: 페이지 넘기기 버튼까지 스크롤 없이 보이게 줄임
    gap: 10, // WE 문구 ↔ 리워드 버튼 사이 (20 -> 10)
  },
  // 리워드 영역을 안 보이게 하되 자리(높이)는 그대로 유지해, 페이지 번호 위치를 고정한다
  rewardAreaHidden: {
    opacity: 0,
  },
  couponText: {
    fontFamily: Fonts.bold,
    fontSize: 22, // Figma 원본은 30이지만, 숨겨져도 자리를 차지하므로 줄여서 여유 공간을 확보했다
    textAlign: 'center',
  },
  rewardButton: {
    backgroundColor: REWARD_BUTTON_BG,
    borderRadius: 10, // Figma 버튼 radius 10
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  rewardButtonText: {
    fontFamily: Fonts.medium,
    fontSize: 12, // Figma: 리워드함으로 가기 12
    color: Colors.textPrimary, // 밝은 파랑 위 어두운 글씨 (Figma: black)
  },

  // 페이지 넘기기 (‹ 01 ›)
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16, // md
    marginTop: 14, // 32 -> 14: 페이지 넘기기 버튼까지 스크롤 없이 한 화면에 들어오게 줄임
  },
  pageNumber: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    textAlign: 'center',
    minWidth: 24, // 01/02 자리 폭을 고정해 화살표가 덜 흔들리게
  },
  pageArrowDisabled: {
    opacity: 0.3, // 양 끝(1페이지/마지막 페이지)에서 비활성 표시
  },
});
