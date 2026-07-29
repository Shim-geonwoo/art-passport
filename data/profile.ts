// 내 프로필 (public.users 테이블)
//
// 회원가입 시 handle_new_user 트리거가 users 행을 만들어 두고(닉네임은 가입 때 입력값),
// 이후 프로필 편집 화면에서 이 함수들로 읽고 고친다. RLS가 본인 행만 select/update 허용한다.
// (닉네임의 source of truth는 auth 메타데이터가 아니라 이 users 테이블이다 — 프로필 이미지도
//  여기 살기 때문에 한 곳에 모은다)

import { supabase } from '@/lib/supabase';

export type Profile = {
  nickname: string;
  profileImage: string | null;
};

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('nickname, profile_image')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return { nickname: data.nickname, profileImage: data.profile_image };
}

// 닉네임을 바꾼다. 빈 문자열은 호출 전에 화면에서 막는다(여기선 그대로 저장하지 않게 trim만).
export async function updateNickname(userId: string, nickname: string): Promise<void> {
  const { error } = await supabase.from('users').update({ nickname: nickname.trim() }).eq('id', userId);
  if (error) {
    throw error;
  }
}

// ── 프로필 이미지 (Supabase Storage) ──────────────────────

const AVATAR_BUCKET = 'avatars';

// base64 글자를 실제 바이트로 바꾼다.
// 사진을 고르면 base64 문자열로 받는데, Storage에는 바이트로 올려야 해서 한 번 변환한다.
// (라이브러리를 더 넣지 않으려고 직접 쓴다 — atob은 React Native와 브라우저 모두에 있다)
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 고른 사진을 올리고, 그 주소를 users.profile_image에 저장한 뒤 최종 주소를 돌려준다.
//
// 경로는 회원마다 하나로 고정한다({user_id}/avatar.jpg). 바꿀 때마다 새 파일을 만들면
// 예전 사진이 계속 쌓이기 때문에, 같은 자리에 덮어쓴다(upsert).
// 대신 주소가 늘 같아서 캐시에 남은 옛 사진이 보일 수 있어, 주소 끝에 시각(?v=...)을 붙인다.
export async function uploadAvatar(
  userId: string,
  base64: string,
  contentType: string
): Promise<string> {
  const path = `${userId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, base64ToBytes(base64), { contentType, upsert: true });
  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('users')
    .update({ profile_image: publicUrl })
    .eq('id', userId);
  if (updateError) {
    throw updateError;
  }

  return publicUrl;
}

// 프로필 사진을 지운다. 파일과 users.profile_image를 함께 비운다.
export async function removeAvatar(userId: string): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([`${userId}/avatar.jpg`]);
  if (removeError) {
    throw removeError;
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ profile_image: null })
    .eq('id', userId);
  if (updateError) {
    throw updateError;
  }
}
