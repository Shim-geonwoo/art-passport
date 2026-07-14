// Noto Sans KR 폰트 이름 토큰
// 출처: docs/design-system.md - "2. 타이포그래피" (폰트: 전체 Noto Sans KR)
// 실제 폰트 파일 로딩은 app/_layout.tsx의 useFonts에서 한 번만 한다.
// 화면에서는 폰트 파일 이름을 직접 쓰지 말고 이 토큰을 가져다 쓴다.

export const Fonts = {
  regular: 'NotoSansKR_400Regular', // 굵기 400 - Value, Body, Caption
  medium: 'NotoSansKR_500Medium', // 굵기 500 - Display, Header, Label, Title
  bold: 'NotoSansKR_700Bold', // 굵기 700 - 로고, 쿠폰 배너처럼 크게 강조할 때
} as const;
