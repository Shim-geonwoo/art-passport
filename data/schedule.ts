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

// 'YYYY-MM-DD' + 'HH:MM' 글자를 Date로. toDateKey의 반대 방향이다.
// 잘못 적힌 값은 null을 돌려주므로, 부르는 쪽에서 저장 전에 막을 수 있다.
//
// 왜 필요한가: 관리자 화면은 날짜를 달력이 아니라 글자로 받는다. 공연 일정은 보통 문서에서
// 옮겨 적는 것이라 달력을 몇 달씩 넘기는 것보다 타이핑이 빠르다.
// (예매하는 사람이 쓰는 화면은 반대라서 components/date-calendar.tsx를 쓴다 — 그쪽은 Date를
//  그대로 들고 있어서 이 함수가 필요 없다)
export function parseDateKey(dateText: string, timeText: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  if (Number(hour) > 23 || Number(minute) > 59) {
    return null;
  }

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0
  );
  // '2026-02-31' 같은 값은 Date가 3월로 넘겨버리므로, 되돌려 비교해서 걸러낸다
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return null;
  }
  return date;
}

// 입력칸에 친 글자를 'YYYY-MM-DD' / 'HH:MM' 모양으로 다듬는다. 숫자만 치면 구분자가 알아서 들어간다.
//
// 관리자는 날짜를 문서에서 옮겨 적는데, 그때 손이 치는 건 숫자뿐이다. '-'나 ':'를 직접 치게 하면
// 자판을 오가야 하고(모바일 숫자판에는 없는 경우도 있다), 빠뜨리면 저장할 때가 되어서야 걸린다.
//
// 숫자가 아닌 글자는 전부 버린다. 그래서 붙여넣기('2026-08-14', '2026.08.14')도 같은 결과가 되고,
// 지울 때 구분자가 다시 붙지 않는다 — 숫자가 그만큼 남아 있을 때만 넣기 때문이다.
export function formatDateInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8); // YYYYMMDD
  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function formatTimeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4); // HHMM
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// 같은 날인가 (시각은 무시). 달력에서 "고른 날"을 표시할 때 쓴다.
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
