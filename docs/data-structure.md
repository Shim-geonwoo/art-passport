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
- **`bookings.status`(예매완료/관람완료/취소)는 저장하지 않는다.** 저장하는 건 `is_cancelled` 하나뿐이고,
  나머지는 `now()`와 `watched_at`을 비교해서 조회할 때마다 계산한다. (아래 "상태 계산 규칙" 참고)
- **`stamps`는 별도 테이블로 두지 않는다.** 관람완료(파생) 상태인 `bookings`를 `watched_at` 오름차순으로
  정렬한 것 자체가 스탬프 목록이다. (별도 테이블을 두면 `watched_at`과 `stamped_at`이 사실상 같은 값을
  두 번 저장하게 되고, 취소 시점에 따라 서로 어긋날 위험이 생긴다.)

---

## 테이블 관계

- `auth.users` 1 : 1 `users`   (Supabase Auth가 인증을 관리, `users.id`가 `auth.users.id`를 참조)
- `users` 1 : N `bookings`     (한 회원이 여러 예매)
- `events` 1 : N `bookings`    (한 공연이 여러 예매를 받음)
- `users` 1 : N `coupons`      (한 회원이 여러 쿠폰)
- `coupons` 1 : 0~1 `bookings` (쿠폰 하나는 최대 한 번만 쓰임 — `bookings.used_coupon_id`로 연결)
- `venues` 1 : N `events`      (한 공연장에서 여러 공연) — 선택, 나중에 분리 가능

---

## 테이블 상세

### users (회원)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK, FK → auth.users.id) | 회원 고유번호 (Supabase Auth가 관리) |
| nickname | text | 닉네임 |
| profile_image | text | 프로필 사진 URL |
| created_at | timestamp | 가입일 |

### events (공연·전시)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 공연 고유번호 |
| title | text | 제목 |
| genre | text | 전시 / 클래식·무용 / 콘서트 / 연극 / 뮤지컬 |
| show_at | timestamp | 회차형(공연): 공연 시작 일시. 기간형(전시): 전시 시작일 |
| show_end_at | timestamp, null 허용 | **기간형(전시)만 사용.** 전시 종료일. 회차형(공연)은 null |
| price | int | 가격(원) |
| poster_url | text, null 허용 | 포스터 이미지 URL (스탬프에도 이 이미지 사용). 없으면 화면에서 카테고리색 박스로 대체 |
| description | text, null 허용 | 상세 소개글. 없으면 화면에서 "상세 내용이 준비 중이에요." 같은 빈 상태 문구로 대체 |
| venue_name | text | 공연장 이름 (지금은 글자로, 나중에 venue_id로 분리 가능) |
| created_at | timestamp | 등록일 |

> `show_end_at`이 있으면(NOT NULL) 기간형(전시), 없으면(NULL) 회차형(공연)으로 구분한다.
> 예매 가능 여부: 기간형은 `show_end_at ≥ 오늘`, 회차형은 `show_at > now()`.

### bookings (예매) — 앱의 심장
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 예매 고유번호 |
| user_id | uuid (FK → users.id) | 예매한 회원 |
| event_id | uuid (FK → events.id) | 예매한 공연 |
| watched_at | timestamp | **이 예매의 실제 관람 시각.** 예매하는 시점에 확정한다(회차형은 event.show_at, 기간형은 예매 시 고른 날짜). 이후 바뀌지 않는다 |
| is_cancelled | boolean, 기본 false | 취소 여부. **저장하는 상태는 이것 하나뿐** |
| quantity | int, 기본 1 | 인원(자유석 매수) |
| used_coupon_id | uuid, null 허용 (FK → coupons.id) | 이 예매에 쓴 쿠폰. 있으면 10% 할인 적용, 그 쿠폰은 '사용완료' |
| original_price | int | 할인 전 금액 (예매 시점 event.price × quantity, 스냅샷) |
| total_price | int | 실제 결제금액 (할인 반영, 스냅샷) |
| created_at | timestamp | 예매한 시각 |

> `original_price`/`total_price`를 예매 시점에 스냅샷으로 저장하는 이유: `events.price`가 나중에 바뀌어도
> 과거 예매 금액이 따라 바뀌면 안 되기 때문이다.
>
> **상태(status) 계산 규칙** — 저장하지 않고 조회할 때마다 계산한다:
> ```
> is_cancelled = true         → '취소'
> now() < watched_at          → '예매완료'
> now() >= watched_at         → '관람완료'   (= 이 예매가 스탬프가 된다)
> ```
> 취소 판정이 시간 판정보다 우선이라, 관람일이 지난 뒤에도 취소된 예매는 계속 '취소'로 남는다.
> Supabase에서는 이 계산을 뷰(view)나 생성 컬럼(generated column)으로 만들어도 되고,
> 프론트에서 조회 시마다 계산해도 된다 — 어느 쪽이든 **크론으로 status를 미리 써넣지는 않는다**
> (취소 우선순위가 깨질 위험이 있다).

### coupons (쿠폰)
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 쿠폰 고유번호 |
| user_id | uuid (FK → users.id) | 쿠폰 소유 회원 |
| benefit | text | 혜택 내용. 기본값: "다음 예매 10% 할인" |
| discount_rate | int | 할인율(%). 기본값: 10 |
| status | text | 사용가능 / 사용완료 / 만료 |
| issued_at | timestamp | 발급 시각 (스탬프 9개 채운 시점) |
| issued_at_stamp_order | int, null 허용 | 몇 번째 스탬프에서 발급됐는지(9, 18, 27...). 표시·디버깅용 |

> `status`는 `coupons`에선 저장하지만(사용가능/사용완료/만료), '사용완료'는 사실
> `bookings.used_coupon_id`가 이 쿠폰을 가리키는지로도 파생 가능하다. 둘을 같이 두는 이유는
> "만료"처럼 예매와 무관하게 바뀌는 상태도 있기 때문 — 완전히 없앨 필요는 없다.

### venues (공연장) — 선택, 나중에
| 칸 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 공연장 고유번호 |
| name | text | 이름 |
| address | text | 주소 |

---

## 핵심 기능이 데이터에서 작동하는 방식

**보딩패스 (관람일 임박 시 표시)**
- `bookings`에서 `is_cancelled=false` 이고 `watched_at`이 "관람 3일 전 ~ 관람 시각" 사이인 것만 보딩패스로 표시.
- 관람일이 3일보다 더 남은 티켓은 보딩패스 탭에 표시하지 않음.
- 여러 개면 월렛처럼 겹쳐 쌓고, 위아래 스크롤로 넘겨봄 (카테고리 색으로 구분).
- 표시할 티켓이 하나도 없으면 애플 월렛처럼 빈 화면 (안내 문구 없이 비움).

**자동 스탬프 (파생, 저장 안 함)**
- 별도 스탬프 생성 로직이 필요 없다. `is_cancelled=false` AND `watched_at ≤ now()`인 `bookings`를
  `watched_at` 오름차순 정렬한 것이 곧 스탬프 목록이다.
- 관람 시각이 지나는 순간, 같은 booking이 조회 시점에 자동으로 "보딩패스에서 빠지고" +
  "스탬프 목록에 들어오고" + "마이페이지 관람완료로 이동"한다. 별도 이벤트/크론이 필요 없다.

**쿠폰 발급**
- 한 회원의 스탬프(위에서 파생된 목록) 개수가 9의 배수가 될 때마다 `coupons`에 '사용가능' 쿠폰 1장을
  생성해야 한다. 이건 상태 계산과 달리 **실제로 행(row)을 만드는 일**이라 트리거가 필요하다:
  앱 진입 시 확인 로직 또는 Supabase 예약 함수(Edge Function + cron)로,
  "관람완료 스탬프 수가 9의 배수인데 아직 그 순번(`issued_at_stamp_order`)의 쿠폰이 없는 회원"을 찾아
  발급한다.

**티켓 검색**
- bookings를 event title / 날짜 / 장르로 검색해 내 티켓을 다시 꺼내봄.

**여권 페이지 계산**
- 위에서 파생한 스탬프 총 개수 N개일 때:
  - 총 페이지 수 = ceil(N / 9)
  - 현재 페이지의 채워진 칸 = N % 9 (0이면 딱 맞게 채움)

---

## 상태값 정리

| 대상 | 값 | 저장 여부 |
|---|---|---|
| bookings 상태 (예매완료/관람완료/취소) | `is_cancelled` + `watched_at` vs `now()`로 계산 | **저장 안 함** (is_cancelled만 저장) |
| coupons.status | 사용가능 / 사용완료 / 만료 | 저장함 |
| events.genre | 전시 / 클래식·무용 / 콘서트 / 연극 / 뮤지컬 | 저장함 |

---

## 나중에 추가할 수 있는 것 (지금은 안 함)

- events.stamp_design : 포스터 대신 커스텀 도장 디자인을 쓰고 싶을 때
- bookings.seat_info : 지정석(콘서트) 좌석 정보 — 지금은 전부 자유석 + quantity(인원)만 있음
- venues 분리 : 공연장을 별도 테이블로
