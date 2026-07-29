-- 관람일 선택 — 공연은 "회차 중 고르기", 전시는 "기간 안에서 날짜 고르기"
--
-- 왜 필요한가 (이전 상태의 문제):
--   전시(기간형)는 관람일을 고르는 화면이 없어서 pickWatchedAt()이 "무조건 내일"을 썼다.
--   그래서 어떤 전시를 예매해도 관람일이 전부 똑같은 날짜(내일)로 찍혔다.
--   공연(회차형)은 events 1건에 시각이 하나뿐이라, 애초에 "회차"라는 개념이 없었다.
--
-- 이 마이그레이션이 하는 일:
--   1) event_schedules 테이블을 만들어 공연 1건이 여러 회차(날짜+시각)를 갖게 한다.
--   2) 기존 공연 40건에 회차를 만들어 넣는다(일주일치 저녁 공연 + 낮 공연 2회).
--   3) bookings가 "어느 회차를 샀는지"(schedule_id)를 기억하게 한다.
--   4) create_booking()이 회차/날짜를 입력으로 받고, 그 값이 올바른지 서버에서 검증한다.
--
-- 전시에 회차를 만들지 않는 이유: 전시는 정해진 시각이 없고 기간 중 아무 날이나 가면 되므로,
-- 회차 목록 대신 "기간 안의 날짜"를 그대로 고르게 한다(event_schedules에 행이 없다 = 기간형).

-- ── event_schedules (공연 회차) ───────────────────────────
create table if not exists event_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  starts_at timestamptz not null, -- 이 회차의 시작 일시
  created_at timestamptz not null default now()
);

-- "이 공연의 회차를 이른 순으로" 가 가장 흔한 조회라 두 칸을 묶어 인덱스를 만든다.
create index if not exists event_schedules_event_idx on event_schedules (event_id, starts_at);

-- 회차는 예매 카탈로그의 일부라 events와 똑같이 누구나(비로그인 포함) 조회 가능하게 한다.
alter table event_schedules enable row level security;
drop policy if exists "event_schedules_select_all" on event_schedules;
create policy "event_schedules_select_all" on event_schedules for select using (true);

-- ── 기존 공연 40건에 회차 채우기 ──────────────────────────
-- 이미 회차가 있으면 다시 만들지 않는다(마이그레이션을 두 번 돌려도 안전하게).
--
-- 규칙: 첫 공연일(events.show_at)부터 7일간 매일 같은 시각에 1회차씩,
--       거기에 3일째·6일째 낮 공연(14:00, 서울 기준)을 하나씩 더 → 공연당 9회차.
-- (시드의 공연 시각은 전부 저녁 17:00~20:00라 낮 공연과 겹치지 않는다)
insert into event_schedules (event_id, starts_at)
select e.id, e.show_at + (n || ' days')::interval
from events e
cross join generate_series(0, 6) as n
where e.show_end_at is null
  and not exists (select 1 from event_schedules s where s.event_id = e.id);

insert into event_schedules (event_id, starts_at)
select
  e.id,
  ((((e.show_at at time zone 'Asia/Seoul')::date + n)::timestamp + time '14:00') at time zone 'Asia/Seoul')
from events e
cross join unnest(array[2, 5]) as n
where e.show_end_at is null
  -- 위에서 방금 만든 저녁 회차만 있고 낮 회차는 아직 없는 공연에만 붙인다
  and not exists (
    select 1 from event_schedules s
    where s.event_id = e.id
      and (s.starts_at at time zone 'Asia/Seoul')::time = time '14:00'
  );

-- ── bookings: 어느 회차를 샀는지 ──────────────────────────
-- 전시(기간형)는 회차가 없으므로 null이다. watched_at은 그대로 유지한다 —
-- 예매·보딩패스·스탬프 계산이 전부 watched_at 하나만 보고 돌아가는 구조라 건드리지 않는다
-- (schedule_id는 "무엇을 골랐는지"를 남기는 기록이고, 시각의 기준은 여전히 watched_at이다).
alter table bookings add column if not exists schedule_id uuid references event_schedules (id) on delete restrict;

-- ── create_booking() 다시 만들기 ──────────────────────────
-- 인자가 바뀌므로(회차/날짜 추가) 이전 버전을 먼저 지운다. 안 지우면 이름이 같은 함수가
-- 둘 다 남아서(오버로드) 어느 쪽이 불릴지 헷갈린다.
drop function if exists public.create_booking(uuid, integer, uuid);

-- 클라이언트는 "무엇을·몇 매·어떤 쿠폰으로·언제(회차 또는 날짜)"를 넘긴다.
-- 관람 시각·금액은 여전히 서버가 계산하고, 넘어온 회차/날짜가 정말 그 공연 것인지도 서버가 확인한다.
create or replace function public.create_booking(
  p_event_id uuid,
  p_quantity integer,
  p_coupon_id uuid default null,
  p_schedule_id uuid default null, -- 회차형(공연): 고른 회차
  p_visit_date date default null   -- 기간형(전시): 고른 관람 날짜
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_tz constant text := 'Asia/Seoul';
  c_max_quantity constant integer := 4;
  -- 전시는 정해진 시각이 없어서 "그날 관람을 마치는 시각"을 관람 시각으로 삼는다.
  -- 이렇게 해야 오늘 예매해도 그날 하루는 보딩패스로 남았다가, 저녁에 스탬프로 넘어간다.
  c_exhibition_hour constant time := time '18:00';

  v_user_id uuid := auth.uid();
  v_event events%rowtype;
  v_schedule event_schedules%rowtype;
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
    -- ── 회차형(공연): 고른 회차가 이 공연 것인지 확인하고, 그 시각을 관람 시각으로 쓴다 ──
    if p_schedule_id is null then
      raise exception '관람 회차를 선택해주세요.' using errcode = '22023';
    end if;

    select * into v_schedule
    from event_schedules
    where id = p_schedule_id and event_id = p_event_id;

    if not found then
      raise exception '선택한 회차를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;

    v_watched_at := v_schedule.starts_at;
  else
    -- ── 기간형(전시): 고른 날짜가 전시 기간 안인지 확인하고, 그날 18시를 관람 시각으로 쓴다 ──
    if p_visit_date is null then
      raise exception '관람일을 선택해주세요.' using errcode = '22023';
    end if;

    if p_visit_date < (v_event.show_at at time zone c_tz)::date
       or p_visit_date > (v_event.show_end_at at time zone c_tz)::date then
      raise exception '전시 기간 안의 날짜를 선택해주세요.' using errcode = '22023';
    end if;

    v_watched_at := ((p_visit_date::timestamp + c_exhibition_hour) at time zone c_tz);
  end if;

  -- 회차형·기간형 공통: 관람 시각이 이미 지났으면 예매할 수 없다.
  -- (지난 회차 선택, 오늘 저녁 6시가 지난 뒤의 "오늘" 전시 예매가 여기서 걸린다)
  if v_watched_at <= now() then
    raise exception '이미 지난 일정은 예매할 수 없습니다.' using errcode = '22023';
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
