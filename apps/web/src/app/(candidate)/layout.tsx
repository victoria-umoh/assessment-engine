'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, status, logout } = useAuth();

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            LMS Assessment Platform
          </Link>
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
                Admin
              </Link>
            )}
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
