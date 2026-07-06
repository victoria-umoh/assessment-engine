'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Track } from '@/lib/types';

export function TrackList({
  tracks,
  enrolledTrackIds,
  onEnroll,
}: {
  tracks: Track[];
  enrolledTrackIds: Set<string>;
  onEnroll: (trackId: string) => void;
}) {
  const available = tracks.filter((t) => !enrolledTrackIds.has(t._id));
  if (available.length === 0) {
    return <p className="text-sm text-muted-foreground">No new tracks available right now.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {available.map((track) => (
        <Card key={track._id}>
          <CardHeader>
            <CardTitle className="text-base">{track.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {track.description && (
              <p className="text-sm text-muted-foreground">{track.description}</p>
            )}
            <p className="text-sm text-muted-foreground">{track.durationDays} days</p>
            <Button size="sm" onClick={() => onEnroll(track._id)}>
              Enroll
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
