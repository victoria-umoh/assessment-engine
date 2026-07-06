'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AnalyticsOverview } from '@/lib/admin-types';
import { StatCard } from '@/components/admin/stat-card';

export default function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiFetch<AnalyticsOverview>('/admin/analytics/overview'),
  });

  if (overview.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (overview.isError) {
    return <p className="text-destructive">{(overview.error as Error).message}</p>;
  }

  const data = overview.data;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={data.users.total}
          hint={`${data.users.admins} admins · ${data.users.candidates} candidates · ${data.users.disabled} disabled`}
        />
        <StatCard label="Published tracks" value={data.tracks.published} hint={`${data.tracks.draft} drafts`} />
        <StatCard
          label="Active cohorts"
          value={data.cohorts.active}
          hint={`${data.cohorts.scheduled} scheduled`}
        />
        <StatCard
          label="Active enrollments"
          value={data.enrollments.active}
          hint={`${data.enrollments.completed} completed · ${data.enrollments.failed} failed`}
        />
        <StatCard
          label="Queued submissions"
          value={data.submissions.queued}
          hint={`${data.submissions.running} running`}
        />
      </div>
    </div>
  );
}
