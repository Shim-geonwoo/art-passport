-- 앱이 쓰는 표 권한을 마이그레이션에 명시한다
--
-- 지금까지 이 프로젝트의 마이그레이션에는 테이블 권한(GRANT)이 한 줄도 없었다. RLS 정책만
-- 적어두고, 권한은 Supabase 호스팅 프로젝트가 새 표에 자동으로 붙여주는 기본값에 기대고 있었다.
-- 연결된 프로젝트에서는 잘 돌아가니 문제가 드러나지 않았다.
--
-- 그런데 supabase start로 띄우는 로컬 스택은 그 기본값을 똑같이 주지 않는다. 실제로 확인해 보니
-- authenticated에게 events의 SELECT/INSERT/UPDATE가 아예 없었다(REFERENCES/TRIGGER/TRUNCATE만
-- 있었다). 즉 **마이그레이션만으로는 앱이 도는 DB가 만들어지지 않는다.**
--
-- 이게 왜 문제인가:
--   - 로컬에서 supabase start로 개발하거나 테스트할 수 없다
--   - 새 Supabase 프로젝트에 db push 했을 때 같은 상태가 될지 보장할 수 없다
--   - RLS 테스트가 거짓으로 통과한다. 권한 부족과 정책 차단이 오류 코드가 42501로 같아서,
--     "정책이 막았다"고 읽히지만 실은 권한이 없어서 관리자까지 막혀 있는 상태다
--
-- 그래서 앱이 실제로 필요로 하는 권한을 여기에 적어 둔다. 이미 있는 곳에 다시 줘도 문제없다.
--
-- 권한과 정책의 역할은 다르다는 점을 다시 적어둔다:
--   GRANT  = 이 역할이 이 표에 이 동작을 시도할 수 있는가 (표 단위)
--   POLICY = 그중 어떤 행에 대해 허용되는가 (행 단위)
-- 아래에서 권한을 넉넉히 열어도, 어떤 행이 보이고 바뀌는지는 기존 정책이 그대로 결정한다.

-- ── 예매 카탈로그: 로그인 전에도 보여야 한다 ──────────────
-- (events_select_all / event_schedules_select_all 정책이 using(true)인 것과 짝을 이룬다)
grant select on table events to anon, authenticated;
grant select on table event_schedules to anon, authenticated;

-- ── 내 예매·쿠폰: 조회만 ──────────────────────────────────
-- 쓰기는 서버 함수(create_booking / cancel_booking / issue_due_coupons)로만 한다.
-- 정책도 select만 있으므로 insert/update 권한은 주지 않는다 — 두 문을 다 닫아 둔다.
grant select on table bookings to authenticated;
grant select on table coupons to authenticated;

-- ── 내 프로필: 조회 + 수정 ────────────────────────────────
-- 닉네임과 프로필 사진을 본인이 바꾼다(users_update_own 정책).
-- insert 권한은 주지 않는다 — 프로필 행은 회원가입 때 handle_new_user 트리거가 만든다.
grant select, update on table users to authenticated;

-- admins에는 아무 권한도 주지 않는다. 20260806150000_admin_role.sql에서 회수해 둔 그대로다
-- (읽는 경로는 is_admin() 함수 하나뿐이다).
