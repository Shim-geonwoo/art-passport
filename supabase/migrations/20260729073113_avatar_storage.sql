-- 프로필 이미지 저장소 (Supabase Storage)
--
-- users.profile_image 칸은 처음부터 있었지만 이미지를 올려둘 곳이 없어서 늘 비어 있었다.
-- 여기서 'avatars' 버킷을 만들고, "본인 폴더에만 쓸 수 있다"는 규칙을 건다.
--
-- 파일 경로 규칙: {user_id}/avatar.jpg
--   맨 앞 폴더 이름을 회원 id로 쓰면, 정책에서 그 폴더가 본인 것인지만 확인하면 된다.
--   (storage.foldername(name)[1]이 첫 폴더 이름을 돌려준다)

-- 공개 버킷으로 만든다. 프로필 사진은 감출 정보가 아니고, 공개면 이미지 주소를 그대로 쓸 수 있어
-- 화면에서 서명된 URL을 매번 발급받는 번거로움이 없다.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- ── 접근 정책 (storage.objects) ───────────────────────────
-- 읽기: 누구나. 공개 버킷이라 이미지 주소만 알면 볼 수 있고, 그게 의도한 동작이다.
drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all" on storage.objects
  for select using (bucket_id = 'avatars');

-- 올리기/바꾸기/지우기: 본인 폴더({user_id}/...)에만. 남의 프로필 사진은 건드릴 수 없다.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
