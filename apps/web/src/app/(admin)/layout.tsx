'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { AdminNav } from '@/components/admin/nav';
import { Button } from '@/components/ui/button';

// Role gate: anonymous → login, authed non-admin → candidate dashboard.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const isAdmin = status === 'authed' && user?.role === 'admin';

  useEffect(() => {
    if (status === 'anon') router.replace('/login');
    else if (status === 'authed' && user?.role !== 'admin') router.replace('/dashboard');
  }, [status, user, router]);

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-semibold">
            LMS Admin
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
              Candidate view
            </Link>
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="w-44 shrink-0">
          <AdminNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
