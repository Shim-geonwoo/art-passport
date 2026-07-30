-- 뜨거운 경로에 인덱스를 달고, 쿠폰 중복 발급을 DB가 막게 한다
--
-- 두 가지를 고친다. 둘 다 "지금은 안 보이지만 사람이 늘면 드러나는" 문제다.
--   1) 잔여석을 셀 때마다 bookings 전체를 훑고 있었다 (schedule_id 인덱스가 없었다)
--   2) 쿠폰 발급이 동시에 두 번 들어오면 두 장이 나올 수 있었다 (막는 장치가 없었다)

-- ── 1. 잔여석 집계용 인덱스 ───────────────────────────────
--
-- bookings를 schedule_id로 찾는 곳은 딱 두 군데이고, 둘 다 모양이 같다:
--   - create_booking(): 예매 직전 "이 회차가 지금까지 몇 장 팔렸나"
--   - sync_schedule_sold_count() 트리거: 예매/취소 때마다 sold_count 다시 세기
-- 두 쿼리 모두 `where schedule_id = ? and is_cancelled = false`로 걸러 `sum(quantity)`를 낸다.
--
-- 그런데 bookings에 있던 인덱스는 user_id / event_id / watched_at 셋뿐이라, 이 집계는
-- 매번 테이블 전체를 훑고 있었다. 예매가 쌓일수록 느려지는데, 하필 create_booking에서는
-- 이 집계가 회차 행을 `for update`로 잠근 상태에서 돈다 —
-- **여기서 걸리는 시간이 곧 같은 회차를 사려는 다음 사람이 기다리는 시간이 된다.**
--
-- 그래서 위 쿼리 모양에 정확히 맞춘 인덱스를 만든다:
--   - where is_cancelled = false : 취소된 예매는 어차피 안 세므로 인덱스에서 빼둔다(부분 인덱스).
--                                  인덱스가 작아지고, 취소가 늘어도 커지지 않는다.
--   - include (quantity)         : 합계를 낼 때 필요한 값까지 인덱스에 얹어둔다. 그러면 테이블 본문을
--                                  들추지 않고 인덱스만 읽어서 답이 나온다(index-only scan).
create index if not exists bookings_schedule_sold_idx
  on bookings (schedule_id)
  include (quantity)
  where is_cancelled = false;

-- ── 2. 쿠폰 중복 발급 막기 ────────────────────────────────
--
-- issue_due_coupons()는 "스탬프 수 / 9"와 "이미 발급한 수"를 세어 모자란 만큼 발급했다.
-- 세는 것과 넣는 것 사이에 틈이 있어서, 두 요청이 동시에 들어오면 둘 다 "아직 0장 발급"으로
-- 읽고 둘 다 발급해버린다. 앱이 refresh()마다 이 함수를 부르는 구조라 실제로 겹칠 수 있다.
--
-- 세는 로직을 더 정교하게 만드는 대신, **DB가 규칙을 직접 들고 있게** 한다:
-- "한 사람에게 같은 스탬프 순번(9, 18, ...)의 쿠폰은 한 장뿐"이라는 제약을 걸면,
-- 아무리 동시에 들어와도 두 장이 될 수 없다.

-- 제약을 걸기 전에, 혹시 이미 중복으로 나간 쿠폰이 있으면 한 장만 남긴다.
-- (중복이 없으면 아무 것도 안 지운다 — 보통은 여기 걸리는 행이 없다)
--
-- 남길 한 장을 고르는 순서:
--   1순위 이미 쓴 쿠폰. bookings.used_coupon_id가 가리키고 있어서, 지우면 그 예매의 할인 기록이
--        끊긴다(on delete set null → 예매 상세에서 할인율이 0%로 보이게 된다).
--   2순위 먼저 발급된 것. 유효기간(발급일 + 90일)이 이른 쪽을 남겨, 실제보다 오래 쓰게 되지 않도록.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, issued_at_stamp_order
      order by (status = '사용완료') desc, issued_at, id
    ) as rn
  from coupons
  where issued_at_stamp_order is not null
)
delete from coupons
where id in (select id from ranked where rn > 1);

-- issued_at_stamp_order가 null인 쿠폰(스탬프로 나온 게 아닌 쿠폰)은 이 제약에 걸리지 않는다.
-- Postgres는 unique 인덱스에서 null끼리는 서로 다른 값으로 보기 때문이다. 나중에 관리자 모드에서
-- 이벤트 쿠폰을 여러 장 뿌리더라도 여기 막히지 않는다.
create unique index if not exists coupons_user_stamp_order_key
  on coupons (user_id, issued_at_stamp_order);

-- ── issue_due_coupons(): 세지 말고, 다 넣어보고 겹치는 건 버린다 ──
--
-- 위 제약이 생겼으니 함수가 "몇 장 발급했는지"를 셀 이유가 없어졌다.
-- 받을 자격이 있는 순번(9, 18, ...)을 전부 넣어보고, 이미 있는 것은 on conflict로 조용히 버린다.
-- 동시에 두 요청이 같은 순번을 넣으려 하면 한쪽은 다른 쪽이 끝나기를 기다렸다가 버려진다 —
-- 그래서 에러도 안 나고, 두 장도 안 나온다.
--
-- 값을 세어 증감시키는 대신 매번 처음부터 다시 계산하는 방식이라,
-- sync_schedule_sold_count()가 sold_count를 다시 세는 것과 같은 꼴이다.
create or replace function public.issue_due_coupons()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_stamp_count integer;
begin
  if v_user_id is null then
    return;
  end if;

  -- 스탬프 = 취소 안 했고 관람 시각이 지난 예매 (data/bookings.ts의 deriveStamps와 같은 규칙)
  select count(*) into v_stamp_count
  from bookings
  where user_id = v_user_id
    and is_cancelled = false
    and watched_at <= now();

  -- 스탬프 9개마다 한 장. 20개면 milestone이 1, 2 → 9번째와 18번째 쿠폰을 넣어본다.
  -- (9개가 안 되면 generate_series가 빈 결과라 아무 일도 일어나지 않는다)
  insert into coupons (user_id, benefit, discount_rate, status, issued_at_stamp_order)
  select v_user_id, '다음 예매 10% 할인', 10, '사용가능', milestone * 9
  from generate_series(1, v_stamp_count / 9) as milestone
  on conflict (user_id, issued_at_stamp_order) do nothing;
end;
$$;

grant execute on function public.issue_due_coupons() to authenticated;
