// 공연이 열리는 도시 — 한글 이름과 보딩패스에 찍을 영문
//
// 보딩패스는 가상의 비행기 티켓이라 도착지를 공항 코드처럼 대문자 영문으로 보여준다(SEOUL).
// DB에는 관리자가 고른 한글 그대로 저장하고(events.city), 영문은 여기서 옮긴다.
//
// 17개 시·도로 둔 이유: 대한민국 전체를 덮으면서 목록이 짧다. 시·군 단위까지 내려가면 수백 개가
// 되고 관리자가 고르기도 어려운데, 보딩패스에 필요한 건 "어느 도시로 가는가" 정도의 굵기다.
// 이 목록은 DB의 check 제약(events_city_valid)과 같아야 한다 —
// 한쪽에만 도시를 더하면 저장이 거절되거나(제약) 영문을 못 찾는다(여기).

export const CITIES = [
  { name: '서울', code: 'SEOUL' },
  { name: '부산', code: 'BUSAN' },
  { name: '대구', code: 'DAEGU' },
  { name: '인천', code: 'INCHEON' },
  { name: '광주', code: 'GWANGJU' },
  { name: '대전', code: 'DAEJEON' },
  { name: '울산', code: 'ULSAN' },
  { name: '세종', code: 'SEJONG' },
  { name: '경기', code: 'GYEONGGI' },
  { name: '강원', code: 'GANGWON' },
  { name: '충북', code: 'CHUNGBUK' },
  { name: '충남', code: 'CHUNGNAM' },
  { name: '전북', code: 'JEONBUK' },
  { name: '전남', code: 'JEONNAM' },
  { name: '경북', code: 'GYEONGBUK' },
  { name: '경남', code: 'GYEONGNAM' },
  { name: '제주', code: 'JEJU' },
] as const;

export type City = (typeof CITIES)[number]['name'];

export const DEFAULT_CITY: City = '서울';

// 보딩패스 도착지에 찍을 영문. 목록에 없는 값이 들어오면 그 글자를 그대로 대문자로 보여준다.
//
// 목록에 없는 값은 DB의 check 제약이 막으므로 정상 경로로는 생기지 않는다. 다만 제약을 손댔거나
// 데이터를 옮겨 온 경우에 대비해, 티켓이 빈칸으로 찍히는 것보다는 한글이라도 보이는 편이 낫다.
export function cityCode(city: string): string {
  return CITIES.find((c) => c.name === city)?.code ?? city.toUpperCase();
}
