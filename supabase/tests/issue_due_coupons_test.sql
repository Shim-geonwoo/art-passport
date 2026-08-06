-- issue_due_coupons() 테스트 — 스탬프 9개마다 쿠폰 1장
--
-- 이 함수는 앱이 예매 목록을 새로 받을 때(BookingsProvider.refresh)마다 호출된다.
-- 크론이 없는 대신 "앱을 열 때마다 받을 게 있으면 받는" 구조라, 같은 사람이 짧은 시간에
-- 여러 번 부르는 게 정상 동작이다. 그래서 **몇 번을 불러도 한 장만 나와야 한다.**
--
-- 스탬프 기준은 "관람일이 지났는가"(관람 시각이 아니라 날짜)이고, 서울 시간으로 센다.
-- 이 규칙은 클라이언트(data/bookings.ts의 stampTimeFor)와 반드시 같아야 한다 —
-- 어긋나면 "여권엔 스탬프 9개가 찍혔는데 쿠폰은 안 나오는" 상태가 된다.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

-- ── 픽스처 ────────────────────────────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'a@test.local', 'x',
   now(), now(), now(), '{"nickname":"테스터A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'b@test.local', 'x',
   now(), now(), now(), '{"nickname":"테스터B"}');

insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '테스트 뮤지컬', '뮤지컬',
        now() + interval '10 days', null, 50000, '테스트 극장');

-- 관람일이 "어제"인 예매를 n개 만들어주는 도우미 (= 스탬프 n개).
--
-- 시각을 now()에서 빼지 않고 서울 날짜로 직접 계산한다. now() - interval '1 day' 방식은
-- CI가 자정 근처에 돌 때 날짜가 흔들려서, 같은 테스트가 어떤 날은 통과하고 어떤 날은 실패한다.
create or replace function make_stamps(p_user uuid, p_count integer)
returns void language sql as $$
  insert into bookings (user_id, event_id, schedule_id, watched_at, quantity,
                        original_price, total_price)
  select p_user, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,
         (((now() at time zone 'Asia/Seoul')::date - 1)::timestamp + time '19:00')
           at time zone 'Asia/Seoul',
         1, 50000, 50000
  from generate_series(1, p_count);
$$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── 1. 스탬프 8개로는 쿠폰이 안 나온다 ────────────────────
select make_stamps('11111111-1111-1111-1111-111111111111'::uuid, 8);
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  '스탬프 8개로는 아직 쿠폰이 안 나온다'
);

-- ── 2~3. 9개를 채우면 1장 ─────────────────────────────────
select make_stamps('11111111-1111-1111-1111-111111111111'::uuid, 1);
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  '스탬프 9개를 채우면 쿠폰 1장이 나온다'
);

select is(
  (select issued_at_stamp_order from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  9,
  '몇 번째 스탬프에서 나온 쿠폰인지가 기록된다'
);

-- ── 4. 여러 번 불러도 한 장뿐이다 ─────────────────────────
-- 앱은 목록을 새로 받을 때마다 이 함수를 부른다. 세는 것과 넣는 것 사이에 틈이 있으면
-- 두 번 불렸을 때 두 장이 나온다. (user_id, issued_at_stamp_order) 유니크 제약이 이걸 막는다.
select issue_due_coupons();
select issue_due_coupons();
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  '여러 번 불러도 같은 구간의 쿠폰이 중복 발급되지 않는다'
);

-- ── 5~6. 18개를 채우면 2장 ────────────────────────────────
select make_stamps('11111111-1111-1111-1111-111111111111'::uuid, 9);
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  '스탬프 18개면 쿠폰이 2장이다'
);

select results_eq(
  $$ select issued_at_stamp_order from coupons
     where user_id = '11111111-1111-1111-1111-111111111111' order by issued_at_stamp_order $$,
  $$ values (9), (18) $$,
  '두 장은 각각 9번째와 18번째 스탬프에서 나온 것으로 기록된다'
);

-- ── 7. 관람일이 오늘이면 아직 스탬프가 아니다 ─────────────
-- 공연이 오전에 끝났어도 그날 안에는 지갑에 남아 있고 스탬프도 아니다.
-- 여기서 8개를 더 넣어도(총 26개 중 스탬프는 18개 그대로) 쿠폰 수가 늘면 안 된다.
insert into bookings (user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price)
select '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       null,
       -- 오늘(서울) 오전 9시. 공연이 이미 끝났어도 그날 안에는 스탬프가 아니어야 한다.
       (((now() at time zone 'Asia/Seoul')::date)::timestamp + time '09:00') at time zone 'Asia/Seoul',
       1, 50000, 50000
from generate_series(1, 8);

select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  '관람일이 오늘인 예매는 아직 스탬프가 아니라서 쿠폰이 안 늘어난다'
);

-- ── 8. 취소한 예매는 스탬프로 세지 않는다 ─────────────────
insert into bookings (user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price, is_cancelled)
select '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       null,
       (((now() at time zone 'Asia/Seoul')::date - 1)::timestamp + time '19:00') at time zone 'Asia/Seoul',
       1, 50000, 50000, true
from generate_series(1, 9);

select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  '취소한 예매는 관람일이 지나도 스탬프로 세지 않는다'
);

-- ── 9~10. 남의 스탬프는 내 것이 아니다 ────────────────────
select make_stamps('22222222-2222-2222-2222-222222222222'::uuid, 9);
select issue_due_coupons(); -- 여전히 테스터A로 로그인한 상태

select is(
  (select count(*)::integer from coupons where user_id = '11111111-1111-1111-1111-111111111111'),
  2,
  '남이 스탬프를 채워도 내 쿠폰은 안 늘어난다'
);

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  '테스터B는 자기 스탬프 9개로 자기 쿠폰 1장을 받는다'
);

-- ── 11. 로그인하지 않으면 아무 일도 하지 않는다 ───────────
-- 예외를 던지지 않고 조용히 돌아간다(로그아웃 직후 호출될 수 있어서다).
set local request.jwt.claims = '';
select issue_due_coupons();

select is(
  (select count(*)::integer from coupons),
  3,
  '로그인하지 않은 호출은 쿠폰을 만들지 않는다'
);

select * from finish();

rollback;
