'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CodingWorkspace } from '@/components/coding/coding-workspace';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import { apiFetch, ApiError } from '@/lib/api';
import type { AssessmentResult, CapstoneStatus, Enrollment, TrackItem } from '@/lib/types';

// The final quiz rides the standard attempt endpoint with the reserved
// itemId 'final-quiz'; final coding posts final:true submissions.
const FINAL_QUIZ_ITEM = (config: Record<string, unknown>): TrackItem => ({
  itemId: 'final-quiz',
  type: 'quiz',
  config,
});

export function CapstoneHub({
  enrollment,
  status,
}: {
  enrollment: Enrollment;
  status: CapstoneStatus;
}) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [openProblemId, setOpenProblemId] = useState<string | null>(null);
  const [resultPending, setResultPending] = useState(false);

  if (!status.available) {
    return (
      <Alert>
        <AlertDescription>Complete all days first — the capstone unlocks after your last required item.</AlertDescription>
      </Alert>
    );
  }

  const allSettled =
    (!status.quiz || status.quiz.attempted) &&
    (!status.coding || status.coding.every((c) => c.settled));

  async function checkResult() {
    setResultPending(true);
    try {
      await apiFetch<AssessmentResult>(`/enrollments/${enrollment._id}/result`);
      window.location.assign(`/enrollments/${enrollment._id}/result`);
    } catch (err) {
      // 404 'Result not ready' — the worker finalizes asynchronously; anything
      // else is a real failure and must surface.
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    } finally {
      setResultPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {status.quiz && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Final quiz</CardTitle>
            {status.quiz.attempted && (
              <Badge variant="secondary">
                Best score: {Math.round(status.quiz.score ?? 0)}%
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {showQuiz ? (
              <QuizRunner enrollment={enrollment} item={FINAL_QUIZ_ITEM(status.quiz.config)} />
            ) : (
              <Button onClick={() => setShowQuiz(true)}>
                {status.quiz.attempted ? 'Retake final quiz' : 'Start final quiz'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {status.coding?.map((part) => (
        <Card key={part.problemId}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Final coding problem</CardTitle>
            <Badge variant={part.settled ? 'secondary' : 'outline'}>
              {part.settled ? `Settled · ${Math.round(part.bestScore ?? 0)}%` : 'Not settled'}
            </Badge>
          </CardHeader>
          <CardContent>
            {openProblemId === part.problemId ? (
              <CodingWorkspace enrollment={enrollment} final problemId={part.problemId} />
            ) : (
              <Button variant="outline" onClick={() => setOpenProblemId(part.problemId)}>
                Open problem
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {allSettled && (
        <Alert>
          <AlertDescription className="flex items-center gap-3">
            All parts settled — your result is being finalized.
            <Button size="sm" variant="outline" onClick={checkResult} disabled={resultPending}>
              Check result
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
