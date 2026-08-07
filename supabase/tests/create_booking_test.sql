-- create_booking() 테스트 — 예매 생성
--
-- 이 함수는 앱에서 돈과 권한이 걸린 유일한 쓰기 경로다. README "설계 노트 2"가 말하는
-- "믿으면 안 되는 값은 서버가 다시 계산한다"가 실제로 지켜지는지를 여기서 확인한다.
--
-- 특히 두 가지가 중요하다:
--   1) 클라이언트는 금액과 관람 시각을 정할 수 없다 (서버가 events에서 다시 읽어 계산한다).
--      이게 뚫리면 watched_at을 과거로 적어 스탬프를 즉시 만들 수 있고, 스탬프 9개 = 쿠폰이라
--      곧 할인 발급 권한이 된다.
--   2) 정원을 넘겨 팔지 않는다 (회차 행을 잠그고 직접 세어 확인한다).
--
-- 실행: supabase test db  (로컬 DB 필요 — CI에서 자동으로 돈다)

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- ── 픽스처 ────────────────────────────────────────────────
-- auth.users에 넣으면 handle_new_user 트리거가 public.users 프로필을 자동으로 만들어준다.
-- (그 트리거가 도는 것 자체도 여기서 함께 확인되는 셈이다)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'a@test.local', 'x',
   now(), now(), now(), '{"nickname":"테스터A"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'b@test.local', 'x',
   now(), now(), now(), '{"nickname":"테스터B"}');

-- 공연(회차형): show_end_at이 null이면 회차형이다
insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '테스트 뮤지컬', '뮤지컬',
        now() + interval '10 days', null, 50000, '테스트 극장');

-- 전시(기간형): show_end_at이 있으면 기간형이고 회차를 만들지 않는다(= 정원 무제한)
insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '테스트 전시', '전시',
        now() - interval '1 day', now() + interval '30 days', 20000, '테스트 미술관');

-- 회차 3개: 넉넉한 것 / 2석짜리(매진 테스트용) / 이미 지난 것
insert into event_schedules (id, event_id, starts_at, capacity, sold_count)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() + interval '10 days', 100, 0),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() + interval '11 days', 2, 0),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '1 day', 100, 0);

-- 테스터A의 쿠폰 1장, 테스터B의 쿠폰 1장
insert into coupons (id, user_id, benefit, discount_rate, status, issued_at_stamp_order)
values
  ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '다음 예매 10% 할인', 10, '사용가능', 9),
  ('f2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '다음 예매 10% 할인', 10, '사용가능', 9);

-- 만들어진 예매 id를 이름표로 들고 있기 위한 임시 표 (트랜잭션이 끝나면 사라진다)
create temporary table made (label text primary key, booking_id uuid);

-- ── 1. 로그인하지 않으면 아무것도 못 한다 ─────────────────
-- auth.uid()가 null인 상태. 클라이언트 키만 알아낸 사람이 그냥 호출하는 상황이다.
set local request.jwt.claims = '';

select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  '42501'::char(5),
  '로그인이 필요합니다.',
  '로그인하지 않으면 예매를 만들 수 없다'
);

-- 여기서부터는 테스터A로 로그인한 상태
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── 2~4. 입력값 검증 ──────────────────────────────────────
select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 0, null,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  '22023'::char(5),
  '인원은 1~4매까지 선택할 수 있습니다.',
  '0매는 예매할 수 없다'
);

select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 5, null,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  '22023'::char(5),
  '인원은 1~4매까지 선택할 수 있습니다.',
  '상한(4매)을 넘겨 예매할 수 없다'
);

select throws_ok(
  $$ select create_booking('99999999-9999-9999-9999-999999999999'::uuid, 1, null,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  'P0002'::char(5),
  '공연 정보를 찾을 수 없습니다.',
  '없는 공연은 예매할 수 없다'
);

-- ── 5. 공연인데 회차를 안 골랐다 ──────────────────────────
select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null, null, null) $$,
  '22023'::char(5),
  '관람 회차를 선택해주세요.',
  '공연은 회차를 골라야 예매할 수 있다'
);

-- ── 6. 이미 지난 회차 ─────────────────────────────────────
-- 여기가 뚫리면 "과거 관람"을 만들어 스탬프를 즉시 찍을 수 있다(= 쿠폰 발급 권한).
select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null,
                           'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, null) $$,
  '22023'::char(5),
  '이미 지난 일정은 예매할 수 없습니다.',
  '지난 회차로 예매해서 스탬프를 즉시 만들 수 없다'
);

-- ── 7~8. 정상 예매: 금액을 서버가 계산한다 ────────────────
-- 클라이언트는 금액을 아예 보내지 않는다. events.price x 매수가 그대로 찍혀야 한다.
insert into made
select 'plain', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 2, null,
                               'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null);

select is(
  (select original_price from bookings where id = (select booking_id from made where label = 'plain')),
  100000,
  '원가는 서버가 events.price x 매수로 계산한다 (50000 x 2)'
);

select is(
  (select total_price from bookings where id = (select booking_id from made where label = 'plain')),
  100000,
  '쿠폰을 안 썼으면 결제금액은 원가와 같다'
);

-- ── 9~10. 쿠폰: 할인율도 서버가 쿠폰 행에서 읽는다 ────────
insert into made
select 'coupon', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1,
                                'f1111111-1111-1111-1111-111111111111'::uuid,
                                'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null);

select is(
  (select total_price from bookings where id = (select booking_id from made where label = 'coupon')),
  45000,
  '쿠폰을 쓰면 쿠폰 행의 할인율(10%)만큼 깎인다 (50000 -> 45000)'
);

-- 쿠폰 사용 처리가 예매와 같은 트랜잭션에서 함께 일어나는지.
-- 어긋나면 "할인만 받고 쿠폰은 그대로 남는" 상태가 된다.
select is(
  (select status from coupons where id = 'f1111111-1111-1111-1111-111111111111'),
  '사용완료',
  '쿠폰은 예매와 한 트랜잭션에서 사용완료로 바뀐다'
);

-- ── 11~12. 쿠폰 오용 막기 ─────────────────────────────────
select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1,
                           'f1111111-1111-1111-1111-111111111111'::uuid,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  '22023'::char(5),
  '사용할 수 없는 쿠폰입니다. (사용 완료됐거나 기간이 지났어요)',
  '이미 쓴 쿠폰은 다시 쓸 수 없다'
);

-- 남의 쿠폰 id를 알아내도 쓸 수 없어야 한다 (함수가 user_id까지 확인한다)
select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1,
                           'f2222222-2222-2222-2222-222222222222'::uuid,
                           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, null) $$,
  '22023'::char(5),
  '사용할 수 없는 쿠폰입니다. (사용 완료됐거나 기간이 지났어요)',
  '남의 쿠폰은 id를 알아도 쓸 수 없다'
);

-- 위 시도가 실패했으니 테스터B의 쿠폰은 그대로 남아 있어야 한다
select is(
  (select status from coupons where id = 'f2222222-2222-2222-2222-222222222222'),
  '사용가능',
  '실패한 시도가 남의 쿠폰을 태우지 않는다'
);

-- ── 13~15. 정원(재고) ─────────────────────────────────────
-- 2석짜리 회차를 2매로 정확히 채운다
insert into made
select 'sellout', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 2, null,
                                 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, null);

select is(
  (select sold_count from event_schedules where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  2,
  '예매하면 트리거가 잔여석(sold_count)을 다시 센다'
);

select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null,
                           'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, null) $$,
  '22023'::char(5),
  '매진된 회차입니다.',
  '정원을 다 팔면 한 장도 더 팔지 않는다'
);

-- 취소하면 그 자리는 다시 팔 수 있어야 한다 (트리거가 다시 세므로 어긋나지 않는다)
select cancel_booking((select booking_id from made where label = 'sellout'));

select is(
  (select sold_count from event_schedules where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  0,
  '취소하면 잔여석이 되돌아온다'
);

-- ── 16. 남은 자리보다 많이 요구하면 몇 석 남았는지 알려준다 ──
insert into made
select 'one', create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, null,
                             'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, null);

select throws_ok(
  $$ select create_booking('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 2, null,
                           'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, null) $$,
  '22023'::char(5),
  '남은 좌석이 1석뿐이에요.',
  '남은 자리보다 많이 요구하면 몇 석 남았는지 알려준다'
);

-- ── 17~18. 전시(기간형) ───────────────────────────────────
select throws_ok(
  $$ select create_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, null, null, null) $$,
  '22023'::char(5),
  '관람일을 선택해주세요.',
  '전시는 관람일을 골라야 예매할 수 있다'
);

select throws_ok(
  $$ select create_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, null, null,
                           (now() + interval '100 days')::date) $$,
  '22023'::char(5),
  '전시 기간 안의 날짜를 선택해주세요.',
  '전시 기간 밖의 날짜는 고를 수 없다'
);

-- ── 19. 회차도 종료일도 없으면 팔 방법이 없다 ─────────────
-- 새로 등록만 하고 회차를 안 만든 공연이 이 상태다. 이전에는 회차형으로 흘러가
-- '관람 회차를 선택해주세요.'로 끊겼는데, 고를 회차가 아예 없어서 말이 안 되는 안내였다.
insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '회차 없는 공연', '연극',
        now() + interval '10 days', null, 30000, '테스트 소극장');

select throws_ok(
  $$ select create_booking('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 1, null, null, null) $$,
  '22023'::char(5),
  '아직 예매할 수 없는 공연입니다.',
  '회차도 종료일도 없으면 무엇을 골라도 예매할 수 없다'
);

-- ── 20~21. 회차가 생기면 전시도 회차형이 된다 ─────────────
-- 여기가 이 규칙의 핵심이다. 위 17~18에서 기간형으로 동작하던 바로 그 전시에 회차를 붙이면,
-- 같은 공연이 회차를 골라야 하는 쪽으로 바뀐다(시간지정 입장 전시).
-- 종료일은 그대로 있지만 더 이상 판단에 쓰이지 않는다.
insert into event_schedules (id, event_id, starts_at, capacity, sold_count)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        now() + interval '5 days', 10, 0);

select throws_ok(
  $$ select create_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, null, null,
                           (now() + interval '3 days')::date) $$,
  '22023'::char(5),
  '관람 회차를 선택해주세요.',
  '회차가 생긴 전시는 기간 안의 날짜만으로는 예매할 수 없다'
);

-- 회차로 사면 관람 시각이 그 회차 시각이 된다(기간형의 "그날 18시"가 아니라).
select is(
  (
    with created as (
      select create_booking('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, null,
                            'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, null) as id
    )
    select date_trunc('minute', b.watched_at)
    from created c
    join bookings b on b.id = c.id
  ),
  (select date_trunc('minute', starts_at) from event_schedules
   where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  '회차로 산 전시는 관람 시각이 그 회차 시각이 된다'
);

select * from finish();

rollback;
