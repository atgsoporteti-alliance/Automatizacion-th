'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthenticatedUserProfile, ROLE_HOME_ROUTES } from '@alliance-hcm/shared';
import { apiClient, DEV_ROLE_COOKIE } from './api';
import { createSupabaseBrowserClient } from './supabase/client';

interface AuthContextValue {
  user: AuthenticatedUserProfile | null;
  loading: boolean;
  refreshUser: () => Promise<AuthenticatedUserProfile | null>;
  loginWithDevProfile: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => null,
  loginWithDevProfile: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const isPublicCandidateRoute =
    (pathname?.startsWith('/pre-ingreso') || pathname?.startsWith('/candidato')) ?? false;

  const refreshUser = useCallback(async () => {
    try {
      const profile = await apiClient.getMe();
      setUser(profile);
      return profile;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPublicCandidateRoute) {
      setLoading(false);
      return;
    }

    void refreshUser();

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [isPublicCandidateRoute, refreshUser]);

  const loginWithDevProfile = async (email: string) => {
    document.cookie = `${DEV_ROLE_COOKIE}=${encodeURIComponent(email)}; path=/; max-age=86400; SameSite=Lax`;
    try {
      window.localStorage.setItem(DEV_ROLE_COOKIE, email);
    } catch {
      // ignore storage error
    }
    const profile = await apiClient.getMe();
    setUser(profile);
    document.cookie = `alliance_user_role=${encodeURIComponent(profile.role)}; path=/; max-age=86400; SameSite=Lax`;
    router.push(ROLE_HOME_ROUTES[profile.role] ?? '/dashboard/th');
  };

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    document.cookie = `${DEV_ROLE_COOKIE}=; path=/; max-age=0`;
    document.cookie = `alliance_user_role=; path=/; max-age=0`;
    try {
      window.localStorage.removeItem(DEV_ROLE_COOKIE);
    } catch {
      // ignore storage error
    }
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, loginWithDevProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
