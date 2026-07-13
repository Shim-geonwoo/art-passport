# Art Passport — 디자인 시스템

> 문화예술 예매·아카이빙 앱의 디자인 규칙서.
> 레퍼런스: 애플 월렛 · 실제 여권/보딩패스
> VS Code의 Claude에게 화면을 만들라고 할 때 이 문서를 함께 첨부하면,
> 모든 화면이 아래 규칙에 따라 일관되게 만들어집니다.

---

## 0. 디자인 컨셉 (모든 결정의 근거)

| 컨셉 | 담당 | 한 문장 |
|---|---|---|
| 1. Glanceable | 어떻게 보이나 | 한눈에 읽히는 정보 위계 |
| 2. Stack & Collect | 무엇을 주나 | 쌓고 수집하는 만족감 |
| 3. Living Pass | 왜 특별한가 | 시간에 따라 살아있는 티켓 |

- **Glanceable** -> 타이포 위계를 뚜렷하게, 여백을 넉넉하게.
- **Stack & Collect** -> 카드는 겹쳐도 카테고리 색으로 구분. 스탬프는 수집 단위.
- **Living Pass** -> 티켓은 예매->임박->관람후 상태로 변한다. 카테고리 색은 정식 토큰.

---

## 1. 색상 (Color)

### 1-1. 기본 팔레트 (Base)

| 토큰 | 역할 | HEX |
|---|---|---|
| `navy` (Primary) | 여권 표지, 헤더, 강조 | `#1B2A4A` |
| `blue` (Secondary) | 버튼, 링크, 강조 텍스트 | `#3D5A8A` |
| `cream` (Background) | 화면 전체 배경 | `#F5F1E8` |
| `surface` | 카드/목록의 흰 배경 | `#FFFFFF` |
| `gold` (Accent) | 로고, 스탬프 테두리, 뱃지 포인트 | `#C9A961` |
| `text-primary` | 본문 진한 글씨 | `#1B2A4A` |
| `text-secondary` | 보조/라벨 회색 글씨 | `#6B6B6B` |
| `text-on-color` | 컬러 배경 위 흰 글씨 | `#FFFFFF` |
| `text-on-color-muted` | 컬러 배경 위 연한 라벨 | `#AEC4F2` (파랑 기준, 카테고리별 조정) |

> 골드는 "특별한 순간"(스탬프, 뱃지, 로고)에만 소량. 남색+크림이 화면의 90%.

### 1-2. 카테고리 색 (Category) — 각 1개

> 보딩패스 배경/헤더에 쓰이는 색. events.genre 값과 1:1 매핑.

| 카테고리 | 토큰 | HEX | 아이콘(outline) |
|---|---|---|---|
| 전시 | `cat-exhibition` | `#2B5FD9` | palette |
| 클래식·무용 | `cat-classic` | `#6A5ACD` | music |
| 콘서트 | `cat-concert` | `#7FD4C1` | headphones |
| 연극 | `cat-theater` | `#D97757` | masks-theater |
| 뮤지컬 | `cat-musical` | `#C9599E` | microphone-2 |

> 전시·콘서트는 시안 확정값. 클래식·연극·뮤지컬은 제안값 —
> 피그마에서 조정하면 이 칸만 바꾸세요.

---

## 2. 타이포그래피 (Typography)

> 폰트: 본문/UI = Pretendard (한글), 라벨/영문 대문자 = 시스템 산세리프
> 타이틀 감성이 필요하면 세리프 1종 추가 가능(추후 결정).

| 역할 | 예시 | 크기 | 굵기 | 색 |
|---|---|---|---|---|
| Display | HOME / SEOUL | 32px | 500 | on-color |
| Header | EXHIBITION | 20px | 500 | on-color |
| Label | PASSENGER, DATE | 11px | 500 | on-color-muted |
| Value | SHIM GEONWOO | 15px | 400 | on-color |
| Title | 화면 제목 | 22px | 500 | text-primary |
| Body | 일반 텍스트 | 15px | 400 | text-primary |
| Caption | 보조 정보 | 12px | 400 | text-secondary |

---

## 3. 간격 (Spacing)

> 4의 배수만 사용.

| 토큰 | 값 | 용도 |
|---|---|---|
| `xs` | 4px | 아이콘-텍스트 사이 |
| `sm` | 8px | 라벨-값 사이 |
| `md` | 16px | 요소 간 기본 간격 |
| `lg` | 20px | 카드 내부 여백 |
| `xl` | 24px | 섹션 사이 |
| `2xl` | 32px | 화면 상하 여백 |

---

## 4. 모서리·테두리 (Radius / Border)

| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-card` | 16px | 보딩패스 카드 |
| `radius-md` | 12px | 목록 카드, 이미지 자리 |
| `radius-button` | 8px | 버튼 |
| `radius-pill` | 20px | 뱃지, 태그 |
| `border-hairline` | 0.5px `#E3DBC8` | 크림 배경 위 카드 구분선 |
| `border-on-color` | 0.5px `rgba(255,255,255,0.25)` | 컬러 카드 내부 구분선 |

---

## 5. 컴포넌트 (Component)

| 컴포넌트 | 설명 | 상태 |
|---|---|---|
| `BoardingPassCard` | 보딩패스 카드 한 장 (카테고리 색 적용) | 디자인 완료 |
| `BoardingPassStack` | 여러 장 겹쳐 쌓인 월렛 | 디자인 완료 |
| `LabelValue` | 라벨(연한색) + 값(흰색) 세트 | 규칙 확정 |
| `GenreBadge` | 카테고리 아이콘 + 이름 | 규칙 확정 |
| `TicketState` | 예매완료 / 임박 / 관람후 상태 표시 | 컨셉 확정 |
| `Stamp` | 여권 스탬프 1칸 = 공연 포스터 + 관람일 + 장소 | 디자인 완료 |
| `PassportPage` | 스탬프 9칸(3x3) 한 페이지. 안 채운 칸은 점선 | 디자인 완료 |
| `CouponBanner` | 9칸 완성 시 "WE GOT A COUPON!" + 리워드함 버튼 | 디자인 완료 |
| `SearchBar` | 내 티켓 검색바 | 디자인 예정 |
| `EventListCard` | 공연 목록 카드 | 미정 |
| `PrimaryButton` | 기본 버튼 (navy 배경 / 흰 글씨) | 규칙 확정 |

### 스탬프 페이지 규칙 (Stamp Page)
- 한 페이지 = 9칸 (3x3 그리드).
- 스탬프 칸 = 공연/전시 포스터 이미지 + 하단에 관람일 + 장소.
- 안 채운 칸은 점선 테두리로 빈 자리 표시.
- 9칸을 다 채우면 쿠폰 1장 발급 (다음 예매 10% 할인) + 쿠폰 배너 노출.
- 페이지는 계속 다음 장으로 이어짐 (하단에 페이지 번호).

### 상태별 티켓 시각 규칙 (Living Pass)

| 상태 | 배경 | 아이콘 | 느낌 |
|---|---|---|---|
| 예매완료 | 연회색 `#EBEEF5` | ticket | 조용함 |
| 관람 임박 | 카테고리 색 | plane-departure | 부상, 월렛 맨 앞 |
| 관람 후 | 크림 `#F5F1E8` + 골드 | stamp | 스탬프 아카이빙 |

---

## 6. 아이콘 (Icon)

- 스타일: 실선(outline)으로 통일. 채워진(filled) 아이콘과 섞지 않기.
- 카테고리 아이콘은 1-2 표 참고.

---

## 7. 레이아웃 기준

- 디자인 기준 프레임: 390 x 844 (iPhone 14/13)
- 보딩패스 카드: 화면 좌우 여백 16px, 카드 내부 여백 20px
- React Native에서 비율 기반으로 다른 기기에 자동 대응
