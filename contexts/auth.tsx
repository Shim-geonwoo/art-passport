// 로그인 세션(Supabase Auth)을 앱 전체가 함께 보는 저장소
//
// 로그인/회원가입 화면과 app/_layout.tsx(로그인 여부에 따라 화면 전환)가 여기 값을 함께 쓴다.
// 세션은 Supabase가 기기 저장소(AsyncStorage, lib/supabase.ts에서 설정)에 알아서 저장해주므로,
// 앱을 껐다 켜도 로그인이 유지된다.

import { Session, User } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchIsAdmin } from '@/data/admin';
import { fetchMyProfile, Profile } from '@/data/profile';
import { supabase } from '@/lib/supabase';

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null; // public.users의 내 프로필(닉네임·이미지). 로그인 후 채워진다
  // 관리자인가. 마이페이지에 관리자 메뉴를 띄울지 정하는 데만 쓴다.
  // 이 값이 true라고 해서 무엇이 되는 게 아니다 — 실제 차단은 DB(RLS)가 한다.
  // 그래서 조회에 실패하면 조용히 false로 둔다(메뉴가 안 보일 뿐, 잘못 열리지 않는다).
  isAdmin: boolean;
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
  // 가입 확인 메일을 다시 보낸다 (메일이 안 왔거나 링크가 만료됐을 때)
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  // 비밀번호 재설정 1단계: 메일로 6자리 코드를 보낸다
  sendPasswordResetCode: (email: string) => Promise<{ error: string | null }>;
  // 비밀번호 재설정 2단계: 코드를 확인하고 새 비밀번호로 바꾼다 (성공하면 그대로 로그인된다)
  confirmPasswordReset: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<{ error: string | null }>;
  // 회원 탈퇴. 계정과 예매·쿠폰이 함께 지워지고 되돌릴 수 없다.
  deleteAccount: () => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>; // 프로필을 다시 불러온다 (닉네임 수정 직후 등)
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
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

  // 관리자 여부도 로그인할 때 한 번 물어본다. 사람이 바뀌면 반드시 다시 물어야 해서
  // 프로필과 같은 자리에 둔다 — 로그아웃 후 다른 계정으로 들어왔는데 앞사람의 값이
  // 남아 있으면 안 되기 때문이다(그래도 서버가 막지만, 있지도 않은 메뉴가 보인다).
  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setIsAdmin(false);
      return;
    }

    fetchIsAdmin()
      .then((result) => {
        if (!cancelled) {
          setIsAdmin(result);
        }
      })
      .catch(() => {
        // 실패하면 관리자가 아닌 것으로 둔다. 조용히 넘어가도 되는 이유는 이 값이 권한이
        // 아니라 "메뉴를 띄울지"일 뿐이어서다 — 잘못 열리는 쪽이 아니라 안 보이는 쪽으로 틀린다.
        if (!cancelled) {
          setIsAdmin(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin,
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

      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        return { error: error?.message ?? null };
      },

      async sendPasswordResetCode(email) {
        // 이 호출로 Supabase가 '비밀번호 재설정' 메일을 보낸다.
        // 메일 템플릿에 {{ .Token }}이 들어 있어야 6자리 코드가 함께 온다(대시보드 설정).
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        return { error: error?.message ?? null };
      },

      async confirmPasswordReset(email, code, newPassword) {
        // 1) 코드 확인. 통과하면 Supabase가 세션을 만들어준다 — 이 순간 로그인 상태가 되고,
        //    app/_layout.tsx의 가드가 화면을 (tabs)로 넘긴다(재설정 화면은 사라진다).
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email,
          token: code,
          type: 'recovery',
        });
        if (verifyError) {
          return { error: verifyError.message };
        }

        // 2) 그 세션으로 비밀번호를 바꾼다. 화면이 이미 사라졌더라도 supabase 클라이언트는
        //    앱 전체가 공유하는 하나라서 이 요청은 그대로 끝까지 간다.
        //    (그래서 새 비밀번호 형식 검사는 1)보다 먼저, 화면에서 끝내둔다)
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          return { error: updateError.message };
        }
        return { error: null };
      },

      async deleteAccount() {
        // 계정 삭제는 서버 함수가 한다 (본인 것만 지우도록 auth.uid()로 잠겨 있다)
        const { error } = await supabase.rpc('delete_own_account');
        if (error) {
          return { error: error.message };
        }
        // 계정이 없어졌으니 기기에 남은 세션도 정리한다.
        // 이때 onAuthStateChange가 세션을 null로 바꾸고, app/_layout.tsx의 가드가
        // 자동으로 로그인 화면으로 되돌린다.
        await supabase.auth.signOut();
        return { error: null };
      },

      refreshProfile,
    }),
    [session, profile, isAdmin, isLoading, refreshProfile]
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
