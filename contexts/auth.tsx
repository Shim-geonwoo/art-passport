// 로그인 세션(Supabase Auth)을 앱 전체가 함께 보는 저장소
//
// 로그인/회원가입 화면과 app/_layout.tsx(로그인 여부에 따라 화면 전환)가 여기 값을 함께 쓴다.
// 세션은 Supabase가 기기 저장소(AsyncStorage, lib/supabase.ts에서 설정)에 알아서 저장해주므로,
// 앱을 껐다 켜도 로그인이 유지된다.

import { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchMyProfile, Profile } from '@/data/profile';
import { supabase } from '@/lib/supabase';

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null; // public.users의 내 프로필(닉네임·이미지). 로그인 후 채워진다
  isLoading: boolean; // 저장된 세션을 처음 불러오는 동안 true
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  // 성공하면 needsEmailConfirmation으로 "가입은 됐지만 이메일 확인이 더 필요한지"를 알려준다
  // (Supabase 프로젝트의 이메일 확인 설정에 따라 다르다)
  signUp: (
    email: string,
    password: string,
    nickname: string
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>; // 프로필을 다시 불러온다 (닉네임 수정 직후 등)
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1) 앱 시작 시: 기기에 저장된 세션이 있으면 불러온다
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    // 2) 로그인/로그아웃/토큰 갱신이 일어날 때마다 최신 세션으로 갱신한다
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await fetchMyProfile(userId));
    } catch {
      // 프로필 조회 실패는 조용히 넘어간다(닉네임 표시가 기본값으로 떨어질 뿐)
    }
  }, [userId]);

  // 로그인 상태(userId)가 바뀔 때마다 프로필을 다시 불러온다
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },

      async signUp(email, password, nickname) {
        // nickname을 user_metadata에 담아두면, DB의 handle_new_user 트리거가
        // public.users 프로필 행을 만들 때 이 값을 그대로 가져다 쓴다.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nickname } },
        });
        if (error) {
          return { error: error.message, needsEmailConfirmation: false };
        }
        // 이메일 확인이 켜져 있으면 세션 없이 user만 돌아온다(로그인은 확인 후에나 가능)
        return { error: null, needsEmailConfirmation: !data.session };
      },

      async signOut() {
        await supabase.auth.signOut();
      },

      refreshProfile,
    }),
    [session, profile, isLoading, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.');
  }
  return value;
}
