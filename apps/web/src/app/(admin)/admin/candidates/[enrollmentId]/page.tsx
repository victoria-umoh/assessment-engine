'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { EnrollmentDetail } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ResultCard } from '@/components/result/result-card';

function formatDate(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '—';
}

export default function CandidateDetailPage() {
  const params = useParams<{ enrollmentId: string }>();
  const detail = useQuery({
    queryKey: ['enrollment-detail', params.enrollmentId],
    queryFn: () => apiFetch<EnrollmentDetail>(`/admin/enrollments/${params.enrollmentId}/detail`),
  });

  if (detail.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (detail.isError) {
    return (
      <p className="text-destructive">
        {detail.error instanceof ApiError ? detail.error.message : 'Failed to load enrollment'}
      </p>
    );
  }

  const { enrollment, user, track, attempts, submissions, result } = detail.data;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{user?.name ?? enrollment.userId}</h1>
        <Badge variant={enrollment.status === 'failed' ? 'destructive' : 'default'}>
          {enrollment.status}
        </Badge>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Track</p>
            <p>{track?.title ?? enrollment.trackId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Started</p>
            <p>{enrollment.startDate.slice(0, 10)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Day</p>
            <p>
              {enrollment.unlockedDay}
              {track ? ` of ${track.durationDays}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Item progress</h2>
        {enrollment.itemProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing attempted yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollment.itemProgress.map((p) => (
                <TableRow key={p.itemId}>
                  <TableCell>
                    <code className="text-xs">…{p.itemId.slice(-6)}</code>
                  </TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell>{p.score ?? '—'}</TableCell>
                  <TableCell>{p.attempts}</TableCell>
                  <TableCell>{formatDate(p.completedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Quiz attempts</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attempts.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((a) => (
                <TableRow key={a._id}>
                  <TableCell>
                    <code className="text-xs">…{a.quizItemId.slice(-6)}</code>
                  </TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>
                    {a.score !== undefined
                      ? a.score
                      : a.traitScores
                        ? 'profile'
                        : '—'}
                  </TableCell>
                  <TableCell>{formatDate(a.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Code submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Problem</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => (
                <TableRow key={s._id}>
                  <TableCell>
                    <code className="text-xs">…{s.problemId.slice(-6)}</code>
                  </TableCell>
                  <TableCell>{s.final ? 'yes' : 'no'}</TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell>{s.score}</TableCell>
                  <TableCell>{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Result</h2>
        {result ? (
          <ResultCard result={result} />
        ) : (
          <p className="text-sm text-muted-foreground">No result yet.</p>
        )}
      </section>
    </div>
  );
}
