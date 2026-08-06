-- 관리자 권한 — 공연·회차를 앱에서 등록·수정할 수 있게 한다
--
-- 지금까지 events / event_schedules에는 **쓰기 정책이 하나도 없었다.** 조회만 누구나 열려 있고,
-- 등록·수정은 SQL Editor에서 직접 하는 수밖에 없었다. 관리자 모드를 붙이려면 먼저
-- "누가 관리자인가"와 "관리자는 무엇을 쓸 수 있는가"를 DB가 들고 있어야 한다.
--
-- 이 마이그레이션은 화면을 만들지 않는다. 권한 구조만 세우고 pgTAP으로 검증한다 —
-- 여기가 틀리면 화면을 다 만든 뒤에 갈아엎게 되기 때문이다.

-- ── 왜 users에 is_admin 칸을 두지 않는가 ──────────────────
--
-- 가장 손쉬운 방법은 public.users에 is_admin 칸을 붙이는 것이다. 그런데 이 프로젝트에는
-- 이미 이런 정책이 있다 (20260729014828_create_booking_function.sql):
--
--   create policy "users_update_own" on users
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--
-- 사용자가 자기 프로필 행을 직접 수정할 수 있다는 뜻이다(닉네임·프로필 사진을 그렇게 바꾼다).
-- 거기에 is_admin이 있으면 **누구나 자기를 관리자로 승격시킬 수 있다.**
-- 그래서 관리자 표시는 사용자가 손댈 수 없는 별도의 표에 둔다.

create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 두 겹으로 막는다.
--
--  1) 권한(GRANT)을 회수한다 — 앱이 쓰는 두 역할(anon/authenticated)은 이 표를 아예 건드릴 수 없다.
--     Supabase는 public 스키마에 새로 만든 표에 기본 권한을 자동으로 주기 때문에, 명시적으로 걷어낸다.
--  2) RLS를 켜되 정책을 하나도 만들지 않는다 — 혹시 나중에 권한이 다시 열리더라도 정책이 없어서
--     아무 행도 보이지 않는다.
--
-- 아래 is_admin()은 SECURITY DEFINER라 표 주인(postgres) 자격으로 돌아가므로 둘 다 통과한다.
-- 즉 이 표를 읽는 경로는 그 함수 하나뿐이다.
revoke all on table admins from anon, authenticated;

alter table admins enable row level security;

-- ── 지금 로그인한 사람이 관리자인가 ───────────────────────
-- 앱은 이 함수만 부를 수 있다(admins 표 자체는 못 읽는다). 마이페이지에서 관리자 메뉴를
-- 보여줄지 정할 때 쓰고, 아래 쓰기 정책들도 전부 이 함수를 조건으로 삼는다.
--
-- 로그인하지 않았으면 auth.uid()가 null이라 exists가 false가 된다(예외를 던지지 않는다).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;

-- ── 공연·회차 쓰기 정책 ───────────────────────────────────
--
-- 왜 여기는 서버 함수(SECURITY DEFINER)가 아니라 RLS 정책인가:
--
--   예매·쿠폰은 **클라이언트가 보낸 값을 믿으면 안 되기 때문에** 함수로 처리한다.
--   금액과 관람 시각을 서버가 events에서 다시 읽어 계산해야 하고, 그러지 않으면 과거 시각을
--   적어 보내 스탬프를 즉시 만들어낼 수 있다(= 쿠폰 발급 권한).
--
--   반면 공연 등록·수정은 **관리자가 곧 정보의 출처다.** 서버가 다시 계산할 원본이 없다.
--   확인할 것은 "누가 하느냐" 하나뿐이고, 그건 정책이 하는 일이다.
--   함수로 감싸면 events의 칸 수만큼 인자를 늘어놓은 껍데기 함수가 될 뿐이다.
--
-- 먼저 권한(GRANT)부터 연다. **정책만으로는 아무것도 안 된다** — 둘은 다른 문이다.
--   GRANT   : "이 역할이 이 표에 이 동작을 시도할 수 있는가" (표 단위)
--   POLICY  : "그중 어떤 행에 대해 허용되는가" (행 단위)
-- 권한이 없으면 정책을 보기도 전에 permission denied로 끊긴다. 지금 events/event_schedules에는
-- authenticated에게 조회 권한만 있어서, 정책만 만들면 관리자도 아무것도 못 쓴다.
--
-- 권한을 전체 authenticated에게 여는 게 위험해 보이지만 그렇지 않다. 문을 두 개 다 통과해야 하고,
-- 두 번째 문(정책)이 is_admin()을 요구한다. admins 표에서 두 문을 다 닫아둔 것과 짝이 되는 구조다.
grant insert, update on table events to authenticated;
grant insert, update, delete on table event_schedules to authenticated;

drop policy if exists "events_insert_admin" on events;
create policy "events_insert_admin" on events
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "events_update_admin" on events;
create policy "events_update_admin" on events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- delete 정책은 **일부러 만들지 않는다.** 아래 is_hidden 설명 참고.
-- (정책이 없으면 delete는 예외 없이 0건 처리된다 — 지워지는 행이 하나도 없다)

drop policy if exists "event_schedules_insert_admin" on event_schedules;
create policy "event_schedules_insert_admin" on event_schedules
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "event_schedules_update_admin" on event_schedules;
create policy "event_schedules_update_admin" on event_schedules
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 회차는 지울 수 있게 둔다. 공연과 달리 "잘못 만든 회차를 없애는" 일이 실제로 필요하다.
-- 이미 예매가 있는 회차는 bookings.schedule_id가 on delete restrict라 DB가 알아서 막아준다
-- (정책으로 한 번 더 막을 필요가 없다 — 판 티켓이 있으면 애초에 삭제가 실패한다).
drop policy if exists "event_schedules_delete_admin" on event_schedules;
create policy "event_schedules_delete_admin" on event_schedules
  for delete to authenticated
  using (public.is_admin());

-- ── 삭제 대신 숨기기 ──────────────────────────────────────
--
-- 공연은 지울 수 없다. bookings.event_id가 on delete restrict라 예매가 한 건이라도 있으면
-- DB가 삭제를 거부한다. 그리고 그게 맞다 — 지워지면 이미 판 티켓의 예매 상세와 여권 스탬프가
-- 가리킬 곳을 잃는다(스탬프는 관람완료 예매를 정렬한 것이라 events를 조인해서 그린다).
--
-- 그래서 "내리기"는 삭제가 아니라 카탈로그에서 빼는 것으로 한다. 이미 예매한 사람의
-- 보딩패스와 스탬프는 bookings 조인으로 계속 보인다 — 그쪽은 이 칸을 보지 않기 때문이다.
alter table events add column if not exists is_hidden boolean not null default false;

-- 카탈로그 조회는 "안 숨긴 것"만 훑게 된다(data/events.ts의 fetchEvents가 is_hidden으로 거른다).
-- 숨긴 공연은 보통 소수라, 부분 인덱스로 만들어 두면 인덱스가 작게 유지된다.
create index if not exists events_visible_show_at_idx
  on events (show_at)
  where is_hidden = false;

-- ── 첫 관리자 만들기 ──────────────────────────────────────
-- 관리자만 admins에 쓸 수 있는데 처음엔 관리자가 0명이라, 첫 한 명은 SQL로 넣어야 한다
-- (닭과 달걀). Supabase 대시보드 > SQL Editor에서 한 번만 실행하면 된다:
--
--   insert into admins (user_id)
--   select id from auth.users where email = '본인메일@example.com';
--
-- 그 전까지는 관리자가 아무도 없어서 앱 어디에도 관리자 메뉴가 뜨지 않는다.
