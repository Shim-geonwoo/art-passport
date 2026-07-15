# Art Passport — 디자인 시스템 (v2, 보딩패스 기준 재정리)

> 문화예술 예매·아카이빙 앱의 디자인 규칙서.
> 레퍼런스: 애플 월렛 · 실제 여권/보딩패스
> VS Code의 Claude에게 화면을 만들라고 할 때 이 문서를 함께 첨부하면,
> 모든 화면이 아래 규칙에 따라 일관되게 만들어집니다.

---

## 0. 이 문서의 기준

이 프로젝트에서 **보딩패스 카드**(`components/boarding-pass-card.tsx`,
`app/(tabs)/index.tsx`)가 가장 먼저, 가장 정밀하게(Figma 실측 좌표 그대로)
구현된 화면이다. 그래서 이번 개정에서는 보딩패스 카드의 **실제 구현 값**을
1차 기준(source of truth)으로 놓고, 색상·타이포·간격·모서리 토큰을 거꾸로
검증해서 다시 정리했다.

이 과정에서 이전 버전 문서와 실제 코드가 어긋난 부분이 몇 군데 발견됐다.
(예: 라벨 색이 문서엔 연한 하늘색으로 적혀 있었는데 실제 카드는 진회색을 씀,
카드 radius가 문서엔 16으로 적혀 있었는데 실측은 10 등)
전부 **실제 구현(보딩패스 카드) 쪽을 정답으로 채택**해서 문서를 고쳤다.
무엇을 왜 고쳤는지는 맨 아래 "9. 변경 이력" 참고.

컴포넌트별 상세 스펙(각 컴포넌트의 크기·상태·코드 위치)은
[`design-components.md`](./design-components.md)에 따로 정리했다.
이 문서(`design-system.md`)는 **토큰(색·타이포·간격·모서리) 레벨의 규칙**만 다룬다.

---

## 1. 디자인 컨셉 (모든 결정의 근거)

> 상세: [`desing-concept.md`](./desing-concept.md)

| 컨셉 | 담당 | 한 문장 |
|---|---|---|
| 1. Glanceable | 어떻게 보이나 | 한눈에 읽히는 정보 위계 |
| 2. Stack & Collect | 무엇을 주나 | 쌓고 수집하는 만족감 |
| 3. Living Pass | 왜 특별한가 | 시간에 따라 살아있는 티켓 |

보딩패스 카드는 이 3가지 컨셉이 동시에 눈에 보이는 유일한 컴포넌트다 —
라벨/값 위계로 한눈에 읽히고(①), 여러 장이 겹쳐 쌓이며(②),
관람 3일 전에만 나타났다가 관람 후 스탬프로 바뀐다(③). 그래서 이 컴포넌트를
디자인 시스템의 기준으로 삼는다.

---

## 2. 색상 (Color)

### 2-1. 기본 팔레트 (Base)

| 토큰 | 역할 | HEX |
|---|---|---|
| `navy` (Primary) | 여권 표지, 헤더, 강조, 버튼 배경 | `#1B2A4A` |
| `blue` (Secondary) | 버튼, 링크, 강조 텍스트 | `#3D5A8A` |
| `cream` (Background) | 화면 전체 배경 (보딩패스 화면 제외 — 2-4 참고) | `#F5F1E8` |
| `surface` | 카드/목록의 흰 배경, 탭 바 배경 | `#FFFFFF` |
| `gold` (Accent) | 로고, 스탬프 테두리, 뱃지 포인트 | `#C9A961` |
| `text-primary` | 본문 진한 글씨 | `#1B2A4A` |
| `text-secondary` | 보조/라벨 회색 글씨 (크림·흰 배경 위) | `#6B6B6B` |
| `text-on-color` | 카테고리색 등 컬러 배경 위 흰 글씨 | `#FFFFFF` |

> 골드는 "특별한 순간"(스탬프, 뱃지, 로고)에만 소량. 남색+크림이 화면의 90%.

### 2-2. 카테고리 색 (Category) — 각 1개

> 보딩패스 배경/헤더, 뱃지, 스탬프에 쓰이는 색. events.genre 값과 1:1 매핑.
> 라이트/다크 모드 상관없이 항상 동일한 값을 쓴다.

| 카테고리 | 토큰 | HEX | 아이콘(MaterialCommunityIcons) |
|---|---|---|---|
| 전시 | `cat-exhibition` | `#1B63C6` | `palette-outline` |
| 클래식·무용 | `cat-classic` | `#6A5ACD` | `music` |
| 콘서트 | `cat-concert` | `#7FD4C1` | `headphones` |
| 연극 | `cat-theater` | `#D97757` | `drama-masks` |
| 뮤지컬 | `cat-musical` | `#C9599E` | `microphone-outline` |

> 코드 위치: `constants/colors.ts`의 `CategoryColors` / `CategoryIcons`.

### 2-3. 카드(온컬러) 내부 색 — 보딩패스 카드에서 확정, 신규 정식 토큰화

이전 문서는 "카테고리색 배경 위 라벨 글씨"를 `text-on-color-muted`(연한 하늘색
`#AEC4F2`)라고 적어뒀지만, **실제로 구현된 적도 코드에 존재한 적도 없는
값**이었다. 보딩패스 카드를 실측해 보니 라벨은 연한 파랑이 아니라
**진회색**을 쓰고 있었다 — 채도 높은 카테고리 색 위에서 연한 파랑보다
진회색 라벨이 대비가 훨씬 또렷하기 때문. 이 실측값을 정식 토큰으로 승격한다.

| 토큰 | 역할 | HEX | 비고 |
|---|---|---|---|
| `on-color-value` | 카드 위 큰 값 글씨 (HOME, SEOUL, SHIM GEONWOO 등) | `#FFFFFF` | = `text-on-color`와 동일값, 카드 문맥에서 재사용 |
| `on-color-label` | 카드 위 작은 라벨 글씨 (PASSENGER, DATE, SEAT 등) | `#2C2C2C` | **신규 확정.** 기존 문서의 `#AEC4F2`는 폐기 |
| `on-color-icon` | 카드 위 아이콘 (카테고리 아이콘, 비행기 아이콘) | `#000000` | |

> `constants/colors.ts`에는 아직 `on-color-label`/`on-color-icon` 토큰이
> 없고 각 컴포넌트 파일에 로컬 상수로 박혀 있다(`LABEL_COLOR`,
> `CARD_LABEL_COLOR` 등). 다음에 카드류 컴포넌트를 또 만들 때는
> `constants/colors.ts`로 옮겨서 공유하는 걸 권장한다.

### 2-4. 라이트/다크 모드 (Light / Dark)

앱은 폰의 라이트/다크 모드를 따라간다. 화면마다 두 벌의 색을 준비한다.

| 용도 | 라이트 모드 | 다크 모드 |
|---|---|---|
| 화면 배경 (일반 화면: 예매, 여권, 마이페이지) | cream `#F5F1E8` | `#1A1A1C` |
| 카드/스탬프 빈칸 배경 | 아주 연한 그레이 `#ECEAE3` | 시안 원본 다크 톤 `#242426` |
| 기본 텍스트 | navy `#1B2A4A` | 밝은 `#F5F1E8` |
| 카테고리 색 | 동일 (양쪽 공통) | 동일 (양쪽 공통) |

> 코드 위치: `constants/colors.ts`의 `Theme.light` / `Theme.dark`.

**예외 — 보딩패스 화면 배경.** 보딩패스 탭(`app/(tabs)/index.tsx`)만
위 표를 따르지 않고 라이트 `#FFFFFF` / 다크 `#2C2C2C`를 쓴다. 애플
월렛처럼 카드가 배경과 확실히 분리돼 보이도록 하기 위한 의도적 예외다.
새 화면을 만들 때는 기본적으로 위 표(크림/`#1A1A1C`)를 따르고,
보딩패스류(카드가 화면의 주인공인 화면)만 이 예외를 검토한다.

> 카테고리 색은 두 모드에서 같은 값을 쓴다. 배경과 텍스트만 모드에 따라 바뀐다.

---

## 3. 타이포그래피 (Typography)

> 폰트: 전체 Noto Sans KR (한글·영문·숫자 모두).
> 굵기 파일: `constants/fonts.ts` — `regular`(400) / `medium`(500) /
> `bold`(700) / `demiLight`(Noto Sans KR엔 정확한 DemiLight가 없어서
> 가장 가까운 300·Light로 대체).

이전 문서의 타이포 표는 보딩패스 카드를 만들기 *전에* 적어둔 추정치였고,
실제 실측값(4번 표)과 달랐다(예: "Display 32px/500" → 실제 24px/300).
아래는 실측값 기준으로 다시 정리한 표다.

### 3-1. 카드(온컬러) 타이포 — 보딩패스 카드 실측 기준

| 역할 | 예시 | 크기 | 굵기 | 색 | letterSpacing |
|---|---|---|---|---|---|
| CardHeader | EXHIBITION | 20px | Bold(700) | on-color-value | - |
| CardBigValue | HOME, SEOUL | 24px | DemiLight(300) | on-color-value | - |
| CardLabel | PASSENGER, DATE, SEAT, CAP, CONTENT | 10px | Bold(700) | on-color-label | - |
| CardValue | SHIM GEONWOO, 15:00, 자유석 | 12px | DemiLight(300) | on-color-value | 0.24 (DATE 값만 예외, 0) |

### 3-2. 일반 화면 타이포 — 크림/흰 배경 위

| 역할 | 예시 | 크기 | 굵기 | 색 |
|---|---|---|---|---|
| Logo | ART PORT | 22px | Bold(700) | text-primary |
| Title | 화면/상세 제목 | 22px | Medium(500) | text-primary |
| Body | 일반 텍스트 | 15px | Regular(400) | text-primary |
| Label | 라벨 (날짜, 장소 등 정보 라벨) | 11px | Medium(500) | text-secondary |
| Value | 라벨 옆 값 | 15px | Regular(400) | text-primary |
| Caption | 목록 카드 부가 정보 | 12px | Regular(400) | text-secondary |
| ButtonLabel | 버튼 안 글씨 | 16px | Medium(500) | text-on-color |

> "Label/Value" 구조는 두 버전이 있다: 카드 위(3-1, 진하고 화려한 배경)와
> 일반 화면(3-2, 차분한 배경). 새 컴포넌트를 만들 때 지금 놓인 배경이
> 카테고리색 카드인지 크림/흰 배경인지부터 확인하고 맞는 표를 쓴다.

---

## 4. 간격 (Spacing)

> 4의 배수만 사용 — **단, 보딩패스 카드 내부 좌표는 예외.**
> 카드 내부는 Figma Dev Mode 좌표를 그대로 옮긴 값이라 4px 그리드를 따르지
> 않는다(예: left 13, top 19, top 70). 정확한 값은
> [`design-components.md`](./design-components.md)의 BoardingPassCard
> 섹션 참고. **화면 레이아웃(패딩, 컴포넌트 사이 간격)은 반드시 아래
> 그리드를 따른다.**

| 토큰 | 값 | 용도 |
|---|---|---|
| `xs` | 4px | 아이콘-텍스트 사이 |
| `sm` | 8px | 라벨-값 사이, 뱃지 내부 여백 |
| `md` | 16px | 요소 간 기본 간격, 화면 좌우 여백 |
| `lg` | 20px | 카드 내부 여백 |
| `xl` | 24px | 섹션 사이, 화면 하단 여백 |
| `2xl` | 32px | 화면 상하 여백 |

---

## 5. 모서리·테두리 (Radius / Border)

이전 문서는 "radius-card 16px = 보딩패스 카드"라고 적어뒀지만, 보딩패스
카드를 Figma 실측대로 만들어보니 실제 radius는 **10px**이었다. 16px는
쿠폰 배너 같은 큰 정보 카드에는 맞지만 보딩패스 카드에는 안 맞는 값이라,
아래처럼 **두 토큰으로 분리**했다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-pass-card` | **10px** | 보딩패스 카드 전용 (Figma 실측) |
| `radius-card` | 16px | 쿠폰 배너 등 일반 정보 카드 |
| `radius-md` | 12px | 목록 카드 이미지 자리, 스탬프 칸 |
| `radius-button` | 8px | 버튼, 상세 화면 포스터 뒤로가기 버튼(원형은 별도) |
| `radius-pill` | 20px | 뱃지, 카테고리 탭 |
| `border-hairline` | 0.5px `#E3DBC8` | 크림 배경 위 카드 구분선 |
| `border-on-color` | 0.5px `rgba(255,255,255,0.25)` | 컬러 카드 내부 구분선 |

---

## 6. 아이콘 (Icon)

- 기본 스타일: 실선(outline)으로 통일. 채워진(filled) 아이콘과 섞지 않는다.
- 라이브러리 특성상 이름에 `-outline`이 없어도 실제로는 선 스타일인
  아이콘이 있다(예: MaterialCommunityIcons `music`, `headphones`,
  `drama-masks`에는 별도 outline 변종이 없음) — 이런 경우는 위반이 아니다.
- **의도적 예외 — 비행기 아이콘.** 보딩패스 카드 중앙의 비행기 아이콘은
  `airplane`(채워짐)을 쓴다. `airplane-outline`도 있지만, 카드의 핵심
  상징이라 실선보다 채워진 쪽이 시각적 무게가 있어서 의도적으로 선택했다.
  새 아이콘을 고를 때 이 예외를 다른 곳에 함부로 확장하지 않는다.
- 카테고리 아이콘은 2-2 표를 그대로 따른다.

---

## 7. 레이아웃 기준

- 디자인 기준 프레임: 390 x 844 (iPhone 14/13)
- 화면 좌우 여백: 16px (`md`)
- 보딩패스 카드: 카드 자체 270 x 380, 화면 안에서 가운데 정렬
- React Native에서 비율 기반으로 다른 기기에 자동 대응

---

## 8. 피그마 실측값 (Figma Specs) — 보딩패스 카드

> 이 프로젝트의 실측 기준(source of truth). 3, 4, 5번 섹션의 토큰은
> 전부 이 실측값을 검증해서 나왔다. 코드 위치:
> `components/boarding-pass-card.tsx`(정적본), `app/(tabs)/index.tsx`(동적본).

**카드 전체**
- 크기: 270 x 380, radius **10**(`radius-pass-card`)
- 세로 3영역: 상단(270x42) / 중간(270x170) / 하단(270x168)

**상단 (270 x 42)**
- 좌: 카테고리명 — CardHeader(20px Bold, `on-color-value`)
- 우: 카테고리 아이콘 — 37x37 칸 중앙, 높이 24, `on-color-icon`

**중간 (270 x 170)**
- 라벨류(자택 / 콘텐츠장소 / PASSENGER / DATE / TIME / SEAT / CAP)
  — CardLabel(10px Bold, `on-color-label` `#2C2C2C`)
- 비행기 아이콘 — 37x37 칸, 높이 28, `on-color-icon`, 6번 섹션의 예외로 filled
  위치: "자택(출발)" 값과 "관람 도시(도착)" 값 사이, 세로 중앙 정렬
- 큰 값: HOME(출발), 도착 도시 — CardBigValue(24px DemiLight, `on-color-value`)
- 나머지 값(이름 / 관람일 / 관람시간 / SEAT값 / 인원수)
  — CardValue(12px DemiLight, `on-color-value`, letterSpacing 0.24. DATE만 0)

**하단 (270 x 168)**
- CONTENT 라벨 — CardLabel
- CONTENT 이름(값) — CardValue, 최대 2줄
- 그 아래 QR코드 자리 — 100x100, radius 10, 가운데 정렬 (지금은 회색 박스로 대체)

> 카드 배경색 = 공연 카테고리 색 (2-2 표).
> 카드 내부 좌표는 4px 그리드를 따르지 않는 예외 (4번 섹션 참고).

### 8-1. 보딩패스 스택(겹침) — `app/(tabs)/index.tsx`

| 항목 | 값 |
|---|---|
| 자리별 top | 맨 앞 48 / 중간 24 / 맨 뒤 0 (카드가 4장 이상이면 "맨 뒤" 값 재사용) |
| 자리별 그림자 opacity | 맨 앞 0.25 / 중간 0.15 / 맨 뒤 0.08 |
| 자리별 그림자 radius | 맨 앞 16 / 중간 8 / 맨 뒤 4 |
| 자리별 elevation(Android) | 맨 앞 12 / 중간 6 / 맨 뒤 3 |
| 애니메이션 시간 | 350ms, `Easing.inOut(Easing.ease)` |
| 카드 탭 동작 | 탭한 카드가 맨 앞으로, 나머지는 한 칸씩 뒤로 밀림 |

### 8-2. 스탬프 페이지 (Passport Stamp) — `app/(tabs)/passport.tsx`

**그리드**
- 3 x 3 (한 페이지 9칸), 칸 사이 간격: 가로 8(`GRID_GAP`), 세로 20(코드 실제값.
  시안 실측값(가로 5, 세로 47)과는 다르게 화면 비율에 맞춰 코드에서 조정했음 —
  시각 확인 필요 시 `docs/passport-stamp-progress.png`와 대조)

**스탬프 한 칸**
- 비율: 가로:세로 = 1 : 1.25(`STAMP_ASPECT_RATIO = 0.8`), radius `radius-md`(12)
- 세로 2영역: 포스터(상단, 거의 전체) / 하단 정보 띠

**하단 정보 띠** (보딩패스와 달리 라벨/값 구분 없이 둘 다 흰 글씨 값 톤)
- 날짜 — 좌측 정렬, 11px Regular, `on-color-value`(흰색)
- 장소 — 우측 정렬, 11px Medium, `on-color-value`(흰색), 1줄 넘으면 말줄임
- 콘텐츠별 카테고리 아이콘: 하단 띠 좌측에 관람일자와 겹치게 배치(아이콘이 뒤 레이어)

**안 채운 칸**
- 점선 테두리(SVG로 직접 그림, `strokeDasharray="6,5"`), 항상 9칸을 그림

**페이지 번호**
- 화면 맨 아래 중앙, 하단 탭 바로 위

---

## 9. 변경 이력 (이번 개정에서 실제 코드와 대조해 고친 것)

| 항목 | 이전 문서 | 실제 구현 | 조치 |
|---|---|---|---|
| 카드 radius | 16px (`radius-card`) | 10px | `radius-pass-card`(10) 신설, `radius-card`(16)는 일반 카드용으로 의미 재정의 |
| 카드 라벨 색 | `text-on-color-muted #AEC4F2` (코드에 존재한 적 없음) | `#2C2C2C` | `on-color-label` 토큰으로 신규 확정 |
| Display(HOME/SEOUL) 타이포 | 32px / Medium(500) | 24px / DemiLight(300) | 3-1 CardBigValue로 실측값 반영 |
| Header(EXHIBITION) 타이포 | 20px / Medium(500) | 20px / **Bold(700)** | 3-1 CardHeader로 실측값 반영 |
| 비행기 아이콘 | "아이콘은 outline 통일" 규칙과 충돌 | `airplane`(filled) 사용 | 6번 섹션에 의도적 예외로 명문화 |
| 보딩패스 화면 배경 | 일반 화면과 같은 크림/#1A1A1C로 오인되기 쉬움 | 라이트 `#FFFFFF` / 다크 `#2C2C2C` | 2-4에 예외로 명문화 |
| 목록 카드(EventListCard) 포스터 radius | `radius-md`(12) 규칙과 다르게 코드에서 8 사용 | - | 코드를 12로 수정(`app/(tabs)/booking/index.tsx`) |
| 보딩패스 정적 컴포넌트 라벨 색 오타 | `#2C2C2E` (다른 파일과 한 글자 다름) | `#2C2C2C` | 코드를 `#2C2C2C`로 수정(`components/boarding-pass-card.tsx`) |

컴포넌트별 상세 스펙은 [`design-components.md`](./design-components.md) 참고.
