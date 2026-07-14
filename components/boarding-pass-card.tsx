// 보딩패스 카드 - 정적(static) 버전
//
// 피그마 Dev Mode에서 뽑은 "보딩패스 프레임" 코드(색·크기·좌표·폰트 값)를
// React Native View/Text + position:'absolute'로 그대로 옮긴 컴포넌트다.
//
// CLAUDE.md 작업 규칙: "정지된 화면을 먼저 완성하고, 애니메이션은 다음 단계에서 추가한다"
// -> 지금은 카드 한 장만, 애니메이션/겹침 없이 고정된 값으로만 만든다.
// (여러 장을 겹쳐 보여주는 동적 버전은 app/(tabs)/index.tsx의 BoardingPassCard를 참고)
//
// 폰트 안내:
// 피그마 코드엔 fontFamily: 'Noto Sans KR', fontWeight: '700'/'350'로 적혀 있지만,
// 이 프로젝트는 폰트를 굵기별로 이미 다른 파일명으로 미리 불러와 놨다 (constants/fonts.ts).
// 그래서 fontFamily 문자열을 그대로 쓰지 않고, 굵기에 맞는 Fonts 토큰으로 바꿔 썼다.
// 700 -> Fonts.bold / 350(가장 가까운 값) -> Fonts.demiLight

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryColors, CategoryIcons, CategoryLabels } from '@/constants/colors';
import { Fonts } from '@/constants/fonts';

// 카드 안의 검정/흰 글씨 색 (피그마 값 그대로: #2C2C2E, white, black)
const LABEL_COLOR = '#2C2C2E'; // Bold 10 라벨 (PASSENGER, DATE 등)
const VALUE_COLOR = '#FFFFFF'; // DemiLight 값 글씨
const ICON_COLOR = '#000000'; // 카테고리 아이콘 / 비행기 아이콘

export default function BoardingPassCard() {
  return (
    // 카드 전체: 270 x 380, radius 10, 배경 = 전시 카테고리 색(#1B63C6)
    <View style={styles.card}>
      {/* 상단 (270 x 42) */}
      <View style={styles.topSection}>
        <Text style={styles.categoryName}>{CategoryLabels.전시}</Text>

        {/* 카테고리 아이콘 자리: 피그마 원본은 37x37 칸 안에 21x24 크기로 들어있어서,
            같은 37x37 칸 가운데에 아이콘을 놓아 맞춘다 */}
        <View style={styles.topIconSlot}>
          <MaterialCommunityIcons name={CategoryIcons.전시} size={24} color={ICON_COLOR} />
        </View>
      </View>

      {/* 중간 (270 x 170) */}
      <View style={styles.middleSection}>
        {/* 왼쪽: 자택(출발) */}
        <Text style={[styles.smallLabel, { left: 13, top: 19 }]}>자택</Text>
        <Text style={[styles.bigValue, { left: 13, top: 33 }]}>HOME</Text>

        {/* 오른쪽: 관람 장소(도착) */}
        <Text style={[styles.smallLabel, { left: 210, top: 19 }]}>리움 미술관</Text>
        <Text style={[styles.bigValue, { left: 182, top: 31 }]}>SEOUL</Text>

        {/* 비행기 아이콘: 37x37 칸 (left 116, top 29) 가운데에 놓는다 */}
        <View style={[styles.middleIconSlot, { left: 116, top: 29 }]}>
          <Ionicons name="airplane" size={28} color={ICON_COLOR} />
        </View>

        {/* PASSENGER / DATE / TIME */}
        <Text style={[styles.smallLabel, { left: 13, top: 70 }]}>PASSENGER</Text>
        <Text style={[styles.smallLabel, { left: 152, top: 70 }]}>DATE</Text>
        <Text style={[styles.smallLabel, { left: 227, top: 70 }]}>TIME</Text>

        <Text style={[styles.smallValue, styles.smallValueTracking, { left: 13, top: 82 }]}>
          SHIM GEONWOO
        </Text>
        {/* DATE 값만 피그마 원본에 letterSpacing이 없어서 tracking 스타일을 빼고 그대로 둔다 */}
        <Text style={[styles.smallValue, { left: 152, top: 82 }]}>2026.07.13</Text>
        <Text style={[styles.smallValue, styles.smallValueTracking, { left: 227, top: 82 }]}>
          15:00
        </Text>

        {/* SEAT / CAP */}
        <Text style={[styles.smallLabel, { left: 13, top: 116 }]}>SEAT</Text>
        <Text style={[styles.smallLabel, { left: 227, top: 116 }]}>CAP</Text>

        <Text style={[styles.smallValue, styles.smallValueTracking, { left: 13, top: 128 }]}>
          자유석
        </Text>
        <Text style={[styles.smallValue, styles.smallValueTracking, { left: 227, top: 128 }]}>
          2
        </Text>
      </View>

      {/* 하단 (270 x 168): CONTENT 라벨 + 포스터 자리(회색 네모) */}
      <View style={styles.bottomSection}>
        <View style={styles.contentBox}>
          <Text style={styles.contentLabel}>CONTENT</Text>
          <Text style={styles.contentValue}>행성지구아카이브</Text>
          {/* 포스터가 들어갈 자리. 지금은 실제 이미지가 없어서 회색 네모로만 표시한다 */}
          <View style={styles.posterPlaceholder} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 카드 전체 (270 x 380, radius 10)
  card: {
    width: 270,
    height: 380,
    backgroundColor: CategoryColors.전시,
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
    color: VALUE_COLOR,
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

  // 중간 (270 x 170)
  middleSection: {
    position: 'absolute',
    left: 0,
    top: 42,
    width: 270,
    height: 170,
  },
  middleIconSlot: {
    position: 'absolute',
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallLabel: {
    position: 'absolute',
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: LABEL_COLOR,
  },
  bigValue: {
    position: 'absolute',
    fontFamily: Fonts.demiLight,
    fontSize: 24,
    color: VALUE_COLOR,
  },
  smallValue: {
    position: 'absolute',
    fontFamily: Fonts.demiLight,
    fontSize: 12,
    color: VALUE_COLOR,
  },
  smallValueTracking: {
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
  contentLabel: {
    position: 'absolute',
    left: 2,
    top: 0,
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: LABEL_COLOR,
  },
  contentValue: {
    position: 'absolute',
    left: 2,
    top: 12,
    fontFamily: Fonts.demiLight,
    fontSize: 12,
    color: VALUE_COLOR,
    letterSpacing: 0.24,
  },
  posterPlaceholder: {
    position: 'absolute',
    left: 0,
    top: 36,
    width: 100,
    height: 100,
    backgroundColor: '#CCCCCC',
    borderRadius: 10,
  },
});
