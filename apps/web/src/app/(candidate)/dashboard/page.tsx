'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { EnrollControls } from '@/components/dashboard/enroll-controls';
import { EnrollmentCard } from '@/components/dashboard/enrollment-card';
import { TrackList } from '@/components/dashboard/track-list';
import { apiFetch } from '@/lib/api';
import type { Enrollment, Track } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const enrollments = useQuery({
    queryKey: ['enrollments', 'me'],
    queryFn: () => apiFetch<Enrollment[]>('/enrollments/me'),
  });
  const tracks = useQuery({
    queryKey: ['tracks'],
    queryFn: () => apiFetch<Track[]>('/tracks'),
  });

  // Enrolled tracks may no longer appear in the published list; fetch each.
  const trackIds = [...new Set((enrollments.data ?? []).map((e) => e.trackId))];
  const trackLookups = useQueries({
    queries: trackIds.map((id) => ({
      queryKey: ['tracks', id],
      queryFn: () => apiFetch<Track>(`/tracks/${id}`),
      retry: false,
    })),
  });
  const tracksById = new Map<string, Track>();
  for (const t of tracks.data ?? []) tracksById.set(t._id, t);
  for (const lookup of trackLookups) {
    if (lookup.data) tracksById.set(lookup.data._id, lookup.data);
  }

  const enroll = useMutation({
    mutationFn: (body: { trackId: string } | { inviteCode: string }) =>
      apiFetch<Enrollment>('/enrollments', { method: 'POST', body }),
    onSuccess: async (created) => {
      setEnrollError(null);
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      router.push(`/enrollments/${created._id}`);
    },
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">My tracks</h1>
        {enrollments.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {enrollments.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">You are not enrolled in any track yet.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {(enrollments.data ?? []).map((e) => (
            <EnrollmentCard key={e._id} enrollment={e} track={tracksById.get(e.trackId)} />
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Available tracks</h2>
        {enrollError && (
          <Alert variant="destructive">
            <AlertDescription>{enrollError}</AlertDescription>
          </Alert>
        )}
        <TrackList
          tracks={tracks.data ?? []}
          enrolledTrackIds={new Set((enrollments.data ?? []).map((e) => e.trackId))}
          onEnroll={(trackId) =>
            enroll.mutate(
              { trackId },
              {
                onError: (err) =>
                  setEnrollError(err instanceof Error ? err.message : 'Enrollment failed'),
              },
            )
          }
        />
        <Separator />
        <div className="max-w-sm">
          <h3 className="mb-2 text-sm font-medium">Have an invite code?</h3>
          <EnrollControls
            onJoin={async (inviteCode) => {
              await enroll.mutateAsync({ inviteCode });
            }}
          />
        </div>
      </section>
    </div>
  );
}
