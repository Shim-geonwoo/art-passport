-- 기간형은 오픈 데이트로 팔고, 티켓을 써야 관람이 된다
--
-- 지금까지 기간형(회차 없음 + 종료일 있음)은 달력에서 관람일을 **골라야** 살 수 있었다.
-- 그런데 실제 전시 티켓 상당수는 "기간 내 1회 입장"이라 날짜를 지정하지 않는다.
--
-- 게다가 이 구조는 어중간했다. 날짜를 고르게 할 거면 그건 사실상 날짜마다 회차 하나씩과 같아서,
-- 기간형이 회차형의 열화판 노릇을 하고 정작 실제 상품 형태인 "아무 때나"는 표현되지 않았다.
-- 5단계 규칙을 끝까지 밀면 이렇게 갈린다:
--
--   회차 있음         → 회차를 골라 산다. 그 회차 날짜가 지나면 관람한 것이 된다
--   회차 없음 + 종료일 → 그냥 산다. 기간 안에 아무 때나 가서 **티켓을 쓰면** 관람이 된다
--
-- ── watched_at을 비워 둔다 ────────────────────────────────
--
-- 핵심은 "안 갔으면 기록이 남지 않아야 한다"는 것이다. 기간이 끝났다고 자동으로 관람 처리하면
-- 가지도 않은 전시가 여권에 스탬프로 찍힌다. 아카이빙이 이 앱의 핵심인데 그건 거짓 기록이다.
--
-- 그래서 watched_at의 뜻을 "**실제로 관람한 시각. 아직 안 갔으면 비어 있음**"으로 되돌린다.
--   회차형: 예매할 때 회차 시각으로 채운다 (회차 날짜가 지나면 관람한 것으로 본다)
--   기간형: 예매할 때 비워 둔다. 티켓을 쓸 때 그 시각으로 채운다
--
-- 기한은 따로 저장하지 않는다 — events.show_end_at을 읽으면 된다. 예매를 조회할 때 이미 공연을
-- 조인해 오므로 칸을 늘릴 이유가 없고, 관리자가 전시 기간을 늘리면 티켓의 기한도 따라 늘어난다.
--
-- 안 쓰고 기한이 지나면 '만료'다. 스탬프도 안 찍히고 쿠폰도 안 나온다 — 실제 티켓과 같다.

alter table bookings alter column watched_at drop not null;

comment on column bookings.watched_at is
  '실제로 관람한 시각. 회차형은 예매 시 회차 시각으로 채우고, 기간형은 티켓을 쓸 때 채운다. 비어 있으면 아직 안 간 것이다.';

-- ── create_booking: 기간형은 관람 시각을 비워 둔다 ────────
--
-- p_visit_date 인자를 뺀다. 아무도 안 쓰는데 남겨두면 "여기에 날짜를 넣으면 뭔가 달라지나" 하고
-- 읽는 사람이 헷갈린다. 인자가 바뀌므로 이전 버전을 먼저 지운다 — 안 지우면 이름이 같은 함수가
-- 둘 다 남아서(오버로드) 어느 쪽이 불릴지 헷갈린다.
drop function if exists public.create_booking(uuid, integer, uuid, uuid, date);

create or replace function public.create_booking(
  p_event_id uuid,
  p_quantity integer,
  p_coupon_id uuid default null,
  p_schedule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  c_max_quantity constant integer := 4;

  v_user_id uuid := auth.uid();
  v_event events%rowtype;
  v_schedule event_schedules%rowtype;
  v_has_schedules boolean;
  v_sold integer;
  v_watched_at timestamptz; -- 회차형만 채운다. 기간형은 null로 남는다
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

  if v_event.is_hidden then
    raise exception '지금은 예매할 수 없는 공연입니다.' using errcode = '22023';
  end if;

  select exists (select 1 from event_schedules where event_id = p_event_id) into v_has_schedules;

  if v_has_schedules then
    -- ── 회차형: 고른 회차가 이 공연 것인지 확인하고, 그 시각을 관람 시각으로 쓴다 ──
    if p_schedule_id is null then
      raise exception '관람 회차를 선택해주세요.' using errcode = '22023';
    end if;

    select * into v_schedule
    from event_schedules
    where id = p_schedule_id and event_id = p_event_id
    for update;

    if not found then
      raise exception '선택한 회차를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    select coalesce(sum(quantity), 0) into v_sold
    from bookings
    where schedule_id = p_schedule_id and is_cancelled = false;

    if v_sold + p_quantity > v_schedule.capacity then
      if v_schedule.capacity - v_sold <= 0 then
        raise exception '매진된 회차입니다.' using errcode = '22023';
      end if;
      raise exception '남은 좌석이 %석뿐이에요.', v_schedule.capacity - v_sold using errcode = '22023';
    end if;

    if v_schedule.starts_at <= now() then
      raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
    end if;

    v_watched_at := v_schedule.starts_at;

  elsif v_event.show_end_at is not null then
    -- ── 기간형(오픈 데이트): 고를 것이 없다. 관람 시각은 티켓을 쓸 때 채워진다 ──
    -- 기간이 이미 끝났으면 팔지 않는다. 마지막 날 하루는 살 수 있게 날짜로 비교한다
    -- (종료일 시각이 00:00으로 저장돼 있어도 그날 하루는 유효한 티켓이어야 한다).
    if (v_event.show_end_at at time zone c_tz)::date < (now() at time zone c_tz)::date then
      raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
    end if;

    v_watched_at := null;

  else
    raise exception '아직 예매할 수 없는 공연입니다.' using errcode = '22023';
  end if;

  if p_coupon_id is not null then
    update coupons
    set status = '사용완료'
    where id = p_coupon_id
      and user_id = v_user_id
      and status = '사용가능'
      and expires_at > now()
    returning discount_rate into v_discount_rate;

    if not found then
      raise exception '사용할 수 없는 쿠폰입니다. (사용 완료됐거나 기간이 지났어요)' using errcode = '22023';
    end if;
  end if;

  v_original_price := v_event.price * p_quantity;
  v_total_price := v_original_price - round((v_original_price * v_discount_rate)::numeric / 100)::integer;

  insert into bookings (
    user_id, event_id, schedule_id, watched_at, quantity, used_coupon_id, original_price, total_price
  )
  values (
    v_user_id, p_event_id, p_schedule_id, v_watched_at, p_quantity, p_coupon_id, v_original_price, v_total_price
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function public.create_booking(uuid, integer, uuid, uuid) to authenticated;

-- ── mark_ticket_used: 전시장에서 티켓을 쓴다 ─────────────
--
-- 오픈 데이트 티켓을 실제로 쓸 때 부른다. watched_at을 지금으로 채워 "오늘 관람했다"로 기록한다.
-- 검표 기기가 없으니 사용자가 예매 상세에서 직접 누르는 것으로 대신한다.
--
-- **왜 서버 함수인가**: bookings에는 update 정책이 없다(20260729014828에서 지웠다).
-- watched_at을 클라이언트가 정할 수 있으면 과거 시각을 적어 스탬프를 즉시 만들어낼 수 있고,
-- 스탬프 9개 = 쿠폰 1장이라 그건 곧 할인 발급 권한이 된다(README 설계 노트 2).
-- 그래서 시각도 클라이언트가 보내지 않는다 — 서버가 now()를 쓴다.
--
-- 쓴다고 스탬프가 즉시 찍히지는 않는다. 스탬프는 **관람일 다음 날 00:00**에 찍힌다
-- (data/bookings.ts의 stampTimeFor — 공연이 몇 시에 끝나는지 모르니 날짜로 끊는다).
-- 회차형과 같은 규칙이라 여기만 예외를 두지 않는다.
create or replace function public.mark_ticket_used(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  v_user_id uuid := auth.uid();
  v_booking bookings%rowtype;
  v_event events%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  -- 본인 예매만. id를 알아도 남의 티켓은 쓸 수 없다.
  select * into v_booking from bookings where id = p_booking_id and user_id = v_user_id;
  if not found then
    raise exception '예매 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if v_booking.is_cancelled then
    raise exception '취소한 예매는 사용할 수 없습니다.' using errcode = '22023';
  end if;

  -- 이미 쓴 티켓. 두 번 쓰면 관람 시각이 뒤로 밀려 스탬프 날짜가 바뀐다.
  if v_booking.watched_at is not null then
    raise exception '이미 사용한 티켓입니다.' using errcode = '22023';
  end if;

  select * into v_event from events where id = v_booking.event_id;

  -- 아직 시작도 안 한 전시를 "봤다"고 할 수는 없다.
  -- 이걸 막지 않으면 예매 직후 눌러서 스탬프를 만들어낼 수 있다.
  if (v_event.show_at at time zone c_tz)::date > (now() at time zone c_tz)::date then
    raise exception '아직 시작하지 않은 전시입니다.' using errcode = '22023';
  end if;

  -- 기한이 지난 티켓은 못 쓴다. 실제 티켓과 같다 — 안 갔으면 그걸로 끝이다.
  if (v_event.show_end_at at time zone c_tz)::date < (now() at time zone c_tz)::date then
    raise exception '기간이 지난 티켓입니다.' using errcode = '22023';
  end if;

  -- 시각은 서버가 정한다. 클라이언트가 보낸 값을 쓰지 않는 이유는 위 주석 참고.
  update bookings set watched_at = now() where id = p_booking_id;
end;
$$;

grant execute on function public.mark_ticket_used(uuid) to authenticated;

-- ── cancel_booking: 아직 안 쓴 기간형 티켓도 취소할 수 있어야 한다 ──
--
-- 이전 조건은 `watched_at > now()` 하나였다. 기간형은 이제 이 값이 비어 있어서, 그대로 두면
-- 산 직후부터 취소가 막힌다(null 비교는 참이 되지 않는다).
--
-- 갈라지는 기준은 "이미 관람했는가"다:
--   watched_at이 있고 아직 안 지났으면       → 취소 가능 (회차형 관람 전)
--   watched_at이 비어 있고 기한이 안 지났으면 → 취소 가능 (기간형 미사용)
--   그 외(관람했거나 기한이 지났거나)         → 취소 불가
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  v_coupon_id uuid;
begin
  update bookings b
  set is_cancelled = true
  from events e
  where b.id = p_booking_id
    and e.id = b.event_id
    and b.user_id = auth.uid()
    and b.is_cancelled = false
    and (
      -- 회차형: 관람 시각이 아직 안 지났다
      (b.watched_at is not null and b.watched_at > now())
      -- 기간형 미사용: 기한이 아직 안 지났다 (마지막 날 하루는 취소할 수 있게 날짜로 비교)
      or (
        b.watched_at is null
        and e.show_end_at is not null
        and (e.show_end_at at time zone c_tz)::date >= (now() at time zone c_tz)::date
      )
    )
  returning b.used_coupon_id into v_coupon_id;

  -- 취소된 예매가 쿠폰을 썼다면 그 쿠폰을 다시 '사용가능'으로 되돌린다
  if v_coupon_id is not null then
    update coupons
    set status = '사용가능'
    where id = v_coupon_id
      and user_id = auth.uid()
      and status = '사용완료';
  end if;
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;
