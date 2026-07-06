'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnswerMap, answeredCount, setAnswer, toSubmitDto } from '@/components/quiz/answers';
import { QuestionCard } from '@/components/quiz/question-card';
import { useCountdown } from '@/components/quiz/use-countdown';
import { apiFetch, ApiError } from '@/lib/api';
import type { AttemptQuestion, Enrollment, QuizAttemptView, SubmitQuizResult, TrackItem } from '@/lib/types';

const LIKERT_REVIEW_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

// Settled attempts echo the raw answer (presented indices); render it in the
// candidate's own terms for review.
function formatAnswer(q: AttemptQuestion, answer: unknown): string | null {
  if (answer === undefined || answer === null) return null;
  if (q.type === 'mcq' && typeof answer === 'number') return q.options?.[answer] ?? String(answer);
  if (q.type === 'multi' && Array.isArray(answer)) {
    return answer.map((i) => (typeof i === 'number' ? (q.options?.[i] ?? String(i)) : String(i))).join(', ');
  }
  if (q.type === 'likert' && typeof answer === 'number') {
    return LIKERT_REVIEW_LABELS[answer - 1] ?? String(answer);
  }
  return String(answer);
}

function Countdown({
  startedAt,
  timeLimitSec,
  onExpire,
  serverNow,
}: {
  startedAt: string;
  timeLimitSec: number;
  onExpire: () => void;
  serverNow?: string;
}) {
  const { secondsLeft, display } = useCountdown(startedAt, timeLimitSec, onExpire, serverNow);
  return (
    <Badge variant={secondsLeft <= 60 ? 'destructive' : 'secondary'} className="text-sm tabular-nums">
      {display}
    </Badge>
  );
}

export function QuizRunner({
  enrollment,
  item,
  reviewAttemptId,
}: {
  enrollment: Enrollment;
  item: TrackItem;
  reviewAttemptId?: string;
}) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<QuizAttemptView | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<SubmitQuizResult | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | undefined>(reviewAttemptId);

  const progress = enrollment.itemProgress.find((p) => p.itemId === item.itemId);
  // config can be ABSENT on saved items (mongoose minimize strips {}).
  const config = (item.config ?? {}) as {
    count?: number;
    timeLimitSec?: number;
    maxAttempts?: number;
  };

  // Review mode: a settled attempt id renders its per-question correctness.
  const review = useQuery({
    queryKey: ['quiz-attempts', reviewId],
    queryFn: () => apiFetch<QuizAttemptView>(`/quiz-attempts/${reviewId}`),
    enabled: !!reviewId,
  });

  const start = useMutation({
    mutationFn: () =>
      apiFetch<QuizAttemptView>(
        `/enrollments/${enrollment._id}/items/${item.itemId}/quiz-attempts`,
        { method: 'POST' },
      ),
    onSuccess: (view) => {
      setAttempt(view);
      setAnswers({});
    },
    onError: (err) => {
      setBlocked(err instanceof ApiError ? err.message : 'Could not start the quiz');
    },
  });

  const submit = useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch<SubmitQuizResult>(`/quiz-attempts/${attemptId}/submit`, {
        method: 'POST',
        body: toSubmitDto(answers),
      }),
    onSuccess: async (res) => {
      setResult(res);
      await queryClient.invalidateQueries({ queryKey: ['enrollments', enrollment._id] });
    },
    onError: (err) => {
      setBlocked(err instanceof ApiError ? err.message : 'Could not submit the quiz');
    },
  });

  if (blocked) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {blocked}{' '}
          <Link href={`/enrollments/${enrollment._id}`} className="underline">
            Back to track
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (reviewId && review.data) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Attempt review</h2>
        {typeof review.data.score === 'number' && (
          <p className="text-sm text-muted-foreground">Score: {Math.round(review.data.score)}%</p>
        )}
        {review.data.questions.map((q, i) => {
          const chosen = formatAnswer(q, q.answer);
          return (
            <div key={String(q.questionId)} className="flex items-start gap-2">
              <div className="flex-1 space-y-1">
                <QuestionCard index={i} question={q} value={undefined} onChange={() => {}} />
                {chosen !== null && (
                  <p className="text-sm text-muted-foreground">Your answer: {chosen}</p>
                )}
              </div>
              {q.correct !== undefined && (
                <Badge variant={q.correct ? 'secondary' : 'destructive'}>
                  {q.correct ? 'Correct' : 'Incorrect'}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (result) {
    const profileOnly = result.score === undefined || result.score === null;
    const newlyUnlocked = result.unlockState.unlockedDay > enrollment.unlockedDay;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {profileOnly ? 'Profile recorded' : `Score: ${Math.round(result.score!)}%`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!profileOnly && (
            <p className="text-sm text-muted-foreground">
              {result.correctCount}/{result.total} correct
            </p>
          )}
          {newlyUnlocked && (
            <Alert>
              <AlertDescription>Day {result.unlockState.unlockedDay} unlocked 🎉</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewId(result.attemptId)}
            >
              Review answers
            </Button>
            <Link href={`/enrollments/${enrollment._id}`} className="text-sm underline">
              Back to track
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!attempt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiz</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-sm text-muted-foreground">
            {config.count !== undefined && <li>{config.count} questions</li>}
            <li>{Math.round((config.timeLimitSec ?? 900) / 60)} minute time limit</li>
            {config.maxAttempts !== undefined && <li>{config.maxAttempts} attempts allowed</li>}
            {progress && progress.attempts > 0 && <li>{progress.attempts} attempt(s) used</li>}
          </ul>
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {progress && progress.attempts > 0 ? 'Start again' : 'Start quiz'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const submitNow = () => {
    if (!submit.isPending && !result) submit.mutate(attempt._id);
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border bg-background px-3 py-2">
        <span className="text-sm text-muted-foreground">
          {answeredCount(answers)}/{attempt.questions.length} answered
        </span>
        <Countdown
          startedAt={attempt.startedAt}
          timeLimitSec={attempt.timeLimitSec}
          onExpire={submitNow}
          serverNow={attempt.serverNow}
        />
      </div>
      {attempt.questions.map((q, i) => (
        <QuestionCard
          key={String(q.questionId)}
          index={i}
          question={q}
          value={answers[String(q.questionId)]}
          onChange={(value) =>
            setAnswers((m) => setAnswer(m, String(q.questionId), q.type ?? 'mcq', value))
          }
        />
      ))}
      <Button
        className="w-full"
        disabled={submit.isPending}
        onClick={() => {
          if (
            answeredCount(answers) < attempt.questions.length &&
            !window.confirm('Some questions are unanswered. Submit anyway?')
          ) {
            return;
          }
          submitNow();
        }}
      >
        Submit
      </Button>
    </div>
  );
}
