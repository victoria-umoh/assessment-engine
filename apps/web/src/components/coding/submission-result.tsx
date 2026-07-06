'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { SubmissionView } from '@/lib/types';

const STATUS_STYLE: Record<SubmissionView['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'Queued…', variant: 'outline' },
  running: { label: 'Running…', variant: 'outline' },
  passed: { label: 'Passed', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'destructive' },
  error: { label: 'Grading error', variant: 'destructive' },
};

export function SubmissionResult({ submission }: { submission: SubmissionView }) {
  // Unknown/future statuses must render, not crash (a white screen mid-exam).
  const style = STATUS_STYLE[submission.status] ?? {
    label: submission.status,
    variant: 'outline' as const,
  };
  const settled = ['passed', 'failed', 'error'].includes(submission.status);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge variant={style.variant}>{style.label}</Badge>
        {settled && submission.status !== 'error' && (
          <span className="text-sm text-muted-foreground">
            Score: {Math.round(submission.score * 10) / 10}%
          </span>
        )}
      </div>
      {submission.status === 'error' && (
        <Alert>
          <AlertDescription>
            Grading failed on our side — this did not consume an attempt. Resubmit when ready.
          </AlertDescription>
        </Alert>
      )}
      {submission.testResults.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-4">Case</th>
              <th className="py-1 pr-4">Status</th>
              <th className="py-1 pr-4">Output</th>
              <th className="py-1">Time</th>
            </tr>
          </thead>
          <tbody>
            {submission.testResults.map((r) => {
              // Explicit flag from the server — a visible case with no stdout
              // must not read as hidden (P5 rider).
              const hidden = r.hidden === true;
              return (
                <tr key={r.caseIndex} className="border-b last:border-0">
                  <td className="py-1 pr-4">#{r.caseIndex + 1}</td>
                  <td className="py-1 pr-4">
                    <Badge variant={r.status === 'passed' ? 'secondary' : 'destructive'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-1 pr-4 font-mono">
                    {hidden ? (
                      <span className="text-muted-foreground">hidden</span>
                    ) : r.stdout === undefined || r.stdout.trim() === '' ? (
                      <span className="text-muted-foreground">(no output)</span>
                    ) : (
                      <pre className="whitespace-pre-wrap">{r.stdout.trim()}</pre>
                    )}
                  </td>
                  <td className="py-1">{r.time !== undefined ? `${r.time}s` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
