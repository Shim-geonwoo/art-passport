// 예매 탭에서 쓰는 더미 공연/전시 데이터
//
// 아직 Supabase가 연동되지 않아서, docs/data-structure.md의 events 테이블 구조를
// 그대로 본떠 화면 개발용 더미 데이터를 만들어 둔다.
// 실제 연동 시에는 이 파일 대신 Supabase에서 events를 조회하게 바뀔 것이다.

import { Genre } from '@/constants/colors';

// docs/data-structure.md의 events 테이블 칸을 참고한 타입
// (poster_url은 실제 이미지가 없어서 지금은 카테고리 색 박스로 대체하고, 필드 자체는 만들지 않는다)
export type EventItem = {
  id: string;
  title: string; // 공연/전시 제목
  genre: Genre; // 장르 (카테고리 색 + 뱃지를 결정한다)
  showAt: string; // 공연 날짜·시간 (화면 표시용으로 이미 포맷된 문자열)
  venueName: string; // 공연장 이름
  price: number; // 가격(원)
};

export const DUMMY_EVENTS: EventItem[] = [
  {
    id: '1',
    title: 'Portes Ouvertes',
    genre: '전시',
    showAt: '2026.08.02 ~ 2026.09.30',
    venueName: '리움미술관',
    price: 20000,
  },
  {
    id: '2',
    title: '행성지구아카이브',
    genre: '전시',
    showAt: '2026.07.20 ~ 2026.10.15',
    venueName: '국립현대미술관',
    price: 15000,
  },
  {
    id: '3',
    title: '백조의 호수',
    genre: '클래식·무용',
    showAt: '2026.08.14 19:30',
    venueName: '예술의전당',
    price: 88000,
  },
  {
    id: '4',
    title: '호두까기 인형',
    genre: '클래식·무용',
    showAt: '2026.12.20 19:00',
    venueName: '예술의전당',
    price: 99000,
  },
  {
    id: '5',
    title: 'Summer Sound Fest',
    genre: '콘서트',
    showAt: '2026.08.08 18:00',
    venueName: '올림픽공원',
    price: 132000,
  },
  {
    id: '6',
    title: 'Midnight Piano Session',
    genre: '콘서트',
    showAt: '2026.09.05 20:00',
    venueName: '블루스퀘어',
    price: 77000,
  },
  {
    id: '7',
    title: '햄릿',
    genre: '연극',
    showAt: '2026.08.22 19:30',
    venueName: '대학로 예술극장',
    price: 55000,
  },
  {
    id: '8',
    title: '벚꽃동산',
    genre: '연극',
    showAt: '2026.09.12 19:00',
    venueName: '명동예술극장',
    price: 60000,
  },
  {
    id: '9',
    title: '레베카',
    genre: '뮤지컬',
    showAt: '2026.08.30 19:30',
    venueName: '샤롯데씨어터',
    price: 140000,
  },
  {
    id: '10',
    title: '라이온킹',
    genre: '뮤지컬',
    showAt: '2026.10.10 14:00',
    venueName: '블루스퀘어',
    price: 150000,
  },
];
