-- cancel_booking() 테스트 — 예매 취소와 쿠폰 반환
--
-- 확인하는 것 세 가지:
--   1) 관람 전 예매만 취소된다 (이미 시작한 공연은 취소할 수 없다)
--   2) 취소하면 그때 썼던 쿠폰이 '사용가능'으로 돌아온다 — 예매 취소와 한 함수에서 함께 일어나서,
--      "예매는 취소됐는데 쿠폰은 안 돌아온" 어긋난 상태가 생기지 않는다
--   3) 남의 예매는 id를 알아도 취소할 수 없다
--
-- 3번이 특히 중요하다. 취소는 본인 확인 없이 id만으로 부를 수 있는 모양이라, 함수 안에서
-- user_id를 확인하지 않으면 남의 티켓을 마음대로 취소할 수 있게 된다.

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

insert into event_schedules (id, event_id, starts_at, capacity, sold_count)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        now() + interval '10 days', 100, 0);

insert into coupons (id, user_id, benefit, discount_rate, status, issued_at_stamp_order)
values ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
        '다음 예매 10% 할인', 10, '사용가능', 9);

create temporary table made (label text primary key, booking_id uuid);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── 1~3. 쿠폰을 쓴 예매를 취소하면 쿠폰이 돌아온다 ────────
insert into made
select 'with_coupon', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1,
                                     'f1111111-1111-1111-1111-111111111111'::uuid,
                                     'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

select is(
  (select status from coupons where id = 'f1111111-1111-1111-1111-111111111111'),
  '사용완료',
  '예매할 때 쿠폰이 사용완료가 된다 (취소 전 상태 확인)'
);

select cancel_booking((select booking_id from made where label = 'with_coupon'));

select is(
  (select is_cancelled from bookings where id = (select booking_id from made where label = 'with_coupon')),
  true,
  '관람 전 예매는 취소된다'
);

select is(
  (select status from coupons where id = 'f1111111-1111-1111-1111-111111111111'),
  '사용가능',
  '취소하면 그때 썼던 쿠폰이 사용가능으로 돌아온다'
);

-- ── 4. 이미 취소한 예매를 또 취소해도 쿠폰이 두 번 돌아오지 않는다 ──
-- 함수는 is_cancelled = false인 행만 바꾸므로 두 번째 호출은 아무 일도 안 한다.
-- (여기가 뚫리면 취소를 반복해서 쿠폰을 계속 되살릴 수 있다)
update coupons set status = '사용완료' where id = 'f1111111-1111-1111-1111-111111111111';
select cancel_booking((select booking_id from made where label = 'with_coupon'));

select is(
  (select status from coupons where id = 'f1111111-1111-1111-1111-111111111111'),
  '사용완료',
  '이미 취소한 예매를 다시 취소해도 쿠폰을 또 되살리지 않는다'
);

-- ── 5~6. 남의 예매는 취소할 수 없다 ───────────────────────
insert into made
select 'a_ticket', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null,
                                  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

-- 테스터B로 바꿔서 테스터A의 예매를 취소해본다.
-- 함수는 조건에 안 맞으면 예외 없이 조용히 아무 것도 안 바꾼다 — 그래서 "안 바뀌었는지"로 확인한다.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select cancel_booking((select booking_id from made where label = 'a_ticket'));

select is(
  (select is_cancelled from bookings where id = (select booking_id from made where label = 'a_ticket')),
  false,
  '남의 예매는 id를 알아도 취소되지 않는다'
);

select is(
  (select sold_count from event_schedules where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  '실패한 취소는 잔여석도 건드리지 않는다'
);

-- ── 7~9. 이미 시작한 공연은 취소할 수 없다 ────────────────
-- create_booking으로는 과거 회차를 만들 수 없으므로(그게 막혀 있는 게 맞다),
-- 관람 시각이 지난 예매는 직접 넣어서 상황을 만든다.
--
-- 이게 중요한 이유: 스탬프는 관람일이 지난 예매를 센 것이고, 스탬프 9개마다 쿠폰이 나온다.
-- 지난 예매를 취소할 수 있으면 "쿠폰을 받은 뒤 예매를 취소해 스탬프만 되돌리는" 일이 가능해진다.
insert into bookings (id, user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price)
values ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,
        now() - interval '3 days', 1, 50000, 50000);

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select cancel_booking('99999999-9999-9999-9999-999999999999'::uuid);

select is(
  (select is_cancelled from bookings where id = '99999999-9999-9999-9999-999999999999'),
  false,
  '관람 시각이 지난 예매(스탬프)는 취소되지 않는다'
);

-- 공연이 이미 시작했지만 아직 그날인 경우 — 스탬프는 내일 찍히지만 취소는 지금부터 안 된다.
-- (스탬프 기준은 "관람일 다음 날", 취소 기준은 "공연 시작 시각"으로 서로 다르다)
insert into bookings (id, user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price)
values ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,
        now() - interval '1 hour', 1, 50000, 50000);

select cancel_booking('88888888-8888-8888-8888-888888888888'::uuid);

select is(
  (select is_cancelled from bookings where id = '88888888-8888-8888-8888-888888888888'),
  false,
  '이미 시작한 공연은 그날 안이어도 취소되지 않는다'
);

-- 반대로 아직 시작 전이면 취소된다 (위 두 경우와 갈리는 지점이 시작 시각임을 확인)
insert into bookings (id, user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price)
values ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null,
        now() + interval '1 hour', 1, 50000, 50000);

select cancel_booking('77777777-7777-7777-7777-777777777777'::uuid);

select is(
  (select is_cancelled from bookings where id = '77777777-7777-7777-7777-777777777777'),
  true,
  '시작 한 시간 전이면 아직 취소할 수 있다'
);

-- ── 10~11. 오픈 데이트 티켓(기간형)의 취소 ────────────────
--
-- 기간형은 관람 시각이 비어 있다. 이전 조건(watched_at > now())만 있으면 null 비교가 참이 되지
-- 않아서, 산 직후부터 취소가 막혔다. 기준은 "이미 관람했는가"여야 한다.
insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('cccccccc-1111-1111-1111-cccccccccccc', '취소 테스트 전시', '전시',
        now() - interval '1 day', now() + interval '30 days', 20000, '테스트 미술관');

insert into made
select 'openDate', create_booking('cccccccc-1111-1111-1111-cccccccccccc'::uuid, 1, null, null);

select cancel_booking((select booking_id from made where label = 'openDate'));

select is(
  (select is_cancelled from bookings where id = (select booking_id from made where label = 'openDate')),
  true,
  '아직 안 쓴 기간형 티켓은 취소할 수 있다'
);

-- 다녀온 표는 못 무른다. 티켓을 쓰면 watched_at이 채워져 회차형과 같은 규칙으로 넘어간다.
insert into made
select 'usedTicket', create_booking('cccccccc-1111-1111-1111-cccccccccccc'::uuid, 1, null, null);
select mark_ticket_used((select booking_id from made where label = 'usedTicket'));
select cancel_booking((select booking_id from made where label = 'usedTicket'));

select is(
  (select is_cancelled from bookings where id = (select booking_id from made where label = 'usedTicket')),
  false,
  '이미 쓴 티켓은 취소되지 않는다'
);

select * from finish();

rollback;
