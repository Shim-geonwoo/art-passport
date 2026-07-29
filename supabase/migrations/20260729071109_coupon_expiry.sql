-- 쿠폰 유효기간 — '만료'를 저장하지 않고 계산한다
--
-- 이전 상태의 문제: coupons.status에 '만료'라는 값이 정의만 되어 있고, 유효기간 칸도
-- 만료시키는 로직도 없었다. 리워드함에는 '만료' 필터 탭이 이미 그려져 있어서 영원히 0건이었다.
--
-- 어떻게 푸는가: 만료는 "언제까지인가"와 "지금이 언제인가"만 있으면 계산할 수 있다.
-- bookings가 is_cancelled 하나만 저장하고 예매완료/관람완료를 watched_at으로 계산하는 것과 같은 꼴이다.
--   저장하는 것: 썼는가(status), 언제까지인가(expires_at)
--   계산하는 것: 사용완료 / 만료 / 사용가능
-- 이렇게 하면 "만료 처리 크론"이 필요 없다 — 시각이 지나면 그 순간부터 만료로 보인다.

-- 유효기간은 발급일로부터 90일. 앞으로 발급되는 쿠폰은 이 기본값이 자동으로 붙으므로
-- issue_due_coupons()는 고칠 필요가 없다.
alter table coupons
  add column if not exists expires_at timestamptz not null default (now() + interval '90 days');

-- 이미 있던 쿠폰에도 같은 규칙으로 유효기간을 매긴다(발급일 + 90일).
-- 오래전에 받은 쿠폰이라면 이 시점에 이미 만료로 계산되는데, 그게 의도한 결과다.
update coupons
set expires_at = issued_at + interval '90 days'
where expires_at is null or expires_at = issued_at;

-- ── status에서 '만료'를 뺀다 ──────────────────────────────
-- 이제 status가 저장하는 것은 "썼는가" 하나뿐이다. 만료 여부는 expires_at으로 계산한다.
-- (지금까지 '만료'를 쓴 코드는 없었지만, 혹시 그런 행이 있다면 '사용가능'으로 되돌린다 —
--  안 쓴 쿠폰이라는 뜻이고, 만료됐는지는 expires_at이 알아서 판단해준다)
update coupons set status = '사용가능' where status = '만료';

alter table coupons drop constraint if exists coupons_status_check;
alter table coupons add constraint coupons_status_check
  check (status in ('사용가능', '사용완료'));

-- ── create_booking(): 만료된 쿠폰은 못 쓰게 ───────────────
-- 화면에서도 만료된 쿠폰은 고를 수 없지만, 결제 화면을 열어둔 사이에 유효기간이 지날 수 있다.
-- 달라진 곳은 쿠폰을 '사용완료'로 바꾸는 update의 조건 한 줄(expires_at > now())뿐이다.
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

  if v_event.show_end_at is null then
    -- ── 회차형(공연) ──────────────────────────────────────
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

    v_watched_at := v_schedule.starts_at;
  else
    -- ── 기간형(전시): 정원 없음(무제한) ───────────────────
    if p_visit_date is null then
      raise exception '관람일을 선택해주세요.' using errcode = '22023';
    end if;

    if p_visit_date < (v_event.show_at at time zone c_tz)::date
       or p_visit_date > (v_event.show_end_at at time zone c_tz)::date then
      raise exception '전시 기간 안의 날짜를 선택해주세요.' using errcode = '22023';
    end if;

    v_watched_at := ((p_visit_date::timestamp + c_exhibition_hour) at time zone c_tz);
  end if;

  if v_watched_at <= now() then
    raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
  end if;

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
