-- 정원(재고) — 회차마다 좌석 수를 두고, 남은 자리보다 많이 팔지 않는다
--
-- 왜 event_schedules에 다는가:
--   전시(기간형)는 회차 행 자체가 없고 공연(회차형)만 회차를 갖는다. 그래서 정원을 회차에 달면
--   "전시는 무제한"이 자동으로 따라온다 — is_unlimited 같은 플래그가 따로 필요 없다.
--   또 같은 뮤지컬이라도 8/14 저녁과 8/15 낮은 좌석이 별개라, 정원은 공연이 아니라 회차 단위가 맞다.
--
-- 왜 sold_count를 저장하는가 (이 프로젝트는 보통 상태를 저장하지 않고 파생하는데):
--   잔여석 = 정원 - 팔린 수 인데, 클라이언트는 RLS 때문에 '남의 예매'를 볼 수 없어서 이걸
--   계산할 방법이 없다. 서버에 매번 물어보는 방법도 있지만, 지금 카탈로그를 불러올 때 회차도
--   함께 받아오므로(fetchEvents의 조인) 칸으로 두면 추가 왕복 없이 잔여석이 따라온다.
--   대신 어긋나지 않도록, 아래 트리거는 값을 더하고 빼지 않고 매번 처음부터 다시 센다.

alter table event_schedules
  add column if not exists capacity integer not null default 100 check (capacity >= 0),
  -- 표시용으로 유지되는 값. 판매 가능 여부의 최종 판단은 create_booking이 직접 세어서 한다.
  add column if not exists sold_count integer not null default 0 check (sold_count >= 0);

-- ── 기존 회차에 장르별 정원 넣기 ──────────────────────────
-- 공연장 규모에 맞춘 대략적인 값. (기본값 100으로 이미 채워진 것을 실제 값으로 덮어쓴다)
update event_schedules s
set capacity = case e.genre
  when '콘서트' then 3000
  when '클래식·무용' then 2000
  when '뮤지컬' then 1200
  when '연극' then 400
  else 100
end
from events e
where e.id = s.event_id;

-- 데모용: 각 공연의 마지막 회차만 2석으로 둔다.
-- "폐막 회차는 거의 다 나갔다"는 설정이면서, 테스트 예매 한 번으로 매진 화면을 볼 수 있게 하려는 것.
-- (정원이 수백~수천이면 혼자 예매해서는 매진 상태를 영영 못 본다)
update event_schedules
set capacity = 2
where id in (
  select distinct on (event_id) id
  from event_schedules
  order by event_id, starts_at desc
);

-- ── sold_count를 유지하는 트리거 ──────────────────────────
-- 예매 생성(insert) / 취소(update) / 회원 탈퇴로 인한 삭제(delete) 모두에서 다시 센다.
-- 값을 증감시키지 않고 매번 새로 세기 때문에, 증감 로직 버그로 숫자가 어긋날 여지가 없다.
-- (회차 하나당 예매는 많아야 수백 건이라 다시 세는 비용이 문제되지 않는다)
create or replace function public.sync_schedule_sold_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_schedule_id uuid;
  v_new_schedule_id uuid;
begin
  -- OLD는 INSERT에 없고 NEW는 DELETE에 없으므로, 있을 때만 꺼낸다.
  if tg_op <> 'INSERT' then
    v_old_schedule_id := old.schedule_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_schedule_id := new.schedule_id;
  end if;

  update event_schedules s
  set sold_count = coalesce(
    (
      select sum(b.quantity)
      from bookings b
      where b.schedule_id = s.id and b.is_cancelled = false
    ),
    0
  )
  where s.id = v_old_schedule_id or s.id = v_new_schedule_id;

  return null; -- AFTER 트리거라 반환값은 쓰이지 않는다
end;
$$;

drop trigger if exists bookings_sync_sold_count on bookings;
create trigger bookings_sync_sold_count
  after insert or update or delete on bookings
  for each row execute function public.sync_schedule_sold_count();

-- 이미 있는 예매를 반영해 초기값을 채운다 (트리거는 앞으로의 변경만 잡으므로)
update event_schedules s
set sold_count = coalesce(
  (
    select sum(b.quantity)
    from bookings b
    where b.schedule_id = s.id and b.is_cancelled = false
  ),
  0
);

-- ── create_booking(): 남은 자리 확인 추가 ─────────────────
-- 달라진 곳은 회차형(공연) 분기 하나다. 회차 행을 잠그고(for update) 지금까지 팔린 수를 직접 센 뒤,
-- 요청한 매수가 들어갈 자리가 있을 때만 예매를 만든다.
-- 잠그는 이유: 마지막 한 자리를 두 사람이 동시에 사면 둘 다 "자리 있음"으로 읽고 둘 다 팔린다.
-- 행을 잠그면 한 명이 끝날 때까지 다른 한 명이 기다리므로 정원을 넘길 수 없다.
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
  else
    -- ── 기간형(전시): 정원 없음(무제한). 기간 안의 날짜인지만 본다 ──
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
    returning discount_rate into v_discount_rate;

    if not found then
      raise exception '사용할 수 없는 쿠폰입니다.' using errcode = '22023';
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
