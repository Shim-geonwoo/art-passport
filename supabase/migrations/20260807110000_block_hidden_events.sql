-- 내린 공연은 서버도 팔지 않는다
--
-- is_hidden은 지금까지 **화면에서만** 걸러졌다. data/events.ts의 fetchEvents가
-- `.eq('is_hidden', false)`로 빼기 때문에 목록·상세에는 안 뜬다.
--
-- 그런데 events의 select 정책은 누구나 열려 있고, create_booking은 이 칸을 보지 않았다.
-- 그래서 id를 아는 사람은 그대로 결제까지 갈 수 있었다 — 상세 화면을 열어둔 채로 관리자가
-- 공연을 내린 경우가 실제로 일어나는 시나리오다.
--
-- 이건 이 프로젝트가 세운 원칙과 어긋난다: 화면에서 감추는 건 편의일 뿐이고 최종 차단은 서버가
-- 한다(README 설계 노트 2). 관리자가 "내리기"를 눌렀으면 새 예매는 서버에서 끊겨야 한다.
--
-- **취소는 막지 않는다.** cancel_booking은 건드리지 않는다 — 내린 공연이라도 이미 표를 산
-- 사람은 취소할 수 있어야 한다. 내리기는 "앞으로 팔지 않겠다"는 뜻이지 "이미 판 것을 없던
-- 일로 하겠다"는 뜻이 아니다. 같은 이유로 이미 판 표의 보딩패스와 스탬프도 그대로 남는다.
--
-- 검사 자리는 events를 읽은 직후, 회차형/기간형으로 갈라지기 전이다. 어느 쪽이든 똑같이
-- 막혀야 하고, 갈라진 뒤에 두면 두 곳에 같은 검사를 적게 된다.

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

  -- 내린 공연은 여기서 끊는다. 화면 목록에서 빠지는 것과 별개로 서버가 직접 막는다.
  if v_event.is_hidden then
    raise exception '지금은 예매할 수 없는 공연입니다.' using errcode = '22023';
  end if;

  -- 파는 방식은 회차 유무가 정한다 (20260807103000_schedules_decide_type.sql)
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
    raise exception '아직 예매할 수 없는 공연입니다.' using errcode = '22023';
  end if;

  -- 회차형·기간형 공통: 관람 시각이 이미 지났으면 예매할 수 없다.
  if v_watched_at <= now() then
    raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
  end if;

  -- 쿠폰을 쓴다면: 본인 소유 + '사용가능' + 기간이 안 지났을 때만.
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
