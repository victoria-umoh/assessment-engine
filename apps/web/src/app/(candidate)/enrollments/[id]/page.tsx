'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DayAccordion } from '@/components/track/day-accordion';
import { apiFetch } from '@/lib/api';
import type { CapstoneStatus, Enrollment, Track, UnlockState } from '@/lib/types';

export default function EnrollmentPage() {
  const { id } = useParams<{ id: string }>();

  const enrollment = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => apiFetch<Enrollment>(`/enrollments/${id}`),
  });
  const track = useQuery({
    queryKey: ['tracks', enrollment.data?.trackId],
    queryFn: () => apiFetch<Track>(`/tracks/${enrollment.data!.trackId}`),
    enabled: !!enrollment.data,
  });
  const unlockState = useQuery({
    queryKey: ['enrollments', id, 'unlock-state'],
    queryFn: () => apiFetch<UnlockState>(`/enrollments/${id}/unlock-state`),
  });
  // 404 means the track has no capstone — hide the card.
  const capstone = useQuery({
    queryKey: ['enrollments', id, 'final-assessment'],
    queryFn: () => apiFetch<CapstoneStatus>(`/enrollments/${id}/final-assessment`),
    retry: false,
  });

  if (enrollment.isLoading || track.isLoading || unlockState.isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!enrollment.data || !track.data || !unlockState.data) {
    return <p className="text-destructive">Could not load this enrollment.</p>;
  }

  const settled =
    enrollment.data.status === 'completed' || enrollment.data.status === 'failed';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{track.data.title}</h1>
        {track.data.description && (
          <p className="text-sm text-muted-foreground">{track.data.description}</p>
        )}
      </div>

      {settled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assessment {enrollment.data.status}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/enrollments/${id}/result`} className="text-sm underline">
              View result
            </Link>
          </CardContent>
        </Card>
      )}

      {capstone.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {capstone.data.available
                ? 'All days complete — the capstone is open.'
                : 'Unlocks when every required day item is complete.'}
            </p>
            <Link href={`/enrollments/${id}/final`} className="text-sm underline">
              Open final assessment
            </Link>
          </CardContent>
        </Card>
      )}

      <DayAccordion
        track={track.data}
        unlockState={unlockState.data}
        itemProgress={enrollment.data.itemProgress}
        enrollmentId={id}
        startDate={enrollment.data.startDate}
      />
    </div>
  );
}
