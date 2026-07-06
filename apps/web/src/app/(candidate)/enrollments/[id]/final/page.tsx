'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CapstoneHub } from '@/components/final/capstone-hub';
import { apiFetch, ApiError } from '@/lib/api';
import type { CapstoneStatus, Enrollment } from '@/lib/types';

export default function FinalPage() {
  const { id } = useParams<{ id: string }>();

  const enrollment = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => apiFetch<Enrollment>(`/enrollments/${id}`),
  });
  const capstone = useQuery({
    queryKey: ['enrollments', id, 'final-assessment'],
    queryFn: () => apiFetch<CapstoneStatus>(`/enrollments/${id}/final-assessment`),
    retry: false,
  });

  if (enrollment.isLoading || capstone.isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (capstone.error instanceof ApiError && capstone.error.status === 404) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">This track has no final assessment.</p>
        <Link href={`/enrollments/${id}`} className="text-sm underline">
          Back to track
        </Link>
      </div>
    );
  }
  if (!enrollment.data || !capstone.data) {
    return <p className="text-destructive">Could not load the final assessment.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Final assessment</h1>
        <Link href={`/enrollments/${id}`} className="text-sm underline">
          Back to track
        </Link>
      </div>
      <CapstoneHub enrollment={enrollment.data} status={capstone.data} />
    </div>
  );
}
