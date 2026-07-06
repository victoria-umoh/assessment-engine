'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CodingWorkspace } from '@/components/coding/coding-workspace';
import { ExercisePanel } from '@/components/items/exercise-panel';
import { LessonViewer } from '@/components/items/lesson-viewer';
import { ReadingViewer } from '@/components/items/reading-viewer';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import { apiFetch } from '@/lib/api';
import type { Enrollment, Track, TrackItem } from '@/lib/types';

const TYPE_LABEL: Record<TrackItem['type'], string> = {
  lesson: 'Lesson',
  reading: 'Reading',
  quiz: 'Quiz',
  coding: 'Coding',
  exercise: 'Exercise',
};

// Tasks 7–10 register the real viewers here, keyed by item type.
function ItemBody({
  enrollment,
  item,
}: {
  enrollment: Enrollment;
  item: TrackItem;
}) {
  switch (item.type) {
    case 'lesson':
      return <LessonViewer enrollment={enrollment} item={item} />;
    case 'exercise':
      return <ExercisePanel enrollment={enrollment} item={item} />;
    case 'quiz':
      return <QuizRunner enrollment={enrollment} item={item} />;
    case 'reading':
      return <ReadingViewer enrollment={enrollment} item={item} />;
    case 'coding':
      return <CodingWorkspace enrollment={enrollment} item={item} />;
  }
}

export default function ItemPage() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();

  const enrollment = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () => apiFetch<Enrollment>(`/enrollments/${id}`),
  });
  const track = useQuery({
    queryKey: ['tracks', enrollment.data?.trackId],
    queryFn: () => apiFetch<Track>(`/tracks/${enrollment.data!.trackId}`),
    enabled: !!enrollment.data,
  });

  if (enrollment.isLoading || track.isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!enrollment.data || !track.data) {
    return <p className="text-destructive">Could not load this item.</p>;
  }

  let item: TrackItem | undefined;
  let dayNumber: number | undefined;
  for (const day of track.data.days) {
    const found = day.items.find((i) => i.itemId === itemId);
    if (found) {
      item = found;
      dayNumber = day.dayNumber;
      break;
    }
  }
  if (!item) {
    return <p className="text-destructive">Item not found.</p>;
  }

  const progress = enrollment.data.itemProgress.find((p) => p.itemId === itemId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Day {dayNumber} · {TYPE_LABEL[item.type]}
            {progress ? ` · ${progress.attempts} attempt${progress.attempts === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <Link href={`/enrollments/${id}`} className="text-sm underline">
          Back to track
        </Link>
      </div>
      <ItemBody enrollment={enrollment.data} item={item} />
    </div>
  );
}
