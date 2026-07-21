// 날짜 유틸 — "오늘 기준 상대일(offsetDays)" ↔ 실제 Date 변환
//
// 왜 offset을 쓰나: docs/data-flow.md 1장 참고.
// 더미 데이터는 고정 날짜 대신 "오늘로부터 며칠"로 갖고 있다가, 화면에 뿌릴 때만
// 실제 날짜 문자열로 바꾼다. 그래야 데모를 언제 켜도 임박 티켓·지난 관람이 항상 보인다.
// (Supabase 연동 후에는 events.show_at에 진짜 timestamp가 들어오므로 이 파일은 데모 전용이다.)

// 하루를 밀리초로. 보딩패스 "3일 전" 계산 등에서 쓴다.
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 오늘 00:00 (로컬 시간). offset 계산의 기준점.
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
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
