'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { LoginDto, RegisterDto } from '@lms/shared';
import { apiFetch, onAuthFailure } from '@/lib/api';
import { tokenStore } from '@/lib/tokens';
import type { AuthResponse, PublicUser } from '@/lib/types';

type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthContextValue {
  user: PublicUser | null;
  status: AuthStatus;
  login(dto: LoginDto): Promise<void>;
  register(dto: RegisterDto): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    onAuthFailure(() => {
      setUser(null);
      setStatus('anon');
      router.push('/login');
    });
    if (!tokenStore.hasSession()) {
      setStatus('anon');
      return;
    }
    let cancelled = false;
    apiFetch<PublicUser>('/auth/me')
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authed');
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        setStatus('anon');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const login = useCallback(async (dto: LoginDto) => {
    const res = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: dto });
    tokenStore.set(res);
    setUser(res.user);
    setStatus('authed');
  }, []);

  const register = useCallback(async (dto: RegisterDto) => {
    const res = await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: dto });
    tokenStore.set(res);
    setUser(res.user);
    setStatus('authed');
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anon');
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
