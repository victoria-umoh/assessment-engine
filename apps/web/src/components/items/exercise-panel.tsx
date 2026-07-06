'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import type { Enrollment, TrackItem, UnlockState } from '@/lib/types';

export function ExercisePanel({
  enrollment,
  item,
}: {
  enrollment: Enrollment;
  item: TrackItem;
}) {
  const queryClient = useQueryClient();
  const instructions =
    typeof (item.config as { instructions?: unknown })?.instructions === 'string'
      ? ((item.config as { instructions: string }).instructions)
      : 'Complete this practical exercise, then mark it done below.';

  const alreadyComplete =
    enrollment.itemProgress.find((p) => p.itemId === item.itemId)?.status === 'completed';

  const complete = useMutation({
    mutationFn: () =>
      apiFetch<UnlockState>(`/enrollments/${enrollment._id}/items/${item.itemId}/complete`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', enrollment._id] });
    },
  });

  const done = alreadyComplete || complete.isSuccess;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exercise</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{instructions}</p>
        {complete.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {complete.error instanceof Error ? complete.error.message : 'Could not complete'}
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={() => complete.mutate()} disabled={done || complete.isPending}>
          {done ? 'Completed ✓' : 'Mark as complete'}
        </Button>
      </CardContent>
    </Card>
  );
}
