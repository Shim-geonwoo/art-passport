// Art Passport 디자인 시스템 색상 토큰
// 출처: docs/design-system.md - "1. 색상(Color)" 섹션
// 화면을 만들 때 색상 코드를 직접 쓰지 말고, 항상 이 토큰을 가져다 쓴다.

export const Colors = {
  navy: '#1B2A4A', // Primary - 여권 표지, 헤더, 강조
  blue: '#3D5A8A', // Secondary - 버튼, 링크, 강조 텍스트
  cream: '#F5F1E8', // Background - 화면 전체 배경
  surface: '#FFFFFF', // 카드/목록의 흰 배경
  gold: '#C9A961', // Accent - 스탬프, 뱃지 포인트 (특별한 순간에만 소량 사용)
  textPrimary: '#1B2A4A', // 본문 진한 글씨
  textSecondary: '#6B6B6B', // 보조/라벨 회색 글씨
  textOnColor: '#FFFFFF', // 컬러 배경 위 흰 글씨
  borderHairline: '#E3DBC8', // 크림 배경 위 카드 구분선
} as const;

// 카테고리(장르)별 색상 토큰
// 출처: docs/design-system.md - "1-2. 카테고리 색" 섹션
// 보딩패스, 스탬프 등 장르가 표시되는 곳이면 어디서나 이 색을 가져다 쓴다.
export const CategoryColors = {
  전시: '#1B63C6',
  '클래식·무용': '#6A5ACD',
  콘서트: '#7FD4C1',
  연극: '#D97757',
  뮤지컬: '#C9599E',
} as const;

export type Genre = keyof typeof CategoryColors;

// 카테고리(장르)별 아이콘 토큰 (MaterialCommunityIcons 이름)
// 출처: docs/design-system.md - "1-2. 카테고리 색" 표의 "아이콘(outline)" 칸
export const CategoryIcons = {
  전시: 'palette-outline',
  '클래식·무용': 'music',
  콘서트: 'headphones',
  연극: 'drama-masks',
  뮤지컬: 'microphone-outline',
} as const;

// 카테고리(장르)별 영문 표시 이름
// 출처: docs/boarding-pass-single.png 시안 (카드 상단에 EXHIBITION처럼 영문 대문자로 표시)
export const CategoryLabels = {
  전시: 'EXHIBITION',
  '클래식·무용': 'CLASSIC & DANCE',
  콘서트: 'CONCERT',
  연극: 'THEATER',
  뮤지컬: 'MUSICAL',
} as const;

// 라이트/다크 모드 화면 색 토큰
// 출처: docs/design-system.md - "1-3. 라이트/다크 모드" 섹션
// 카테고리 색(CategoryColors)은 두 모드에서 같은 값을 쓰므로 여기 포함하지 않는다.
export const Theme = {
  light: {
    background: Colors.cream, // 화면 배경
    emptyCellBackground: '#ECEAE3', // 카드/스탬프 빈칸 배경 (아주 연한 그레이)
    text: Colors.textPrimary, // 기본 텍스트
    textSecondary: Colors.textSecondary, // 보조 텍스트
    dashedBorder: Colors.borderHairline, // 점선 빈 칸 테두리
  },
  dark: {
    background: '#1A1A1C', // 화면 배경
    emptyCellBackground: '#242426', // 카드/스탬프 빈칸 배경 (시안 원본 다크 톤)
    text: Colors.cream, // 기본 텍스트 (밝은 색)
    textSecondary: 'rgba(245, 241, 232, 0.6)', // 기본 텍스트를 옅게 만든 보조 텍스트
    dashedBorder: 'rgba(255, 255, 255, 0.25)', // border-on-color 토큰 재사용
  },
} as const;
