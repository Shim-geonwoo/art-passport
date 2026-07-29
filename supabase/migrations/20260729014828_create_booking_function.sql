-- 예매 생성을 서버로 옮기고, 클라이언트의 직접 쓰기를 막는다
--
-- 왜 필요한가 (이전 상태의 문제):
--   1) 결제 화면이 bookings에 직접 insert하면서 watched_at·original_price·total_price를
--      "클라이언트가 계산해서" 보냈다. RLS는 user_id만 확인하므로 가격을 1원으로 적어 보내거나,
--      watched_at을 과거로 적어 보내(=그 즉시 관람완료로 파생) 스탬프를 공짜로 만들 수 있었다.
--   2) bookings_update_own 정책에 with check가 없어, 이미 만든 예매의 watched_at을 과거로
--      고치는 것도 가능했다. 스탬프를 무한히 만들면 쿠폰(9개마다 1장)까지 뽑을 수 있다.
--   3) 예매 insert와 쿠폰 '사용완료' 표시가 따로 호출돼서, 사이에서 실패하면
--      "할인은 받았는데 쿠폰은 그대로 남아있는" 어긋난 상태가 생겼다.
--
-- 해결: 예매 생성을 create_booking() 하나로 묶는다. 관람일·금액은 서버가 events에서 직접
-- 읽어 계산하고, 쿠폰 사용완료까지 같은 트랜잭션에서 처리한다(하나라도 실패하면 전부 취소).
-- 그리고 bookings의 insert/update RLS 정책을 없애서, 쓰기 경로를 이 함수와 cancel_booking()
-- 두 개로만 남긴다. (coupons는 원래부터 select만 열려 있었다)

-- ── 예매 생성 ─────────────────────────────────────────────
-- 클라이언트는 "무엇을(event_id) 몇 매(quantity) 어떤 쿠폰으로(coupon_id)"만 말한다.
-- 관람일과 금액은 클라이언트 말을 믿지 않고 서버가 다시 계산한다.
create or replace function public.create_booking(
  p_event_id uuid,
  p_quantity integer,
  p_coupon_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 앱이 한국 사용자를 대상으로 하므로 "오늘/내일" 같은 날짜 경계는 서울 시간 기준으로 센다.
  -- (기기 시간대를 바꿔서 날짜 경계를 흔들 수 없게, 클라이언트 로컬시간을 쓰지 않는다)
  c_tz constant text := 'Asia/Seoul';
  -- 자유석 인원 상한. 결제 화면의 MAX_QUANTITY와 같은 값이다(데모라 1~4매).
  c_max_quantity constant integer := 4;

  v_user_id uuid := auth.uid();
  v_event events%rowtype;
  v_tomorrow timestamptz;
  v_watched_at timestamptz;
  v_bookable boolean;
  v_discount_rate integer := 0;
  v_original_price integer;
  v_total_price integer;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > c_max_quantity then
    raise exception '인원은 1~%매까지 선택할 수 있습니다.', c_max_quantity using errcode = '22023';
  end if;

  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception '공연 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 지금 예매할 수 있는가 (data/events.ts의 isBookable과 같은 규칙)
  --  - 기간형(전시): 종료일이 아직 안 지났으면(오늘 포함) 가능
  --  - 회차형(공연): 시작 시각이 아직 안 지났으면 가능
  if v_event.show_end_at is not null then
    v_bookable := (v_event.show_end_at at time zone c_tz)::date >= (now() at time zone c_tz)::date;
  else
    v_bookable := v_event.show_at > now();
  end if;

  if not v_bookable then
    raise exception '예매가 마감된 공연입니다.' using errcode = '22023';
  end if;

  -- 이 예매의 실제 관람 시각 (data/events.ts의 pickWatchedAt과 같은 규칙)
  --  - 회차형(공연): 공연 시작 시각 그대로 (하루뿐이라 고를 게 없다)
  --  - 기간형(전시): 날짜 선택 화면이 아직 없어서 "내일"을 기본으로 하되 전시 기간 안으로 맞춘다
  if v_event.show_end_at is null then
    v_watched_at := v_event.show_at;
  else
    v_tomorrow := (((now() at time zone c_tz)::date + 1)::timestamp) at time zone c_tz;
    v_watched_at := least(greatest(v_event.show_at, v_tomorrow), v_event.show_end_at);
  end if;

  -- 쿠폰을 쓴다면: 본인 소유 + '사용가능'일 때만. 할인율도 쿠폰 행에서 읽는다(클라이언트 값 안 믿음).
  -- 여기서 바로 '사용완료'로 바꿔두면, 같은 쿠폰을 두 번 쓰려는 동시 요청 중 하나만 통과한다.
  if p_coupon_id is not null then
    update coupons
    set status = '사용완료'
    where id = p_coupon_id
      and user_id = v_user_id
      and status = '사용가능'
    returning discount_rate into v_discount_rate;

    if not found then
      raise exception '사용할 수 없는 쿠폰입니다.' using errcode = '22023';
    end if;
  end if;

  -- 금액: 예매 시점의 events.price를 스냅샷으로 저장한다(나중에 가격이 바뀌어도 영수증은 그대로).
  v_original_price := v_event.price * p_quantity;
  v_total_price := v_original_price - round((v_original_price * v_discount_rate)::numeric / 100)::integer;

  insert into bookings (
    user_id, event_id, watched_at, quantity, used_coupon_id, original_price, total_price
  )
  values (
    v_user_id, p_event_id, v_watched_at, p_quantity, p_coupon_id, v_original_price, v_total_price
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(uuid, integer, uuid) to authenticated;

-- ── 쓰기 경로 잠그기 ──────────────────────────────────────
-- 예매 생성은 create_booking(), 취소는 cancel_booking()만 쓴다. 두 함수 모두 SECURITY DEFINER라
-- RLS를 우회하므로, 클라이언트용 insert/update 정책은 이제 필요 없다(있으면 구멍만 된다).
drop policy if exists "bookings_insert_own" on bookings;
drop policy if exists "bookings_update_own" on bookings;

-- 참고: 이렇게 update를 막고 나면 "쿠폰을 받은 뒤 예매를 취소해서 스탬프만 되돌리는" 일도
-- 불가능해진다. cancel_booking()은 watched_at이 미래인 예매만 취소하는데, 스탬프는
-- watched_at이 지난 예매라서 서로 겹치지 않는다 → 스탬프 수는 줄어들지 않는다(쿠폰도 안 사라짐).

-- users: update 정책에 with check이 없어서, 수정하면서 id를 남의 것으로 바꿔 쓰는 시도를
-- 막지 못했다. 바꾼 뒤의 행도 여전히 본인 것이어야 한다는 조건을 추가한다.
drop policy if exists "users_update_own" on users;
create policy "users_update_own" on users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 닉네임은 화면에서 공백만 입력하는 걸 막고 있지만(프로필 화면 maxLength=20), DB에서도 지킨다.
-- not valid: 이미 저장된 행은 검사하지 않고, 앞으로의 insert/update부터 적용한다.
-- (제약을 새로 걸면서 기존 데이터 때문에 마이그레이션이 통째로 실패하는 일을 막는다)
alter table users drop constraint if exists users_nickname_not_blank;
alter table users add constraint users_nickname_not_blank
  check (length(btrim(nickname)) between 1 and 20) not valid;

-- 회원가입 트리거도 위 제약에 맞춘다. 가입 화면에서 이미 걸러지지만, 만약 지나치게 긴
-- 닉네임이나 공백만 있는 값이 넘어오더라도 제약에 걸려 "가입 자체가 실패하는" 일은 없어야 한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_nickname text := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
begin
  if v_nickname = '' then
    v_nickname := '사용자';
  end if;

  insert into public.users (id, nickname)
  values (new.id, left(v_nickname, 20));
  return new;
end;
$$;

-- ── use_coupon() 제거 ─────────────────────────────────────
-- 쿠폰 사용완료 처리는 이제 create_booking() 안에서 예매와 함께 일어난다.
-- 이 함수를 남겨두면 "예매도 안 하면서 내 쿠폰을 태우는" 호출이 가능해지므로 지운다.
drop function if exists public.use_coupon(uuid);
