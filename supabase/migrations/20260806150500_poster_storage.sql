-- 포스터 저장소 (Supabase Storage)
--
-- events.poster_url 칸은 처음부터 있었지만 이미지를 올려둘 곳이 없어서, 시드가 임시 이미지
-- (picsum.photos)를 가리키고 있었다. 여기서 'posters' 버킷을 만들어 관리자가 실제 포스터를
-- 올릴 수 있게 한다.
--
-- 구조는 프로필 사진(20260729073113_avatar_storage.sql)을 그대로 본떴다. 다른 것은 조건 하나다 —
-- avatars는 "본인 폴더인가"를 보고, posters는 "관리자인가"를 본다.
--
-- 파일 경로 규칙: {event_id}/poster.jpg
--   공연 하나에 포스터 한 장이라 경로가 곧 그 공연의 자리가 된다. 새 포스터를 올리면
--   같은 경로에 덮어쓰므로(upsert), 지난 파일이 쌓이지 않는다.

-- 공개 버킷으로 만든다. 포스터는 예매 카탈로그의 일부라 로그인 전에도 보여야 하고,
-- 공개면 이미지 주소를 그대로 쓸 수 있어 서명된 URL을 매번 발급받지 않아도 된다.
-- (events 조회가 비로그인에도 열려 있는 것과 같은 이유다)
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do update set public = true;

-- ── 접근 정책 (storage.objects) ───────────────────────────
-- 읽기: 누구나. 카탈로그에 뿌리는 이미지라 그게 의도한 동작이다.
drop policy if exists "posters_select_all" on storage.objects;
create policy "posters_select_all" on storage.objects
  for select using (bucket_id = 'posters');

-- 올리기/바꾸기/지우기: 관리자만.
-- is_admin()은 SECURITY DEFINER라 admins 표를 못 읽는 사용자도 이 판단은 받을 수 있다.
drop policy if exists "posters_insert_admin" on storage.objects;
create policy "posters_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.is_admin());

drop policy if exists "posters_update_admin" on storage.objects;
create policy "posters_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.is_admin())
  with check (bucket_id = 'posters' and public.is_admin());

-- 공연을 지울 수는 없지만(숨기기만 한다) 포스터는 교체·삭제할 수 있어야 한다.
-- 잘못 올린 이미지를 내리는 건 흔한 일이고, 지워도 events.poster_url을 null로 되돌리면 끝이다.
drop policy if exists "posters_delete_admin" on storage.objects;
create policy "posters_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.is_admin());
