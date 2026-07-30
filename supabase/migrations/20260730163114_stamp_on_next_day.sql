-- 스탬프 기준을 "관람 시각이 지나면"에서 "관람일이 지나면"으로 바꾼다
--
-- 바뀐 규칙: 관람일이 7/29면 7/30이 되는 순간 스탬프가 된다.
-- (예전에는 7/29 19:30 공연이 19:31에 곧바로 스탬프가 됐다)
--
-- 왜 바꾸나: 우리는 공연이 몇 시에 끝나는지 모른다. 저장하는 건 시작 시각(watched_at)뿐이라
-- 19:30 공연이 21시에 끝날지 23시에 끝날지 알 수 없는데, 시작 시각을 기준으로 삼으면
-- 아직 공연을 보고 있는 중에 티켓이 지갑에서 사라지고 스탬프가 찍힌다.
-- "그날이 지나면"으로 잡으면 그런 일이 없고, "어제 본 공연"이라는 감각과도 맞는다.
--
-- 이 함수는 클라이언트의 파생 규칙(data/bookings.ts의 stampTimeFor)과 반드시 같아야 한다.
-- 어긋나면 "여권엔 스탬프 9개가 찍혔는데 쿠폰은 안 나오는" 상태가 생긴다.
--
-- 날짜 경계는 서울 시간으로 센다. create_booking()이 관람일을 정할 때 쓰는 기준과 같다
-- (c_tz := 'Asia/Seoul') — 두 함수가 다른 시간대를 보면 "예매는 되는데 스탬프는 안 찍히는"
-- 하루짜리 어긋남이 생긴다.

create or replace function public.issue_due_coupons()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';

  v_user_id uuid := auth.uid();
  v_stamp_count integer;
begin
  if v_user_id is null then
    return;
  end if;

  -- 스탬프 = 취소 안 했고, 관람일이 오늘보다 이전인 예매.
  --   관람일 7/29, 오늘 7/30 -> 7/29 < 7/30 -> 스탬프 O
  --   관람일 7/29, 오늘 7/29 (공연이 끝난 밤이어도) -> 7/29 < 7/29 -> 스탬프 X
  select count(*) into v_stamp_count
  from bookings
  where user_id = v_user_id
    and is_cancelled = false
    and (watched_at at time zone c_tz)::date < (now() at time zone c_tz)::date;

  -- 스탬프 9개마다 한 장. 받을 자격이 있는 순번을 전부 넣어보고, 이미 있는 것은 조용히 버린다.
  -- (user_id, issued_at_stamp_order) 유니크 인덱스가 중복을 막아준다.
  insert into coupons (user_id, benefit, discount_rate, status, issued_at_stamp_order)
  select v_user_id, '다음 예매 10% 할인', 10, '사용가능', milestone * 9
  from generate_series(1, v_stamp_count / 9) as milestone
  on conflict (user_id, issued_at_stamp_order) do nothing;
end;
$$;

grant execute on function public.issue_due_coupons() to authenticated;

-- 참고: cancel_booking()은 그대로 둔다.
-- 취소 가능 여부의 기준은 여전히 "공연 시작 시각"(watched_at > now())이다 — 스탬프가 내일
-- 찍힌다고 해서 이미 시작한 공연을 취소할 수 있어야 하는 건 아니다.
-- 화면도 여기 맞춰 status가 아니라 별도 값(canCancel)으로 버튼을 띄우도록 고쳤다.
