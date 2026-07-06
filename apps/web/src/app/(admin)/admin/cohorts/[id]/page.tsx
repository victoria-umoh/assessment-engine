'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { CohortDashboard } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/admin/stat-card';

export default function CohortDashboardPage() {
  const params = useParams<{ id: string }>();
  const dashboard = useQuery({
    queryKey: ['cohort-dashboard', params.id],
    queryFn: () => apiFetch<CohortDashboard>(`/admin/cohorts/${params.id}/dashboard`),
  });

  if (dashboard.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (dashboard.isError) {
    return (
      <p className="text-destructive">
        {dashboard.error instanceof ApiError ? dashboard.error.message : 'Failed to load cohort'}
      </p>
    );
  }

  const { cohort, stats, candidates } = dashboard.data;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{cohort.name}</h1>
          <Badge variant={cohort.status === 'active' ? 'default' : 'secondary'}>
            {cohort.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {cohort.trackTitle} · starts {cohort.startDate.slice(0, 10)}
          {cohort.capacity ? ` · ${stats.enrolled}/${cohort.capacity} enrolled` : ''}
          {cohort.inviteCode ? (
            <>
              {' · invite '}
              <code>{cohort.inviteCode}</code>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Enrolled" value={stats.enrolled} />
        <StatCard label="Pass" value={stats.verdicts.pass} />
        <StatCard label="Fail" value={stats.verdicts.fail} />
        <StatCard label="Pending" value={stats.verdicts.pending} />
        <StatCard
          label="Avg weighted score"
          value={
            // weightedTotal is already 0–100 (scoring.engine), not 0–1.
            stats.avgWeightedTotal !== null ? `${Math.round(stats.avgWeightedTotal)}%` : '—'
          }
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Day</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Verdict</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((row) => (
            <TableRow key={row.enrollmentId}>
              <TableCell>
                <Link href={`/admin/candidates/${row.enrollmentId}`} className="hover:underline">
                  {row.name ?? row.userId}
                </Link>
                <p className="text-xs text-muted-foreground">{row.email}</p>
              </TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>{row.unlockedDay}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    className="w-24"
                    value={row.requiredTotal > 0 ? (row.requiredComplete / row.requiredTotal) * 100 : 0}
                  />
                  <span className="text-xs text-muted-foreground">
                    {row.requiredComplete}/{row.requiredTotal}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {row.weightedTotal !== undefined ? `${Math.round(row.weightedTotal)}%` : '—'}
              </TableCell>
              <TableCell>
                {row.verdict ? (
                  <Badge variant={row.verdict === 'pass' ? 'default' : 'destructive'}>
                    {row.verdict}
                  </Badge>
                ) : (
                  <Badge variant="secondary">pending</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
