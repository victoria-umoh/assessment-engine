'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { ItemProgress, TrackItem } from '@/lib/types';

const TYPE_LABEL: Record<TrackItem['type'], string> = {
  lesson: 'Lesson',
  reading: 'Reading',
  quiz: 'Quiz',
  coding: 'Coding',
  exercise: 'Exercise',
};

export function ItemRow({
  item,
  progress,
  enrollmentId,
  locked,
}: {
  item: TrackItem;
  progress?: ItemProgress;
  enrollmentId: string;
  locked: boolean;
}) {
  const label = TYPE_LABEL[item.type];
  const required = (item.config as { required?: boolean })?.required !== false;
  const completed = progress?.status === 'completed';

  const status = completed ? (
    <Badge variant="secondary">
      ✓ Completed
      {typeof progress?.score === 'number' ? ` · ${Math.round(progress.score)}%` : ''}
    </Badge>
  ) : (
    <Badge variant="outline">Not started</Badge>
  );

  const body = (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {!required && <span className="text-xs text-muted-foreground">optional</span>}
      </div>
      {status}
    </div>
  );

  if (locked) {
    return <div className="opacity-60">{body}</div>;
  }
  return (
    <Link
      href={`/enrollments/${enrollmentId}/items/${item.itemId}`}
      aria-label={label}
      className="block hover:bg-accent/50"
    >
      {body}
    </Link>
  );
}
