// 날짜 유틸 — 화면에 보여줄 날짜/시각 문자열 만들기, 날짜 비교
//
// Supabase 연동 후로는 events.show_at 등에 진짜 timestamp가 들어오므로, 이 파일의 본업은
// "Date를 사람이 읽는 글자로 바꾸는 것"이다 (formatDate / formatDateTime / formatMonthDayWeekday …).
// offsetToDate는 더미 데이터 시절 "오늘로부터 며칠" 표기를 Date로 바꾸던 함수다 —
// 왜 그런 표기를 썼는지는 docs/data-flow.md 1장 참고.

// 하루를 밀리초로. "내일부터 고를 수 있다" 같은 날짜 계산에서 쓴다.
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 그 날의 00:00 (로컬 시간). "시각은 빼고 날짜끼리만 비교"할 때 쓴다.
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 오늘 00:00 (로컬 시간). offset 계산의 기준점.
export function startOfToday(now: Date = new Date()): Date {
  return startOfDay(now);
}

// offsetDays(일) + 선택 시각('HH:mm') → 실제 Date
// 예) offsetToDate(2, '19:30') = 모레 저녁 7시 30분
export function offsetToDate(offsetDays: number, time?: string, now: Date = new Date()): Date {
  const d = startOfToday(now);
  d.setDate(d.getDate() + offsetDays);
  if (time) {
    const [hour, minute] = time.split(':').map(Number);
    d.setHours(hour, minute, 0, 0);
  }
  return d;
}

// 한 자리 수 앞에 0을 붙인다 (9 → "09")
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// 2026.08.14
export function formatDate(d: Date): string {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 2026.08.14 19:30
export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 19:30
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 요일 이름. Date.getDay()가 돌려주는 0~6을 그대로 인덱스로 쓴다 (0 = 일요일).
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 08.14 (목) — 회차 목록처럼 "무슨 요일인지"가 중요한 자리에 쓴다.
export function formatMonthDayWeekday(d: Date): string {
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WEEKDAY_LABELS[d.getDay()]})`;
}

// 2026-08-14 — 서버(create_booking)에 관람 날짜를 넘길 때 쓰는 형식.
// toISOString()을 쓰면 UTC로 바뀌면서 날짜가 하루 밀릴 수 있어서, 로컬 날짜를 그대로 적는다.
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 같은 날인가 (시각은 무시). 달력에서 "고른 날"을 표시할 때 쓴다.
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
