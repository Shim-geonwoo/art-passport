// 예매 탭에 뿌리는 더미 공연/전시 카탈로그 (events)
//
// 아직 Supabase가 연동되지 않아서, docs/data-structure.md의 events 테이블 구조를 본떠
// docs/content-examples.md의 카테고리별 10개(총 50개)를 화면 개발용 더미로 만들어 둔다.
// 실제 연동 시에는 이 파일 대신 Supabase에서 events를 조회하게 바뀔 것이다.
//
// 핵심: 날짜는 고정 문자열이 아니라 offsetDays(오늘 기준 상대일)로 갖는다. (docs/data-flow.md 1장)
// 화면에는 formatEventSchedule()로 실제 날짜 문자열을 만들어 보여준다.
//
// events = "예매할 수 있는 목록"일 뿐이다. "내가 예매한 것"은 data/dummy-bookings.ts에 따로 있다.

import { Genre } from '@/constants/colors';
import { formatDate, formatDateTime, offsetToDate, startOfToday } from '@/data/schedule';

// docs/data-structure.md의 events 테이블 칸을 참고한 타입
// (poster_url은 실제 이미지가 없어서 지금은 카테고리 색 박스로 대체하고, 필드 자체는 만들지 않는다)
export type EventItem = {
  id: string;
  title: string; // 공연/전시 제목
  genre: Genre; // 장르 (카테고리 색 + 뱃지를 결정한다)
  venueName: string; // 공연장 이름
  price: number; // 가격(원)
  // 관람 시각을 오늘 기준 상대일로 표현 (docs/data-flow.md 1장)
  offsetDays: number; // 회차형: 공연일 / 기간형(전시): 시작일
  offsetEndDays?: number; // 기간형(전시)만: 종료일. 있으면 화면에 'start ~ end' 범위로 표시한다
  time?: string; // 'HH:mm' 공연 시작 시각(회차형). 예매(booking)의 관람 시각 계산에도 쓰인다
};

// 공연 카드/상세에 보여줄 일정 문자열을 만든다.
// - 전시(기간형): "2026.08.02 ~ 2026.09.30"
// - 공연(회차형): "2026.08.14 19:30" (시각 없으면 날짜만)
export function formatEventSchedule(event: EventItem, now: Date = new Date()): string {
  const start = offsetToDate(event.offsetDays, event.time, now);
  if (event.offsetEndDays != null) {
    const end = offsetToDate(event.offsetEndDays, undefined, now);
    return `${formatDate(start)} ~ ${formatDate(end)}`;
  }
  return event.time ? formatDateTime(start) : formatDate(start);
}

// 지금 이 이벤트를 예매할 수 있는가.
// - 전시(기간형): 종료일이 아직 안 지났으면(오늘 포함) 예매 가능.
// - 공연(회차형): 공연 시작 시각이 아직 안 지났으면 예매 가능.
// 이걸로 목록에서 지난/종료된 이벤트를 감춰, "지난 공연을 예매하면 즉시 관람완료가 되는"
// 이상한 상황을 막는다. (예매 화면·결제 화면 공용)
export function isBookable(event: EventItem, now: Date = new Date()): boolean {
  if (event.offsetEndDays != null) {
    // 전시: 종료일(자정 기준)이 오늘 이후면 가능
    const end = offsetToDate(event.offsetEndDays, undefined, now);
    return startOfToday(end).getTime() >= startOfToday(now).getTime();
  }
  // 공연: 시작 시각이 아직 미래면 가능
  return offsetToDate(event.offsetDays, event.time, now).getTime() > now.getTime();
}

export const DUMMY_EVENTS: EventItem[] = [
  // ── 전시 (#1B63C6) · 기간형 ──────────────────────────────
  { id: 'ex-01', title: 'Portes Ouvertes', genre: '전시', venueName: '리움미술관', price: 20000, offsetDays: -10, offsetEndDays: 77 },
  { id: 'ex-02', title: '행성지구 아카이브', genre: '전시', venueName: '국립현대미술관', price: 15000, offsetDays: 5, offsetEndDays: 92 },
  { id: 'ex-03', title: '요시고 사진전', genre: '전시', venueName: '그라운드시소 명동', price: 18000, offsetDays: -70, offsetEndDays: 10 },
  { id: 'ex-04', title: '반 고흐: 별이 빛나는 밤', genre: '전시', venueName: '그랜드워커힐', price: 22000, offsetDays: -5, offsetEndDays: 60 },
  { id: 'ex-05', title: '데이비드 호크니 展', genre: '전시', venueName: '서울시립미술관', price: 20000, offsetDays: -40, offsetEndDays: 5 },
  { id: 'ex-06', title: '김환기 회고전', genre: '전시', venueName: '환기미술관', price: 12000, offsetDays: 3, offsetEndDays: 80 },
  { id: 'ex-07', title: '팀랩: 보더리스', genre: '전시', venueName: '아르떼뮤지엄 서울', price: 25000, offsetDays: -30, offsetEndDays: 120 },
  { id: 'ex-08', title: '앤디 워홀 팝아트展', genre: '전시', venueName: '예술의전당 한가람', price: 19000, offsetDays: 10, offsetEndDays: 70 },
  { id: 'ex-09', title: '클림트 인사이드', genre: '전시', venueName: '그라운드시소 성수', price: 21000, offsetDays: 1, offsetEndDays: 90 },
  { id: 'ex-10', title: '한국 근현대미술 100선', genre: '전시', venueName: '국립현대미술관', price: 10000, offsetDays: 7, offsetEndDays: 100 },

  // ── 클래식·무용 (#6A5ACD) · 회차형 ───────────────────────
  { id: 'cd-01', title: '백조의 호수', genre: '클래식·무용', venueName: '예술의전당 오페라극장', price: 88000, offsetDays: 1, time: '19:30' },
  { id: 'cd-02', title: '호두까기 인형', genre: '클래식·무용', venueName: '예술의전당 오페라극장', price: 99000, offsetDays: 40, time: '19:00' },
  { id: 'cd-03', title: '서울시향 말러 교향곡 5번', genre: '클래식·무용', venueName: '롯데콘서트홀', price: 70000, offsetDays: 25, time: '20:00' },
  { id: 'cd-04', title: '조성진 피아노 리사이틀', genre: '클래식·무용', venueName: '예술의전당 콘서트홀', price: 120000, offsetDays: 35, time: '20:00' },
  { id: 'cd-05', title: '지젤', genre: '클래식·무용', venueName: '국립극장 해오름', price: 80000, offsetDays: 6, time: '19:30' },
  { id: 'cd-06', title: "베토벤 교향곡 9번 '합창'", genre: '클래식·무용', venueName: '롯데콘서트홀', price: 90000, offsetDays: 18, time: '20:00' },
  { id: 'cd-07', title: '국립발레단 돈키호테', genre: '클래식·무용', venueName: '예술의전당 오페라극장', price: 75000, offsetDays: 22, time: '19:30' },
  { id: 'cd-08', title: '빈 필하모닉 내한공연', genre: '클래식·무용', venueName: '예술의전당 콘서트홀', price: 250000, offsetDays: 33, time: '20:00' },
  { id: 'cd-09', title: '라 바야데르', genre: '클래식·무용', venueName: '세종문화회관 대극장', price: 85000, offsetDays: 15, time: '19:30' },
  { id: 'cd-10', title: '정경화 바이올린 리사이틀', genre: '클래식·무용', venueName: '예술의전당 콘서트홀', price: 110000, offsetDays: 28, time: '20:00' },

  // ── 콘서트 (#7FD4C1) · 회차형 ────────────────────────────
  { id: 'co-01', title: 'Summer Sound Fest', genre: '콘서트', venueName: '올림픽공원', price: 132000, offsetDays: 9, time: '18:00' },
  { id: 'co-02', title: 'Midnight Piano Session', genre: '콘서트', venueName: '블루스퀘어', price: 77000, offsetDays: 14, time: '20:00' },
  { id: 'co-03', title: "아이유 콘서트 'The Golden Hour'", genre: '콘서트', venueName: '고척스카이돔', price: 154000, offsetDays: 2, time: '18:00' },
  { id: 'co-04', title: '잔나비 단독공연', genre: '콘서트', venueName: '올림픽홀', price: 99000, offsetDays: 21, time: '18:00' },
  { id: 'co-05', title: '검정치마 라이브', genre: '콘서트', venueName: '예스24 라이브홀', price: 88000, offsetDays: 30, time: '18:00' },
  { id: 'co-06', title: '뉴진스 팬미팅', genre: '콘서트', venueName: 'KSPO돔', price: 121000, offsetDays: 26, time: '17:00' },
  { id: 'co-07', title: '최정훈 단독 콘서트', genre: '콘서트', venueName: '블루스퀘어', price: 99000, offsetDays: 17, time: '19:00' },
  { id: 'co-08', title: '십센치(10cm) 콘서트', genre: '콘서트', venueName: '올림픽홀', price: 88000, offsetDays: 24, time: '18:00' },
  { id: 'co-09', title: '자우림 25주년 콘서트', genre: '콘서트', venueName: '올림픽공원 체조경기장', price: 110000, offsetDays: 8, time: '18:00' },
  { id: 'co-10', title: '폴킴 콘서트', genre: '콘서트', venueName: '세종대 대양홀', price: 95000, offsetDays: 19, time: '18:00' },

  // ── 연극 (#D97757) · 회차형 ──────────────────────────────
  { id: 'th-01', title: '햄릿', genre: '연극', venueName: '대학로 예술극장', price: 55000, offsetDays: 3, time: '19:30' },
  { id: 'th-02', title: '벚꽃동산', genre: '연극', venueName: '명동예술극장', price: 60000, offsetDays: 16, time: '19:30' },
  { id: 'th-03', title: '고도를 기다리며', genre: '연극', venueName: '국립극장 달오름', price: 66000, offsetDays: 20, time: '19:30' },
  { id: 'th-04', title: '오이디푸스', genre: '연극', venueName: 'LG아트센터', price: 70000, offsetDays: 27, time: '19:30' },
  { id: 'th-05', title: '한여름 밤의 꿈', genre: '연극', venueName: '아르코예술극장', price: 50000, offsetDays: 11, time: '19:30' },
  { id: 'th-06', title: '리차드 3세', genre: '연극', venueName: '명동예술극장', price: 60000, offsetDays: 23, time: '19:30' },
  { id: 'th-07', title: '늘근도둑 이야기', genre: '연극', venueName: '대학로 TOM', price: 40000, offsetDays: 6, time: '20:00' },
  { id: 'th-08', title: '그을린 사랑', genre: '연극', venueName: '두산아트센터', price: 55000, offsetDays: 13, time: '19:30' },
  { id: 'th-09', title: '인간 실격', genre: '연극', venueName: '대학로 유니플렉스', price: 48000, offsetDays: 29, time: '19:30' },
  { id: 'th-10', title: '갈매기', genre: '연극', venueName: '명동예술극장', price: 58000, offsetDays: 31, time: '19:30' },

  // ── 뮤지컬 (#C9599E) · 회차형 ────────────────────────────
  { id: 'mu-01', title: '레베카', genre: '뮤지컬', venueName: '샤롯데씨어터', price: 140000, offsetDays: 12, time: '19:30' },
  { id: 'mu-02', title: '라이온킹', genre: '뮤지컬', venueName: '블루스퀘어 신한카드홀', price: 150000, offsetDays: 34, time: '19:30' },
  { id: 'mu-03', title: '오페라의 유령', genre: '뮤지컬', venueName: '샤롯데씨어터', price: 160000, offsetDays: 25, time: '19:30' },
  { id: 'mu-04', title: '지킬 앤 하이드', genre: '뮤지컬', venueName: '블루스퀘어 신한카드홀', price: 150000, offsetDays: 38, time: '19:30' },
  { id: 'mu-05', title: '위키드', genre: '뮤지컬', venueName: '블루스퀘어 신한카드홀', price: 160000, offsetDays: 30, time: '19:30' },
  { id: 'mu-06', title: '데스노트', genre: '뮤지컬', venueName: '예술의전당 CJ토월극장', price: 140000, offsetDays: 20, time: '19:30' },
  { id: 'mu-07', title: '아이다', genre: '뮤지컬', venueName: '샤롯데씨어터', price: 150000, offsetDays: 41, time: '19:30' },
  { id: 'mu-08', title: '물랑루즈!', genre: '뮤지컬', venueName: '블루스퀘어 신한카드홀', price: 170000, offsetDays: 45, time: '19:30' },
  { id: 'mu-09', title: '프랑켄슈타인', genre: '뮤지컬', venueName: '블루스퀘어 신한카드홀', price: 150000, offsetDays: 37, time: '19:30' },
  { id: 'mu-10', title: '하데스타운', genre: '뮤지컬', venueName: 'LG아트센터', price: 150000, offsetDays: 43, time: '19:30' },
];
