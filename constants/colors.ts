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
