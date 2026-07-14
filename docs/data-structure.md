# Art Passport — 데이터 구조 (최종)

> 문화예술 예매·아카이빙 앱의 데이터베이스 설계도.
> 저장소: Supabase (PostgreSQL)
> VS Code의 Claude에게 백엔드/DB를 만들라고 할 때 이 문서를 첨부하세요.

---

## 핵심 규칙 (확정)

- 여권 한 페이지 = 스탬프 **9칸** (3x3 그리드)
- 스탬프 칸에는 공연/전시 **포스터 이미지**가 들어감 (포스터 = 스탬프)
- 스탬프 9개를 채울 때마다 **쿠폰 1장** 발급
- 쿠폰 혜택: **다음 예매 10% 할인**
- 페이지는 계속 다음 장으로 이어짐 (여권처럼). 페이지 번호는 저장하지 않고
  스탬프 개수로 자동 계산 (예: 20개 -> 3페이지째, 2칸 채움)
- 관람 시간이 지나면 해당 예매가 자동으로 스탬프가 됨

---

## 테이블 관계

- users 1 : N bookings   (한 회원이 여러 예매)
- events 1 : N bookings  (한 공연이 여러 예매를 받음)
- bookings 1 : 1 stamps  (예매 하나가 관람완료되면 스탬프 하나)
- users 1 : N coupons    (한 회원이 여러 쿠폰)
- venues 1 : N events    (한 공연장에서 여러 공연) — 선택, 나중에 분리 가능

---

## 테이블 상세

### users (회원)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 회원 고유번호 (Supabase Auth가 관리) |
| nickname | text | 닉네임 |
| profile_image | text | 프로필 사진 URL |
| created_at | timestamp | 가입일 |

### events (공연·전시)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 공연 고유번호 |
| title | text | 제목 |
| genre | text | 전시 / 클래식·무용 / 콘서트 / 연극 / 뮤지컬 |
| show_at | timestamp | 공연 날짜·시간 (보딩패스 임박 판단 기준) |
| price | int | 가격(원) |
| poster_url | text | 포스터 이미지 URL (스탬프에도 이 이미지 사용) |
| venue_name | text | 공연장 이름 (지금은 글자로, 나중에 venue_id로 분리 가능) |
| created_at | timestamp | 등록일 |

### bookings (예매) — 앱의 심장
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 예매 고유번호 |
| user_id | uuid (FK) | 예매한 회원 |
| event_id | uuid (FK) | 예매한 공연 |
| status | text | 예매완료 / 관람완료 / 취소 |
| watched_at | timestamp | 실제 관람 시각 (스탬프 찍는 기준). show_at이 지나면 자동 세팅 |
| created_at | timestamp | 예매한 시각 |

### stamps (스탬프)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 스탬프 고유번호 |
| user_id | uuid (FK) | 스탬프 소유 회원 |
| booking_id | uuid (FK) | 어떤 예매에 대한 도장인지 |
| stamped_at | timestamp | 도장 찍힌 시각 |

> 스탬프의 순서는 stamped_at 기준. 9개마다 페이지가 나뉨.
> 화면에서 poster_url을 스탬프 이미지로 표시.

### coupons (쿠폰)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 쿠폰 고유번호 |
| user_id | uuid (FK) | 쿠폰 소유 회원 |
| benefit | text | 혜택 내용. 기본값: "다음 예매 10% 할인" |
| discount_rate | int | 할인율(%). 기본값: 10 |
| status | text | 사용가능 / 사용완료 / 만료 |
| issued_at | timestamp | 발급 시각 (스탬프 9개 채운 시점) |

### venues (공연장) — 선택, 나중에
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 공연장 고유번호 |
| name | text | 이름 |
| address | text | 주소 |

---

## 핵심 기능이 데이터에서 작동하는 방식

**보딩패스 (관람일 임박 시 표시)**
- bookings에서 status='예매완료' 이고 show_at이 "관람 3일 전 ~ 관람 시각" 사이인 것만 보딩패스로 표시.
- 관람일이 3일보다 더 남은 티켓은 보딩패스 탭에 표시하지 않음.
- 여러 개면 월렛처럼 겹쳐 쌓고, 위아래 스크롤로 넘겨봄 (카테고리 색으로 구분).
- 표시할 티켓이 하나도 없으면 애플 월렛처럼 빈 화면 (안내 문구 없이 비움).

**자동 스탬프**
- bookings의 show_at(또는 watched_at)이 현재 시각을 지나면:
  1) 해당 booking의 status를 '관람완료'로 변경
  2) stamps에 새 스탬프 1개 생성
- (구현: Supabase의 예약 작업 또는 앱 진입 시 확인 로직)

**쿠폰 발급**
- 한 회원의 stamps 개수가 9의 배수가 될 때마다:
  -> coupons에 '사용가능' 쿠폰 1장 생성 (benefit="다음 예매 10% 할인", discount_rate=10)

**티켓 검색**
- bookings를 event title / 날짜 / 장르로 검색해 내 티켓을 다시 꺼내봄.

**여권 페이지 계산**
- 총 스탬프 수 N개일 때:
  - 총 페이지 수 = ceil(N / 9)
  - 현재 페이지의 채워진 칸 = N % 9 (0이면 딱 맞게 채움)

---

## 상태값 정리

| 대상 | 값 |
|---|---|
| bookings.status | 예매완료 / 관람완료 / 취소 |
| coupons.status | 사용가능 / 사용완료 / 만료 |
| events.genre | 전시 / 클래식·무용 / 콘서트 / 연극 / 뮤지컬 |

---

## 나중에 추가할 수 있는 것 (지금은 안 함)

- events.stamp_design : 포스터 대신 커스텀 도장 디자인을 쓰고 싶을 때
- bookings.seat_info : 지정석(콘서트) 좌석 정보
- venues 분리 : 공연장을 별도 테이블로
