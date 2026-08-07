-- 회차 유무가 종류를 정한다 — 전시도 시간을 지정해 팔 수 있게
--
-- 지금까지의 규칙:
--   show_end_at is null  → 공연(회차형): 회차 중에서 고른다, 회차마다 정원이 있다
--   show_end_at is not null → 전시(기간형): 기간 안에서 날짜를 고른다, 정원이 없다
--
-- 이 규칙의 문제:
--   "전시는 회차를 가질 수 없다"가 구조에 박혀 있다. 그런데 시간지정 입장 전시(30분 단위로
--   인원을 끊어 받는 방식)는 현실에 흔하다. 지금 구조에서는 그런 전시를 등록할 방법이 없다.
--
--   더 나쁜 건 관리 화면에서 회차를 만들 수 있다는 점이다. 종료일이 있는 공연에 회차를 넣어도
--   이 함수가 회차를 아예 보지 않아서, 회차는 만들어지는데 예매에는 아무 영향이 없다.
--   화면에 보이는 것과 실제로 팔리는 방식이 어긋난다.
--
-- 바뀐 규칙 — 무엇으로 파는지는 **회차가 있는가**가 정한다:
--   회차가 하나라도 있으면        → 회차형. 회차를 골라 산다(정원 있음)
--   회차가 없고 종료일이 있으면   → 기간형. 기간 안의 날짜를 골라 산다(정원 없음)
--   둘 다 없으면                  → 아직 팔 수 없다
--
-- 이렇게 하면 관리자가 "회차 추가"를 누르는 행위 자체가 파는 방식을 정한다. 종료일과 장르를
-- 맞춰 두는 규칙을 따로 배울 필요가 없고, 회차를 전부 지우면 다시 기간형으로 돌아간다.
--
-- 이미 있는 데이터는 그대로 동작한다. 시드 50건은 회차가 있는 40건이 전부 종료일이 없고,
-- 종료일이 있는 전시 10건은 회차가 하나도 없어서, 새 규칙에서도 같은 쪽으로 갈린다.
--
-- 이미 팔린 예매도 영향을 받지 않는다. 예매·보딩패스·스탬프는 전부 bookings.watched_at 하나만
-- 보고 도는데, 그 값은 예매 시점에 이미 찍혀서 저장돼 있기 때문이다.

create or replace function public.create_booking(
  p_event_id uuid,
  p_quantity integer,
  p_coupon_id uuid default null,
  p_schedule_id uuid default null,
  p_visit_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  c_max_quantity constant integer := 4;
  c_exhibition_hour constant time := time '18:00';

  v_user_id uuid := auth.uid();
  v_event events%rowtype;
  v_schedule event_schedules%rowtype;
  v_has_schedules boolean;
  v_sold integer;
  v_watched_at timestamptz;
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

  -- 여기가 이 마이그레이션의 핵심이다. show_end_at이 아니라 회차 유무로 가른다.
  select exists (select 1 from event_schedules where event_id = p_event_id) into v_has_schedules;

  if v_has_schedules then
    -- ── 회차형: 고른 회차가 이 공연 것인지 확인하고, 그 시각을 관람 시각으로 쓴다 ──
    if p_schedule_id is null then
      raise exception '관람 회차를 선택해주세요.' using errcode = '22023';
    end if;

    -- 이 회차 행을 잠근 채로 읽는다. 이 트랜잭션이 끝날 때까지 같은 회차를 사려는 다른 요청은 기다린다.
    select * into v_schedule
    from event_schedules
    where id = p_schedule_id and event_id = p_event_id
    for update;

    if not found then
      raise exception '선택한 회차를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    -- 잔여석 판단은 sold_count(표시용 캐시)를 믿지 않고 여기서 직접 센다.
    select coalesce(sum(quantity), 0) into v_sold
    from bookings
    where schedule_id = p_schedule_id and is_cancelled = false;

    if v_sold + p_quantity > v_schedule.capacity then
      if v_schedule.capacity - v_sold <= 0 then
        raise exception '매진된 회차입니다.' using errcode = '22023';
      end if;
      raise exception '남은 좌석이 %석뿐이에요.', v_schedule.capacity - v_sold using errcode = '22023';
    end if;

    v_watched_at := v_schedule.starts_at;

  elsif v_event.show_end_at is not null then
    -- ── 기간형: 고른 날짜가 기간 안인지 확인하고, 그날 18시를 관람 시각으로 쓴다 ──
    -- 정해진 시각이 없어서 "그날 관람을 마치는 시각"을 관람 시각으로 삼는다. 이렇게 해야
    -- 오늘 예매해도 그날 하루는 보딩패스로 남았다가, 저녁에 스탬프로 넘어간다.
    if p_visit_date is null then
      raise exception '관람일을 선택해주세요.' using errcode = '22023';
    end if;

    if p_visit_date < (v_event.show_at at time zone c_tz)::date
       or p_visit_date > (v_event.show_end_at at time zone c_tz)::date then
      raise exception '전시 기간 안의 날짜를 선택해주세요.' using errcode = '22023';
    end if;

    v_watched_at := ((p_visit_date::timestamp + c_exhibition_hour) at time zone c_tz);

  else
    -- ── 회차도 기간도 없다: 아직 파는 방식이 정해지지 않았다 ──
    -- 이전 버전에서는 이 경우가 회차형으로 흘러가 '관람 회차를 선택해주세요.'로 끊겼다.
    -- 고를 회차가 아예 없는데 고르라고 하는 셈이라, 무엇이 빠졌는지 말해주는 쪽으로 바꾼다.
    raise exception '아직 예매할 수 없는 공연입니다.' using errcode = '22023';
  end if;

  -- 회차형·기간형 공통: 관람 시각이 이미 지났으면 예매할 수 없다.
  if v_watched_at <= now() then
    raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
  end if;

  -- 쿠폰을 쓴다면: 본인 소유 + '사용가능'일 때만. 할인율도 쿠폰 행에서 읽는다(클라이언트 값 안 믿음).
  if p_coupon_id is not null then
    update coupons
    set status = '사용완료'
    where id = p_coupon_id
      and user_id = v_user_id
      and status = '사용가능'
      and expires_at > now() -- 유효기간이 지난 쿠폰은 쓸 수 없다
    returning discount_rate into v_discount_rate;

    if not found then
      raise exception '사용할 수 없는 쿠폰입니다. (사용 완료됐거나 기간이 지났어요)' using errcode = '22023';
    end if;
  end if;

  -- 금액: 예매 시점의 events.price를 스냅샷으로 저장한다(나중에 가격이 바뀌어도 영수증은 그대로).
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

grant execute on function public.create_booking(uuid, integer, uuid, uuid, date) to authenticated;
