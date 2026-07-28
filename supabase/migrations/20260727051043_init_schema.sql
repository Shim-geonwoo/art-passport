-- Art Passport 초기 스키마
-- docs/data-structure.md의 ERD를 그대로 옮긴다.
-- 핵심 원칙: bookings.status는 저장하지 않는다(is_cancelled만 저장, 나머지는 조회 시 계산).
--           stamps는 별도 테이블을 두지 않는다(관람완료 bookings를 watched_at 순 정렬한 게 스탬프 목록).

create extension if not exists "pgcrypto";

-- ── venues (공연장) ──────────────────────────────────────
-- 지금은 events.venue_name을 글자 그대로 쓰지만, 문서(data-structure.md)에 있는 대로
-- 테이블은 먼저 만들어 둔다. 나중에 events.venue_id로 옮겨 붙일 수 있다.
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text
);

-- ── events (공연·전시) ───────────────────────────────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  genre text not null check (genre in ('전시', '클래식·무용', '콘서트', '연극', '뮤지컬')),
  show_at timestamptz not null, -- 회차형: 공연 시작 일시 / 기간형: 전시 시작일
  show_end_at timestamptz, -- 기간형(전시)만 사용. null이면 회차형(공연)
  price integer not null check (price >= 0),
  poster_url text,
  description text,
  venue_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists events_genre_idx on events (genre);
create index if not exists events_show_at_idx on events (show_at);

-- ── users (회원 프로필, auth.users와 1:1) ─────────────────
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  profile_image text,
  created_at timestamptz not null default now()
);

-- 회원가입(auth.users에 새 행 생성) 시 프로필 행을 자동으로 만들어준다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', '사용자'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── coupons (쿠폰) ────────────────────────────────────────
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  benefit text not null default '다음 예매 10% 할인',
  discount_rate integer not null default 10 check (discount_rate between 0 and 100),
  status text not null default '사용가능' check (status in ('사용가능', '사용완료', '만료')),
  issued_at timestamptz not null default now(),
  issued_at_stamp_order integer -- 몇 번째 스탬프에서 발급됐는지(9, 18, ...). 표시·디버깅용
);

create index if not exists coupons_user_id_idx on coupons (user_id);

-- ── bookings (예매) — 앱의 심장 ────────────────────────────
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  event_id uuid not null references events (id) on delete restrict,
  watched_at timestamptz not null, -- 이 예매의 실제 관람 시각(예매 시점에 확정, 이후 안 바뀜)
  is_cancelled boolean not null default false, -- 저장하는 상태는 이것 하나뿐
  quantity integer not null default 1 check (quantity >= 1),
  used_coupon_id uuid references coupons (id) on delete set null,
  original_price integer not null check (original_price >= 0), -- 예매 시점 스냅샷
  total_price integer not null check (total_price >= 0), -- 할인 반영 스냅샷
  created_at timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on bookings (user_id);
create index if not exists bookings_event_id_idx on bookings (event_id);
create index if not exists bookings_watched_at_idx on bookings (watched_at);

-- ── Row Level Security ────────────────────────────────────
alter table venues enable row level security;
alter table events enable row level security;
alter table users enable row level security;
alter table coupons enable row level security;
alter table bookings enable row level security;

-- venues / events: 예매 카탈로그라 누구나(비로그인 포함) 조회 가능. 쓰기는 앱에서 안 함(관리자 전용).
create policy "venues_select_all" on venues for select using (true);
create policy "events_select_all" on events for select using (true);

-- users: 본인 프로필만 조회/수정 가능. 생성은 트리거(handle_new_user)가 대신하므로 insert 정책은 안 둔다.
create policy "users_select_own" on users for select using (auth.uid() = id);
create policy "users_update_own" on users for update using (auth.uid() = id);

-- bookings: 본인 예매만 조회/생성/수정(취소) 가능.
create policy "bookings_select_own" on bookings for select using (auth.uid() = user_id);
create policy "bookings_insert_own" on bookings for insert with check (auth.uid() = user_id);
create policy "bookings_update_own" on bookings for update using (auth.uid() = user_id);

-- coupons: 본인 쿠폰만 조회 가능. 발급/사용완료 처리는 서버 로직(함수·트리거)이 담당하므로
-- 클라이언트에는 insert/update 정책을 열어주지 않는다.
create policy "coupons_select_own" on coupons for select using (auth.uid() = user_id);
