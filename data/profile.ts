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
