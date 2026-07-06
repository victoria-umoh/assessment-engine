'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';

// (admin) route-group error boundary. An expired session surfaces here as a
// thrown ApiError(401) from a render-path query — route to login instead of
// showing Next's error screen (P6 gate rider).
export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  const isAuthFailure = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (isAuthFailure) router.replace('/login');
  }, [isAuthFailure, router]);

  if (isAuthFailure) return null;

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <Alert variant="destructive">
        <AlertDescription>{error.message || 'Something went wrong'}</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
