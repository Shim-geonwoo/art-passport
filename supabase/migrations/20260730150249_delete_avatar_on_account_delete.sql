-- 회원 탈퇴할 때 프로필 사진도 함께 지운다
--
-- delete_own_account()는 auth.users 행 하나만 지웠다. 거기서 연쇄 삭제(on delete cascade)가
-- 타고 가는 곳은 public.users -> bookings, coupons까지고, Storage에 올라간 파일은 그 사슬에 없다.
-- 그래서 탈퇴한 뒤에도 avatars/{user_id}/avatar.jpg가 그대로 남았다.
--
-- 남은 파일은 아무도 치울 수 없다. storage 정책이 "본인 폴더만"으로 잠겨 있는데(avatar_storage
-- 마이그레이션), 그 '본인'이 이미 사라졌기 때문이다. 탈퇴가 쌓일수록 주인 없는 사진만 늘어난다.
--
-- 경로 규칙이 {user_id}/avatar.jpg라서 폴더 이름만 보면 누구 것인지 알 수 있다.
-- (storage.foldername(name))[1]이 첫 폴더 이름을 돌려준다 — 기존 storage 정책들이 쓰는 방법 그대로다.

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

  -- 사진을 먼저 지운다. auth.users를 지우고 나면 "이 사람이 누구였는지"를 잡을 기준이 사라진다.
  --
  -- 실패하더라도 탈퇴는 그대로 진행한다(아래 exception 블록).
  -- storage는 public이 아닌 별도 스키마라, 이 함수를 실행하는 권한이 그쪽 표를 지울 수 있는지는
  -- 프로젝트 권한 구성에 달렸다. 만약 막힌다면 사진 하나 때문에 탈퇴 자체가 실패하게 되는데,
  -- 그건 "파일이 남는" 것보다 훨씬 나쁜 결과다 — 계정을 지우고 싶은데 못 지우게 되니까.
  -- 여기서 실패하면 결과는 지금까지와 같을 뿐(파일이 남음), 더 나빠지지는 않는다.
  begin
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = v_user_id::text;
  exception
    when others then
      null;
  end;

  -- auth.uid()로만 지운다. 인자로 id를 받지 않기 때문에 남의 계정을 지목할 방법이 없다.
  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
