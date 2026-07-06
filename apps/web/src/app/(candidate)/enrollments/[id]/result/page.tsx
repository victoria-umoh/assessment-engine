'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ResultCard } from '@/components/result/result-card';
import { apiFetch, ApiError } from '@/lib/api';
import type { AssessmentResult, Enrollment, Track } from '@/lib/types';

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();

  // Finalization runs in the worker; 404 'Result not ready' polls every 5s
  // until the verdict lands.
  const result = useQuery({
    queryKey: ['enrollments', id, 'result'],
    queryFn: () => apiFetch<AssessmentResult>(`/enrollments/${id}/result`),
    retry: false,
    refetchInterval: (query) => (query.state.data ? false : 5000),
  });

  const enrollment = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => apiFetch<Enrollment>(`/enrollments/${id}`),
  });
  const track = useQuery({
    queryKey: ['tracks', enrollment.data?.trackId],
    queryFn: () => apiFetch<Track>(`/tracks/${enrollment.data!.trackId}`),
    enabled: !!enrollment.data,
  });

  const notReady = result.error instanceof ApiError && result.error.status === 404;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Assessment result</h1>
        <Link href={`/enrollments/${id}`} className="text-sm underline">
          Back to track
        </Link>
      </div>

      {result.data ? (
        <ResultCard result={result.data} track={track.data} />
      ) : notReady ? (
        <p className="text-muted-foreground">
          Finalizing your assessment… this page refreshes automatically.
        </p>
      ) : result.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <p className="text-destructive">Could not load the result.</p>
      )}
    </div>
  );
}
