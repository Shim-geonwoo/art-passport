# Art Passport — 디자인 컴포넌트

> 각 컴포넌트의 상세 스펙(크기·색·타이포·상태·코드 위치)을 정리한 문서.
> 토큰(색·타이포·간격·모서리) 정의는 [`design-system.md`](./design-system.md) 참고.
> **BoardingPassCard**가 이 프로젝트에서 가장 정밀하게 구현된 컴포넌트라,
> 아래 스펙 표의 형식(목적 → 크기 → 색 → 타이포 → 상태 → 코드 위치)을
> 다른 모든 컴포넌트에도 동일하게 적용했다.

---

## 목차

1. [BoardingPassCard](#1-boardingpasscard-기준-컴포넌트) — 기준 컴포넌트
2. [BoardingPassStack](#2-boardingpassstack)
3. [GenreBadge](#3-genrebadge)
4. [CategoryTab](#4-categorytab)
5. [EventListCard](#5-eventlistcard)
6. [PrimaryButton](#6-primarybutton)
7. [LabelValue](#7-labelvalue)
8. [Stamp / EmptyStampSlot](#8-stamp--emptystampslot)
9. [PassportPage](#9-passportpage)
10. [CouponBanner](#10-couponbanner)
11. [SearchBar (보딩패스 헤더형)](#11-searchbar-보딩패스-헤더형)
12. [컴포넌트 설계 체크리스트](#12-새-컴포넌트-만들-때-체크리스트)

---

## 1. BoardingPassCard (기준 컴포넌트)

카드 한 장 = 애플 월렛 보딩패스 한 장. 다른 모든 컴포넌트가 참고하는 기준.

- **목적**: 관람 임박한 예매 1건을 항공권처럼 보여준다. "자택(HOME) → 관람 도시(SEOUL)"
  가상의 비행 컨셉.
- **코드**: `components/boarding-pass-card.tsx`(정적 목업),
  `app/(tabs)/index.tsx`의 `BoardingPassCard`(실 데이터 바인딩 버전)
- **크기**: 270 x 380, radius `radius-pass-card`(10), `overflow: hidden`
- **배경색**: 카테고리 색 (`CategoryColors[genre]`)
- **레이아웃**: 세로 3영역, 전부 `position: absolute` 좌표 (design-system.md 8번 표 그대로)
  - 상단 270x42 — 카테고리명(CardHeader) + 카테고리 아이콘
  - 중간 270x170 — HOME/SEOUL + 비행기 아이콘 + PASSENGER/DATE/TIME/SEAT/CAP
  - 하단 270x168 — CONTENT 라벨/값 + QR 자리(100x100 회색 박스, 실제 QR 붙기 전 임시)
- **타이포**: `design-system.md` 3-1 표(CardHeader/CardBigValue/CardLabel/CardValue) 그대로
- **색**: `on-color-value`(흰) / `on-color-label`(#2C2C2C) / `on-color-icon`(검정)
- **상태**: 지금은 정적 상태 하나뿐(관람 임박). "관람완료"가 되면 이 카드가 아니라
  `Stamp` 컴포넌트로 완전히 바뀐다(카드 자체에 상태 변형은 없음).
- **데이터 바인딩 시 주의**
  - `venueName`이 길면 `adjustsFontSizeToFit` + `numberOfLines={1}`로 줄인다(코드에 이미 반영).
  - `eventTitle`(CONTENT 값)이 2줄이 되면 라벨/값을 원래 좌표보다 12px 위로 올려서
    QR 자리와 안 겹치게 한다(코드에 이미 반영, `contentLabel`/`contentValue` top 참고).
- **의도적 예외**: 비행기 아이콘은 outline이 아니라 filled(`airplane`) —
  design-system.md 6번 섹션 참고.

---

## 2. BoardingPassStack

BoardingPassCard 여러 장을 애플 월렛처럼 겹쳐 쌓는 컨테이너.

- **목적**: 관람 임박(3일 이내) 예매가 여러 건이면 겹쳐서 보여주고, 탭하면 맨 앞으로.
- **코드**: `app/(tabs)/index.tsx`
- **표시 조건**: `showAt`이 "지금 ~ 지금+3일" 사이인 예매만 (지나거나 너무 먼 건 제외)
- **정렬 기준**: 관람 시각이 가까운 순서로 처음 쌓임
- **자리별 스펙**(design-system.md 8-1 표)

  | 자리 | top | shadow opacity | shadow radius | elevation |
  |---|---|---|---|---|
  | 맨 앞(0) | 48 | 0.25 | 16 | 12 |
  | 중간(1) | 24 | 0.15 | 8 | 6 |
  | 맨 뒤(2+) | 0 | 0.08 | 4 | 3 |

- **인터랙션**: 카드를 탭하면 그 카드가 맨 앞으로, 나머지는 한 칸씩 밀림.
  위치/그림자는 350ms로 부드럽게, zIndex는 즉시 바뀜(탭 순간 그 카드가 맨 위로 그려짐).
- **검색 연동**: 헤더 검색창에 콘텐츠명/장소를 입력하면 일치하는 첫 카드를 찾아
  탭한 것과 동일하게 맨 앞으로 올림.
- **빈 상태**: 보여줄 카드가 하나도 없으면 헤더(타이틀+검색)만 남기고 카드 영역은
  안내 문구 없이 완전히 비움 (애플 월렛처럼).

---

## 3. GenreBadge

카테고리 색 pill. 목록 카드·상세 화면에서 "이 공연이 무슨 장르인지" 표시.

- **목적**: 화면 어디서든 장르를 한눈에 구분(카테고리 색 + 이름)
- **코드**: `components/genre-badge.tsx`
- **크기**: 내용에 맞춰 자동(hug), `radius-pill`(20), 가로 padding `sm`(8), 세로 padding 3
- **색**: 배경 = `CategoryColors[genre]`, 글씨 = `on-color-value`(흰)
- **타이포**: 11px Medium(500)
- **BoardingPassCard와의 관계**: 카드 상단의 CardHeader(20px Bold, 영문 대문자,
  "EXHIBITION")가 큰 화면 안에서 하는 역할을, 작은 목록/상세 화면에서는
  GenreBadge(11px Medium, 한글, "전시")가 대신한다 — 같은 정보, 다른 크기의 자리.

---

## 4. CategoryTab

예매 탭 목록 화면 상단의 장르 필터 탭.

- **목적**: 5개 장르 중 하나를 골라 공연 목록을 필터링
- **코드**: `app/(tabs)/booking/index.tsx`의 `CategoryTab`
- **크기**: 내용에 맞춰 자동, `radius-pill`(20), 가로 padding 16 / 세로 padding 8, border 1px
- **상태**
  | 상태 | 배경 | 글씨색 | 테두리 |
  |---|---|---|---|
  | 선택됨 | `CategoryColors[genre]` | `on-color-value`(흰) | 배경과 같은 색(테두리 안 보임) |
  | 선택 안 됨 | `cream` | `text-secondary` | `dashedBorder`(라이트 `#E3DBC8` / 다크 `rgba(255,255,255,.25)`) |
- **타이포**: 14px Medium(500)
- **배치**: 가로 스크롤(`ScrollView horizontal`), 탭 사이 간격 `sm`(8)

---

## 5. EventListCard

예매 탭 목록의 공연 카드 한 줄.

- **목적**: 예매 가능한 공연을 스캔하기 쉽게(포스터 + 핵심 정보) 나열
- **코드**: `app/(tabs)/booking/index.tsx`의 `EventCard`
- **레이아웃**: 가로 배치 — 포스터(좌) + 정보(우), 세로 padding `md`(16), 내부 간격 12
- **포스터**: 60 x 80, `radius-md`(12), 실제 이미지 없을 때 카테고리 색 박스 + 아이콘
- **정보 영역**(세로 쌓기, 간격 `xs`=4)
  - 제목 — 16px Medium(500), `text-primary`, 1줄 말줄임
  - GenreBadge (3번 컴포넌트 재사용)
  - 날짜/장소 — Caption(12px Regular, `text-secondary`)
  - 가격 — 13px Medium(500), `text-primary`
- **구분**: 카드 사이 `border-hairline` 1줄(마지막 카드는 생략)
- **인터랙션**: 카드 전체를 누르면 상세 화면(`/booking/[id]`)으로 이동

---

## 6. PrimaryButton

화면 하단에 고정되는 기본 액션 버튼.

- **목적**: "예매하기"처럼 화면의 핵심 액션 1개를 강조
- **코드**: `app/(tabs)/booking/[id].tsx`의 `bookButton`(현재는 인라인 스타일,
  재사용이 늘면 `components/primary-button.tsx`로 분리 권장)
- **크기**: 가로 꽉 채움, 세로 padding 16, `radius-button`(8)
- **색**: 배경 `navy`, 글씨 `text-on-color`(흰)
- **타이포**: 16px Medium(500)
- **배치**: 화면 하단 고정, 좌우 여백 `md`(16), 상하 여백 12

---

## 7. LabelValue

"라벨(작게, 연하게) + 값(크게, 진하게)" 반복 구조. 배경에 따라 2가지 변형이 있다.

| 변형 | 쓰이는 곳 | 라벨 | 값 |
|---|---|---|---|
| **온컬러형** | BoardingPassCard 내부 | 10px Bold, `on-color-label`(#2C2C2C) | 12~24px DemiLight, `on-color-value`(흰) |
| **일반화면형** | 공연 상세 화면(`날짜`/`장소`/`가격`) | 11px Medium, `text-secondary` | 15px Regular, `text-primary` |

- **코드**: 온컬러형은 `boarding-pass-card.tsx`에 각 필드가 개별 Text로 흩어져 있음(공용
  컴포넌트로 아직 추출 안 됨). 일반화면형은 `app/(tabs)/booking/[id].tsx`의 `LabelValue`.
- **규칙**: 새 화면에 라벨+값 쌍을 넣을 때, 지금 배경이 카테고리색(카드)인지
  크림/흰(일반 화면)인지부터 확인하고 맞는 변형을 쓴다. 온컬러형에 일반화면형
  색(연회색)을 쓰면 대비가 너무 낮아 안 보인다.

---

## 8. Stamp / EmptyStampSlot

여권 페이지의 스탬프 한 칸 = 관람완료한 예매 1건.

- **목적**: 관람 후 티켓이 "포스터 도장"으로 바뀌어 쌓이는 걸 보여준다(Stack & Collect 컨셉)
- **코드**: `app/(tabs)/passport.tsx`의 `StampCard` / `EmptyStampSlot`
- **크기**: 그리드 폭에 따라 가변, 가로:세로 = 1:1.25(`STAMP_ASPECT_RATIO=0.8`),
  `radius-md`(12)
- **채워진 칸(StampCard)**
  - 포스터 자리 — 카테고리 색 박스(실제 포스터 이미지 대체), 남은 공간 전부 차지
  - 하단 정보 띠 — 배경 카테고리 색, 좌: 날짜(11px Regular) + 장르 아이콘(겹침 배치),
    우: 장소(11px Medium, 1줄 말줄임). 둘 다 `on-color-value`(흰)
- **빈 칸(EmptyStampSlot)**
  - 배경 `emptyCellBackground`(라이트 `#ECEAE3` / 다크 `#242426`)
  - 테두리 — `dashedBorder` 색, SVG로 직접 그린 점선(`strokeDasharray="6,5"`).
    (RN의 `borderStyle:'dashed'`는 radius가 있으면 기기별로 깨져 보여서 SVG 사용)
- **규칙**: 항상 9칸을 그린다. 채운 개수만큼만 StampCard, 나머지는 EmptyStampSlot.

---

## 9. PassportPage

스탬프 9칸(3x3) + 완성 시 쿠폰 배너를 담는 페이지 컨테이너.

- **목적**: 여권 한 페이지 단위로 스탬프를 묶어 보여줌
- **코드**: `app/(tabs)/passport.tsx`
- **그리드**: 3x3, 가로 간격 8(`GRID_GAP`), 세로 간격 20(줄 사이)
- **완성 조건**: 스탬프 9개 = 1페이지 완성 → `CouponBanner` 노출
- **페이지 번호**: 화면 맨 아래 중앙, 탭 바 바로 위, 12px Regular `text-secondary`,
  스크롤 영역 밖에 고정
- **다음 페이지**: 아직 미구현(스탬프가 9개 넘는 경우 UI 없음) — 데이터가 쌓이면
  `docs/data-structure.md`의 "페이지 = ceil(N/9)" 규칙대로 페이지 전환 UI 추가 필요

---

## 10. CouponBanner

스탬프 9칸을 다 채웠을 때 뜨는 배너.

- **목적**: "다음 예매 10% 할인" 쿠폰 발급을 축하 + 리워드함으로 유도
- **코드**: `app/(tabs)/passport.tsx`
- **크기**: 가로 꽉 채움, `radius-card`(16, 일반 카드용 — `radius-pass-card` 아님),
  세로 padding `xl`(24), 가로 padding `lg`(20)
- **색**: 배경 `navy`, 문구 `text-on-color`(흰), 버튼만 `gold`(포인트 색은 여기만 소량 사용)
- **타이포**: 문구 20px Bold(700), 버튼 글씨 14px Medium(500) 색은 `navy`(골드 배경 위 대비용)
- **버튼**: `radius-pill`(20), "리워드함으로 가기"

---

## 11. SearchBar (보딩패스 헤더형)

보딩패스 화면 상단, 검색 아이콘을 누르면 타이틀 자리가 입력창으로 바뀌는 패턴.

- **목적**: 쌓인 티켓 중 원하는 걸 콘텐츠명/장소로 찾아 맨 앞으로 꺼내옴(Stack & Collect)
- **코드**: `app/(tabs)/index.tsx`의 `BoardingPassHeader`
- **동작**: 검색 아이콘(`search-outline`) 탭 → "ART PASS" 타이틀 자리가 `TextInput`으로
  바뀌고 아이콘이 닫기(`close`)로 바뀜. 입력 즉시(디바운스 없음) 일치하는 첫 카드를
  스택 맨 앞으로 올림.
- **타이포**: 타이틀/입력창 동일하게 20px Bold(700)
- **색**: 화면 배경(라이트 흰/다크 `#2C2C2C`)에 맞춰 아이콘·글씨 색이 반전됨
  (라이트 = `text-primary`, 다크 = `text-on-color`)
- **다른 화면과의 차이**: 여권 화면(`passport.tsx`) 헤더는 검색 아이콘만 있고 탭해도
  아무 동작이 없다(미구현). 실제로 동작하는 검색은 이 컴포넌트뿐이다.

---

## 12. 새 컴포넌트 만들 때 체크리스트

BoardingPassCard 스펙을 기준으로 새 컴포넌트를 만들 때 확인할 것:

1. **배경이 카테고리색(카드)인가 크림/흰(일반 화면)인가?** → 7번 LabelValue 표에서
   맞는 변형 선택.
2. **크기/여백이 4px 그리드를 따르는가?** 보딩패스 카드 내부처럼 Figma 좌표를
   그대로 옮기는 예외적인 경우가 아니면 4번(design-system.md) 그리드를 따른다.
3. **radius가 어떤 토큰에 해당하는가?** 보딩패스류 카드=10, 일반 정보 카드=16,
   목록 이미지/스탬프=12, 버튼=8, 뱃지/탭=20. (design-system.md 5번)
4. **아이콘은 outline인가?** 예외(비행기)가 아니면 outline 계열로.
5. **다크모드 값도 같이 정했는가?** 카테고리 색은 고정, 배경/텍스트만 모드별로.
