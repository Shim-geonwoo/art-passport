-- 관리자 권한 테스트 — 누가 무엇을 쓸 수 있는가
--
-- 다른 테스트 파일들과 결정적으로 다른 점이 하나 있다: **역할(role)을 실제로 바꿔야 한다.**
--
-- pgTAP은 기본적으로 postgres(수퍼유저)로 도는데, 수퍼유저는 RLS를 통째로 우회한다.
-- 그 상태로 insert가 되는지 확인하면 "정책이 없어도 통과"해서 아무것도 검증하지 못한다.
-- 그래서 아래에서는 set local role authenticated로 앱과 같은 자격으로 내려간 뒤 확인한다.
--
-- RLS가 거부하는 방식이 동작마다 다르다는 점도 중요하다:
--   insert  -> 예외 (42501). 새 행이 정책을 어겼다고 알린다
--   update  -> 예외 없이 0건. 바꿀 수 있는 행이 하나도 안 보이는 것뿐이다
--   delete  -> 예외 없이 0건. 같은 이유
--   select  -> 0건
-- 그래서 update/delete는 "안 바뀌었는지"로 확인한다.
--
-- 아래 throws_ok는 오류 코드뿐 아니라 **메시지까지 확인한다.** 이유가 있다:
-- 권한 부족(permission denied)과 정책 차단(row-level security)이 오류 코드가 42501로 같아서,
-- 코드만 보면 둘을 구분할 수 없다. 실제로 이 테스트를 처음 돌렸을 때 events에 authenticated의
-- insert 권한이 없어서 "정책이 막았다"고 착각하며 통과했다(정작 관리자도 못 쓰는 상태였다).
-- 메시지를 함께 보면 "무엇이 막았는지"까지 고정된다.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

-- ── 픽스처 (여기까지는 postgres 자격) ─────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'normal@test.local', 'x',
   now(), now(), now(), '{"nickname":"일반사용자"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'admin@test.local', 'x',
   now(), now(), now(), '{"nickname":"관리자"}');

-- 이미 있는 공연 하나 (수정·삭제 시도 대상)
insert into events (id, title, genre, show_at, show_end_at, price, venue_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '기존 공연', '뮤지컬',
        now() + interval '10 days', null, 50000, '테스트 극장');

-- ── 1~2. 표 권한이 실제로 열려 있는가 ─────────────────────
--
-- 정책보다 먼저 통과해야 하는 문이라 여기서 못박아 둔다. 이걸 테스트로 두는 이유는,
-- 권한이 없을 때 나는 오류가 정책이 막을 때와 코드가 같아서(42501) 조용히 오해하기 쉽기 때문이다.
-- 실패하면 pgTAP이 "무엇이 빠졌는지(missing)"를 그대로 찍어준다.
select table_privs_are(
  'public', 'events', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE'],
  'authenticated는 events에 조회·등록·수정 권한이 있다 (삭제는 없다)'
);

select table_privs_are(
  'public', 'event_schedules', 'authenticated',
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  'authenticated는 event_schedules에 삭제까지 권한이 있다'
);

-- ── 3. is_hidden 기본값 ───────────────────────────────────
select is(
  (select is_hidden from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false,
  '새로 만든 공연은 기본적으로 숨김이 아니다'
);

-- ══════════════════════════════════════════════════════════
--  여기서부터 일반 사용자(관리자 아님) 자격
-- ══════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── 2. 관리자가 아니면 is_admin()이 false ─────────────────
select is(
  public.is_admin(),
  false,
  '관리자 표에 없으면 is_admin()이 false다'
);

-- ── 3. 관리자 표는 읽을 수도 없다 ─────────────────────────
-- 정책 이전에 권한(GRANT)부터 회수해 뒀다. 두 겹 중 바깥쪽이 여기서 걸린다.
select throws_ok(
  $$ select count(*) from admins $$,
  '42501'::char(5),
  'permission denied for table admins',
  '일반 사용자는 관리자 표를 읽을 수 없다 (권한 자체가 없다)'
);

-- ── 4. 자기를 관리자로 만들 수 없다 (가장 중요) ───────────
-- users에 is_admin 칸을 두지 않은 이유가 바로 이것이다. 프로필은 본인이 수정할 수 있으므로
-- 거기 권한 표시가 있으면 누구나 스스로 승격할 수 있다.
select throws_ok(
  $$ insert into admins (user_id) values ('11111111-1111-1111-1111-111111111111') $$,
  '42501'::char(5),
  'permission denied for table admins',
  '일반 사용자는 자기를 관리자로 만들 수 없다'
);

-- ── 5~7. 일반 사용자는 카탈로그를 못 건드린다 ─────────────
select throws_ok(
  $$ insert into events (title, genre, show_at, price, venue_name)
     values ('몰래 넣은 공연', '연극', now() + interval '5 days', 1000, '아무데나') $$,
  '42501'::char(5),
  'new row violates row-level security policy for table "events"',
  '일반 사용자는 공연을 등록할 수 없다 (권한은 있고 정책이 막는다)'
);

-- update는 예외가 아니라 0건으로 막힌다 — 값이 그대로인지로 확인한다
update events set price = 1 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select price from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  50000,
  '일반 사용자가 가격을 바꾸려 해도 바뀌지 않는다'
);

select throws_ok(
  $$ insert into event_schedules (event_id, starts_at, capacity)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '10 days', 100) $$,
  '42501'::char(5),
  'new row violates row-level security policy for table "event_schedules"',
  '일반 사용자는 회차를 만들 수 없다 (권한은 있고 정책이 막는다)'
);

-- ── 8. 조회는 여전히 누구나 가능하다 ──────────────────────
-- 쓰기를 막으면서 읽기까지 막히면 예매 카탈로그가 통째로 안 보인다.
select is(
  (select count(*)::integer from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  '쓰기를 막아도 카탈로그 조회는 그대로 열려 있다'
);

-- ══════════════════════════════════════════════════════════
--  관리자로 승격 (postgres로 돌아가서 — 앱에서는 SQL로 하는 그 작업이다)
-- ══════════════════════════════════════════════════════════
reset role;
insert into admins (user_id) values ('22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- ── 9. 이제 is_admin()이 true ─────────────────────────────
select is(
  public.is_admin(),
  true,
  '관리자 표에 있으면 is_admin()이 true다'
);

-- ── 10~12. 관리자는 카탈로그를 쓸 수 있다 ─────────────────
select lives_ok(
  $$ insert into events (id, title, genre, show_at, price, venue_name)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '관리자가 등록한 공연', '연극',
             now() + interval '5 days', 30000, '대학로 극장') $$,
  '관리자는 공연을 등록할 수 있다'
);

update events set price = 55000, description = '소개글을 채웠다'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select price from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  55000,
  '관리자는 공연을 수정할 수 있다'
);

select lives_ok(
  $$ insert into event_schedules (event_id, starts_at, capacity)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() + interval '5 days', 200) $$,
  '관리자는 회차를 만들 수 있다'
);

-- ── 13. 관리자도 공연을 지울 수는 없다 ────────────────────
-- delete 정책을 일부러 안 만들었다. 예매가 달린 공연이 사라지면 예매 상세와 스탬프가
-- 가리킬 곳을 잃기 때문에, 내리는 건 삭제가 아니라 is_hidden으로 한다.
delete from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*)::integer from events where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  '관리자여도 공연은 삭제되지 않는다 (내릴 때는 is_hidden을 쓴다)'
);

-- ── 14. 관리자 권한이 남의 예매까지 열어주지는 않는다 ─────
-- 관리자는 "카탈로그를 관리하는 사람"이지 "모든 걸 보는 사람"이 아니다.
-- bookings/coupons의 RLS는 본인 것만 보이게 그대로 둔다.
reset role;
insert into bookings (user_id, event_id, schedule_id, watched_at, quantity,
                      original_price, total_price)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        null, now() + interval '10 days', 1, 50000, 50000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::integer from bookings),
  0,
  '관리자여도 남의 예매는 보이지 않는다 (권한이 카탈로그 밖으로 번지지 않는다)'
);

reset role;

select * from finish();

rollback;
