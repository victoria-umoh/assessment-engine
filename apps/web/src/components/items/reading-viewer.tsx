'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/items/markdown';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import { apiFetch, ApiError } from '@/lib/api';
import type { Enrollment, MaterialView, TrackItem } from '@/lib/types';

// Reading items ARE quiz attempts server-side: read the material, then the
// standard runner grades the material's linked comprehension questions.
export function ReadingViewer({
  enrollment,
  item,
}: {
  enrollment: Enrollment;
  item: TrackItem;
}) {
  const [showQuestions, setShowQuestions] = useState(
    // Already-completed readings skip straight to the runner (its intro shows
    // attempts used / start-again).
    enrollment.itemProgress.find((p) => p.itemId === item.itemId)?.status === 'completed',
  );

  const material = useQuery({
    queryKey: ['materials', item.refId],
    queryFn: () => apiFetch<MaterialView>(`/materials/${item.refId}`),
    retry: false,
  });

  if (showQuestions) {
    return <QuizRunner enrollment={enrollment} item={item} />;
  }

  if (material.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (material.error || !material.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Material unavailable
          {material.error instanceof ApiError ? ` — ${material.error.message}` : ''}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{material.data.title}</h1>
      <Markdown>{material.data.body}</Markdown>
      <div className="border-t pt-4">
        <Button onClick={() => setShowQuestions(true)}>Continue to questions</Button>
      </div>
    </article>
  );
}
