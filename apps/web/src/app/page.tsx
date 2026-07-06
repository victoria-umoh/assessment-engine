'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { tokenStore } from '@/lib/tokens';

// Tokens live in localStorage (client-rendered app), so the landing redirect
// must run client-side.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tokenStore.hasSession() ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
