'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Enrollment, Track } from '@/lib/types';

const STATUS_VARIANT: Record<Enrollment['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  failed: 'destructive',
  expired: 'outline',
};

export function EnrollmentCard({
  enrollment,
  track,
}: {
  enrollment: Enrollment;
  track?: Track;
}) {
  const settled = enrollment.status === 'completed' || enrollment.status === 'failed';
  const duration = track?.durationDays ?? 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{track?.title ?? 'Track'}</CardTitle>
        <Badge variant={STATUS_VARIANT[enrollment.status]}>{enrollment.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {duration > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Day {Math.min(enrollment.unlockedDay, duration)} of {duration}
            </p>
            <Progress value={(enrollment.unlockedDay / duration) * 100} />
          </>
        )}
        <div className="flex gap-3">
          <Link href={`/enrollments/${enrollment._id}`} className="text-sm underline">
            Continue
          </Link>
          {settled && (
            <Link
              href={`/enrollments/${enrollment._id}/result`}
              className="text-sm underline"
            >
              View result
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
