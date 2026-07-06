'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Editor } from '@/components/coding/editor';
import { pollInterval, selectableLanguages } from '@/components/coding/poll';
import { SubmissionResult } from '@/components/coding/submission-result';
import { Markdown } from '@/components/items/markdown';
import { apiFetch, ApiError } from '@/lib/api';
import type { CandidateProblemView, Enrollment, Paginated, SubmissionView, TrackItem } from '@/lib/types';

export function CodingWorkspace({
  enrollment,
  item,
  final = false,
  problemId,
}: {
  enrollment: Enrollment;
  item?: TrackItem;
  final?: boolean;
  problemId?: string;
}) {
  const queryClient = useQueryClient();
  const targetProblemId = problemId ?? item?.refId;
  const [language, setLanguage] = useState<string | null>(null);
  const [code, setCode] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problem = useQuery({
    queryKey: ['coding-problems', targetProblemId],
    queryFn: () => apiFetch<CandidateProblemView>(`/coding-problems/${targetProblemId}`),
    enabled: !!targetProblemId,
  });

  // The owner list is cursor-paginated ({ items, nextCursor }); the server
  // filters by problemId so page 1 IS this problem's history, not page 1 of
  // everything (P5 rider closed in Phase 7).
  const history = useQuery({
    queryKey: ['enrollments', enrollment._id, 'submissions', String(targetProblemId)],
    queryFn: () =>
      apiFetch<Paginated<SubmissionView>>(
        `/enrollments/${enrollment._id}/submissions?problemId=${targetProblemId}`,
      ),
    enabled: !!targetProblemId,
  });

  const active = useQuery({
    queryKey: ['submissions', activeSubmissionId],
    queryFn: () => apiFetch<SubmissionView>(`/submissions/${activeSubmissionId}`),
    enabled: !!activeSubmissionId,
    refetchInterval: (query) => pollInterval(query.state.data),
  });

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<SubmissionView>('/submissions', { method: 'POST', body }),
    onSuccess: async (created) => {
      setError(null);
      setActiveSubmissionId(created._id);
      await queryClient.invalidateQueries({
        queryKey: ['enrollments', enrollment._id, 'submissions'],
      });
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // A submission is already in flight — pick it up and poll it instead.
        const list = await queryClient.fetchQuery({
          queryKey: ['enrollments', enrollment._id, 'submissions'],
          queryFn: () =>
            apiFetch<Paginated<SubmissionView>>(`/enrollments/${enrollment._id}/submissions`),
        });
        const inFlight = list.items.find(
          (s) =>
            String(s.problemId) === String(targetProblemId) &&
            (s.status === 'queued' || s.status === 'running'),
        );
        if (inFlight) {
          setActiveSubmissionId(inFlight._id);
          return;
        }
      }
      setError(err instanceof Error ? err.message : 'Submission failed');
    },
  });

  if (problem.isLoading || !targetProblemId) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!problem.data) {
    return <p className="text-destructive">Problem unavailable.</p>;
  }

  const languages = selectableLanguages(problem.data.languages);
  const currentLanguage = language ?? languages[0];
  const currentCode =
    code[currentLanguage] ?? problem.data.starterCode[currentLanguage] ?? '';

  const problemSubmissions = (history.data?.items ?? []).filter(
    (s) => String(s.problemId) === String(targetProblemId) && s.final === final,
  );

  function switchLanguage(next: string) {
    if (touched && !window.confirm('Replace your code with the starter for this language?')) {
      return;
    }
    setLanguage(next);
    setTouched(false);
    setCode((c) => ({ ...c, [next]: problem.data!.starterCode[next] ?? '' }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{problem.data.title}</h1>
        <Markdown>{problem.data.statement}</Markdown>
        {problem.data.visibleTestCases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sample cases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm font-mono">
              {problem.data.visibleTestCases.map((tc, i) => (
                <div key={i} className="rounded-md bg-muted p-2">
                  <div>stdin: {tc.input}</div>
                  <div>expected: {tc.expectedOutput}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">
          Limits: {problem.data.limits.cpuTimeSec}s CPU · {Math.round(problem.data.limits.memoryKb / 1024)} MB
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <label htmlFor="language" className="text-sm">
            Language
          </label>
          <select
            id="language"
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={currentLanguage}
            onChange={(e) => switchLanguage(e.target.value)}
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <Editor
          language={currentLanguage}
          value={currentCode}
          onChange={(v) => {
            setTouched(true);
            setCode((c) => ({ ...c, [currentLanguage]: v }));
          }}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          className="w-full"
          disabled={submit.isPending || (!!active.data && pollInterval(active.data) !== false)}
          onClick={() =>
            submit.mutate({
              enrollmentId: enrollment._id,
              ...(final ? { final: true } : { itemId: item!.itemId }),
              problemId: targetProblemId,
              language: currentLanguage,
              sourceCode: currentCode,
            })
          }
        >
          Submit
        </Button>

        {active.data && <SubmissionResult submission={active.data} />}

        {problemSubmissions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Previous submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {problemSubmissions.map((s) => (
                <div key={s._id} className="flex items-center gap-3 text-sm">
                  <Badge
                    variant={
                      s.status === 'passed'
                        ? 'secondary'
                        : s.status === 'queued' || s.status === 'running'
                          ? 'outline'
                          : 'destructive'
                    }
                  >
                    {s.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {s.language} · {Math.round(s.score)}%
                    {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleString()}` : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
