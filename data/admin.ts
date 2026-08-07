// 관리자용 데이터 — 카탈로그를 "관리하는 쪽"에서 보는 시선
//
// data/events.ts와 일부러 나눠 뒀다. 두 곳이 같은 events 표를 보지만 필요한 게 다르다:
//
//   data/events.ts  — 예매하는 사람이 보는 카탈로그. 숨긴 공연은 빼고, 회차는 예매용으로 쓴다.
//   여기            — 관리하는 사람이 보는 카탈로그. **숨긴 것까지 전부** 나와야 하고,
//                     "왜 목록에 안 보이는지"(회차 없음 / 숨김)를 알려줘야 한다.
//
// 쓰기 권한은 DB가 정한다(20260806150000_admin_role.sql). 여기서 화면을 감추는 건 편의일 뿐이고,
// 관리자가 아닌 사람이 이 함수를 불러 저장을 시도하면 서버가 거절한다.

import { Genre } from '@/constants/colors';
import { parseDateKey } from '@/data/schedule';
import { supabase } from '@/lib/supabase';

// 지금 로그인한 사람이 관리자인가.
//
// admins 표를 직접 읽지 않는다 — 읽을 수도 없다(권한을 회수하고 정책도 두지 않았다).
// 대신 is_admin() 함수에게 물어본다. 이 함수만 SECURITY DEFINER라 그 표를 볼 수 있다.
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    throw error;
  }
  return data === true;
}

export type AdminEventItem = {
  id: string;
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date;
  showEndAt: Date | null; // 값이 있으면 전시(기간형), null이면 공연(회차형)
  posterUrl: string | null;
  description: string | null;
  isHidden: boolean;
  scheduleCount: number; // 등록된 회차 수 (전시는 항상 0)
  upcomingScheduleCount: number; // 그중 아직 안 지난 회차 수
};

type AdminEventRow = {
  id: string;
  title: string;
  genre: string;
  venue_name: string;
  price: number;
  show_at: string;
  show_end_at: string | null;
  poster_url: string | null;
  description: string | null;
  is_hidden: boolean;
  event_schedules: { id: string; starts_at: string }[] | null;
};

function mapRow(row: AdminEventRow, now: Date): AdminEventItem {
  const schedules = row.event_schedules ?? [];
  return {
    id: row.id,
    title: row.title,
    genre: row.genre as Genre,
    venueName: row.venue_name,
    price: row.price,
    showAt: new Date(row.show_at),
    showEndAt: row.show_end_at ? new Date(row.show_end_at) : null,
    posterUrl: row.poster_url,
    description: row.description,
    isHidden: row.is_hidden,
    scheduleCount: schedules.length,
    upcomingScheduleCount: schedules.filter((s) => new Date(s.starts_at).getTime() > now.getTime())
      .length,
  };
}

// 카탈로그 전체를 관리자 시선으로 불러온다.
//
// fetchEvents(data/events.ts)와 달리 is_hidden으로 거르지 않는다 — 숨긴 공연이야말로
// 관리 화면에서 찾아 다시 올릴 수 있어야 하는 대상이다.
// 회차는 개수만 세면 되므로 id와 시각만 받아온다.
// (정원·판매수는 회차 화면이 fetchAdminSchedules로 따로 받아온다 — 목록에서는 쓰지 않는다)
export async function fetchAdminEvents(now: Date = new Date()): Promise<AdminEventItem[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, genre, venue_name, price, show_at, show_end_at, poster_url, description, is_hidden, event_schedules(id, starts_at)'
    )
    .order('show_at', { ascending: true });
  if (error) {
    throw error;
  }
  return ((data ?? []) as unknown as AdminEventRow[]).map((row) => mapRow(row, now));
}

// 이 공연이 지금 예매 탭에 보이는가, 안 보인다면 왜인가.
//
// 관리 화면에서 가장 자주 묻게 될 질문이라 한곳에서 답을 만든다. 특히 "회차 없음"이 중요하다 —
// 공연을 등록해도 회차를 안 만들면 예매 탭에 아예 안 뜨는데, 화면 어디에도 그 이유가 없으면
// 등록이 실패한 줄 알게 된다. (전시는 회차 개념이 없어서 이 경우가 없다)
export type CatalogVisibility = { visible: boolean; reason: string | null };

export function catalogVisibility(event: AdminEventItem, now: Date = new Date()): CatalogVisibility {
  if (event.isHidden) {
    return { visible: false, reason: '숨김' };
  }

  // 판단 순서는 data/events.ts의 isBookable, 그리고 create_booking과 같다.
  // 회차가 있으면 회차형 — 종료일이 있어도(시간지정 입장 전시) 회차 쪽을 본다.
  if (event.scheduleCount > 0) {
    return event.upcomingScheduleCount === 0
      ? { visible: false, reason: '남은 회차 없음' }
      : { visible: true, reason: null };
  }

  if (event.showEndAt) {
    // 기간형: 종료일이 안 지났으면 보인다
    const ended = event.showEndAt.getTime() < now.getTime();
    return ended ? { visible: false, reason: '전시 종료' } : { visible: true, reason: null };
  }

  // 회차도 종료일도 없다 — 파는 방법이 정해지지 않아 예매 탭에 뜨지 않는다
  return { visible: false, reason: '회차 없음' };
}

// 편집 화면 하나만 다시 불러온다 (저장 직후 화면을 최신으로 맞출 때)
export async function fetchAdminEvent(
  id: string,
  now: Date = new Date()
): Promise<AdminEventItem | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, genre, venue_name, price, show_at, show_end_at, poster_url, description, is_hidden, event_schedules(id, starts_at)'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? mapRow(data as unknown as AdminEventRow, now) : null;
}

// ── 쓰기 ──────────────────────────────────────────────────
//
// 아래 함수들은 events 표를 직접 쓴다. 예매·쿠폰과 달리 서버 함수를 거치지 않는데,
// 관리자가 곧 정보의 출처라 서버가 다시 계산할 원본이 없기 때문이다.
// 확인할 것은 "누가 하느냐" 하나뿐이고 그건 RLS 정책이 한다
// (events_insert_admin / events_update_admin — 20260806150000_admin_role.sql).
//
// 그래서 관리자가 아닌 사람이 이 함수를 불러도 서버가 거절한다. 화면을 감추는 건 편의일 뿐이다.

// 화면이 채워 보내는 값. 관람 일정과 종류(공연/전시)는 여기서 정해진다.
export type AdminEventInput = {
  title: string;
  genre: Genre;
  venueName: string;
  price: number;
  showAt: Date;
  // 값이 있으면 전시(기간형), null이면 공연(회차형).
  // 이 한 칸이 앱 전체의 분기를 만든다 — 회차를 쓸지, 관람일을 고르게 할지, 정원이 있는지.
  showEndAt: Date | null;
  description: string | null;
};

function toRow(input: AdminEventInput) {
  return {
    title: input.title.trim(),
    genre: input.genre,
    venue_name: input.venueName.trim(),
    price: input.price,
    show_at: input.showAt.toISOString(),
    show_end_at: input.showEndAt ? input.showEndAt.toISOString() : null,
    // 빈 소개글은 빈 문자열이 아니라 null로 저장한다. 화면이 "준비 중"으로 대체하는 기준이
    // null이라, 빈 문자열을 넣으면 아무것도 없는 칸이 소개글인 척하게 된다.
    description: input.description && input.description.trim().length > 0
      ? input.description.trim()
      : null,
  };
}

// 새 공연을 만든다. 만들어진 id를 돌려준다 — 포스터를 올릴 때 경로에 필요하다.
//
// 새로 만든 공연은 곧바로 예매 탭에 뜨지 않는다(회차형이면 회차가 아직 없어서다).
// 관리자 목록에서 '회차 없음' 뱃지로 그 상태를 알려주고, 회차 화면(admin-schedules)에서 채운다.
export async function createAdminEvent(input: AdminEventInput): Promise<string> {
  const { data, error } = await supabase.from('events').insert(toRow(input)).select('id').single();
  if (error) {
    throw error;
  }
  return data.id as string;
}

export async function updateAdminEvent(id: string, input: AdminEventInput): Promise<void> {
  const { error } = await supabase.from('events').update(toRow(input)).eq('id', id);
  if (error) {
    throw error;
  }
}

// 카탈로그에서 내리거나 다시 올린다.
//
// 삭제가 아니라 숨김인 이유: 예매가 달린 공연이 사라지면 예매 상세와 여권 스탬프가 가리킬 곳을
// 잃는다. DB도 같은 이유로 삭제를 막아 뒀다(정책도 권한도 주지 않았다).
export async function setEventHidden(id: string, isHidden: boolean): Promise<void> {
  const { error } = await supabase.from('events').update({ is_hidden: isHidden }).eq('id', id);
  if (error) {
    throw error;
  }
}

// ── 포스터 (Supabase Storage) ─────────────────────────────
//
// 구조는 프로필 사진(data/profile.ts)과 같다. 다른 것은 경로 규칙과 누가 쓸 수 있는가 둘뿐이다.

const POSTER_BUCKET = 'posters';

// base64 글자를 실제 바이트로 바꾼다. (data/profile.ts와 같은 이유 — 라이브러리를 더 넣지 않는다)
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 포스터를 올리고 events.poster_url에 주소를 적은 뒤 최종 주소를 돌려준다.
//
// 경로는 공연마다 하나로 고정한다({event_id}/poster.jpg). 바꿀 때마다 새 파일을 만들면
// 지난 이미지가 쌓이므로 같은 자리에 덮어쓴다(upsert).
// 대신 주소가 늘 같아서 캐시에 남은 옛 이미지가 보일 수 있어 끝에 시각(?v=...)을 붙인다.
export async function uploadPoster(
  eventId: string,
  base64: string,
  contentType: string
): Promise<string> {
  const path = `${eventId}/poster.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, base64ToBytes(base64), { contentType, upsert: true });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(POSTER_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('events')
    .update({ poster_url: publicUrl })
    .eq('id', eventId);
  if (updateError) {
    throw updateError;
  }

  return publicUrl;
}

// 포스터를 내린다. 파일과 events.poster_url을 함께 비운다.
// 공연 자체는 지울 수 없지만 포스터는 지울 수 있다 — 잘못 올린 이미지를 내리는 건 흔한 일이고,
// 지워도 카탈로그는 카테고리 색 박스로 대체해서 계속 보인다.
export async function removePoster(eventId: string): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(POSTER_BUCKET)
    .remove([`${eventId}/poster.jpg`]);
  if (removeError) {
    throw removeError;
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({ poster_url: null })
    .eq('id', eventId);
  if (updateError) {
    throw updateError;
  }
}

// ── 회차 (event_schedules) ────────────────────────────────
//
// 회차는 공연(회차형)에만 있다. 전시(기간형)는 회차 행이 아예 없고, 그 없음이 곧 기간형의
// 정의다(20260729031500_event_schedules.sql). 그래서 아래 함수들은 공연에서만 쓴다.
//
// 여기가 3단계까지 비어 있던 구멍이다. 공연을 등록해도 회차가 없으면 create_booking이
// '관람 회차를 선택해주세요'로 끊어서 예매 탭에 아예 뜨지 않는데, 그때까지 회차를 만들 방법이
// 앱에 없었다(SQL Editor에서 직접 넣는 수밖에). 관리자 목록의 '회차 없음' 뱃지가 가리키던 곳이다.

export type AdminScheduleItem = {
  id: string;
  startsAt: Date;
  capacity: number;
  soldCount: number; // 이 회차로 팔린 매수 (취소분 제외). 트리거가 유지한다
};

// 이 공연의 회차를 이른 순으로. (event_schedules_event_idx가 이 순서로 만들어져 있다)
export async function fetchAdminSchedules(eventId: string): Promise<AdminScheduleItem[]> {
  const { data, error } = await supabase
    .from('event_schedules')
    .select('id, starts_at, capacity, sold_count')
    .eq('event_id', eventId)
    .order('starts_at', { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    startsAt: new Date(row.starts_at as string),
    capacity: row.capacity as number,
    soldCount: row.sold_count as number,
  }));
}

// 화면이 채워 보내는 회차 값. 정원은 회차마다 따로다 —
// 같은 뮤지컬이라도 8/14 저녁과 8/15 낮은 좌석이 별개라서다(20260729062524_schedule_capacity.sql).
export type AdminScheduleInput = {
  startsAt: Date;
  capacity: number;
};

// sold_count는 여기서 건드리지 않는다. 그 값은 예매가 생기고 취소될 때마다 트리거가 처음부터
// 다시 세어 채운다. 관리자가 손으로 적으면 실제 판매량과 어긋나고, 어긋난 값은 잔여석으로
// 그대로 보인다.
export async function createAdminSchedule(
  eventId: string,
  input: AdminScheduleInput
): Promise<void> {
  const { error } = await supabase.from('event_schedules').insert({
    event_id: eventId,
    starts_at: input.startsAt.toISOString(),
    capacity: input.capacity,
  });
  if (error) {
    throw error;
  }
}

export async function updateAdminSchedule(id: string, input: AdminScheduleInput): Promise<void> {
  const { error } = await supabase
    .from('event_schedules')
    .update({ starts_at: input.startsAt.toISOString(), capacity: input.capacity })
    .eq('id', id);
  if (error) {
    throw error;
  }
}

// 예매가 달린 회차는 지울 수 없다는 표시.
//
// 공연과 달리 회차는 삭제를 열어 뒀다 — 잘못 만든 회차를 없애는 일은 실제로 필요하다.
// 다만 이미 판 표가 있으면 DB가 거절한다(bookings.schedule_id가 on delete restrict).
// 여기서 중요한 건 **취소된 예매도 행은 그대로 남는다**는 점이다. 그래서 화면에 '판매 0'으로
// 보이는 회차도 삭제가 막힐 수 있고, 이유를 말해주지 않으면 앱이 고장 난 것처럼 보인다.
// 그 경우만 따로 구분해 던진다.
export const SCHEDULE_IN_USE = 'SCHEDULE_IN_USE';

export async function deleteAdminSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('event_schedules').delete().eq('id', id);
  if (error) {
    // 23503 = 외래키 위반. 이 표를 가리키는 bookings 행이 남아 있다는 뜻이다.
    throw new Error(error.code === '23503' ? SCHEDULE_IN_USE : error.message);
  }
}

// 화면이 들고 있는 입력 글자 그대로. 검사와 변환을 한곳에서 한다.
export type AdminScheduleDraft = {
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM'
  capacity: string;
};

// 저장 전에 값을 검사한다. 순수 함수라 화면 없이 테스트할 수 있다(data/__tests__/admin.test.ts).
//
// siblings에는 같은 공연의 회차를 전부 넘긴다(편집 중인 자기 자신 포함 — 아래에서 걸러낸다).
// editing은 편집 중인 회차, 새로 추가하는 중이면 null이다.
export function validateScheduleDraft(
  draft: AdminScheduleDraft,
  siblings: AdminScheduleItem[],
  editing: AdminScheduleItem | null
): { input: AdminScheduleInput } | { error: string } {
  const startsAt = parseDateKey(draft.date, draft.time);
  if (!startsAt) {
    return { error: '날짜와 시각을 2026-08-14 / 19:30 형식으로 입력해주세요.' };
  }

  if (draft.capacity.trim().length === 0) {
    return { error: '정원을 입력해주세요.' };
  }
  const capacity = Number(draft.capacity);
  if (!Number.isInteger(capacity) || capacity < 0) {
    return { error: '정원은 0 이상의 숫자로 입력해주세요.' };
  }

  // 이미 판 매수보다 정원을 낮추면 그 회차는 정원을 넘긴 상태가 된다. DB는 이걸 막지 않는다
  // (check 제약이 capacity >= 0만 본다). 넘긴 채로 두면 예매를 취소해도 한동안 자리가 안 열리고,
  // 화면에는 잔여석이 음수로 나온다.
  if (editing && capacity < editing.soldCount) {
    return { error: `이미 ${editing.soldCount}매가 팔렸어요. 정원을 그보다 줄일 수는 없어요.` };
  }

  // 같은 시각 회차가 둘이면 예매 화면에 똑같이 생긴 줄이 두 개 뜬다. 고르는 사람은 둘이 뭐가
  // 다른지 알 수 없고, 좌석은 따로 세어진다. DB에 이걸 막는 제약이 없어서 여기서 본다
  // (대부분 저장을 두 번 눌렀거나 날짜만 고치고 시각을 안 고친 경우다).
  const duplicated = siblings.some(
    (s) => s.id !== editing?.id && s.startsAt.getTime() === startsAt.getTime()
  );
  if (duplicated) {
    return { error: '같은 시각의 회차가 이미 있어요.' };
  }

  return { input: { startsAt, capacity } };
}
