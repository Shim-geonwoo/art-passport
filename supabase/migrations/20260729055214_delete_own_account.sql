-- 회원 탈퇴 — 본인 계정을 스스로 지운다
--
-- 왜 서버 함수인가: 계정 자체(auth.users)는 Supabase Auth가 관리하는 표라서, 앱이 들고 있는
-- anon 키로는 지울 수 없다(그래야 남의 계정을 못 지운다). service_role 키를 앱에 넣는 건
-- 절대 안 되므로 — 그 키 하나면 모든 회원의 모든 데이터를 마음대로 할 수 있다 —
-- "본인 것만 지운다"는 조건이 박힌 함수를 서버에 두고, 앱은 이 함수만 부른다.
--
-- 지워지는 범위(연쇄 삭제):
--   auth.users 삭제 → public.users (on delete cascade)
--                   → bookings, coupons (public.users를 참조하며 cascade)
-- 즉 예매 내역·쿠폰·스탬프(=관람완료 예매)가 함께 사라진다. 되돌릴 수 없다.
-- (events/event_schedules는 카탈로그라 그대로 남는다)

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  -- auth.uid()로만 지운다. 인자로 id를 받지 않기 때문에 남의 계정을 지목할 방법이 없다.
  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
