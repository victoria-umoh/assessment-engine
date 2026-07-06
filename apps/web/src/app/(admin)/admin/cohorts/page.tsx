'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { AdminCohort, AdminTrack } from '@/lib/admin-types';
import type { Paginated } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';
import { CohortForm, type CohortFormValues } from '@/components/admin/cohort-form';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  scheduled: 'secondary',
  completed: 'secondary',
  archived: 'destructive',
};

export default function CohortsPage() {
  const queryClient = useQueryClient();
  const [trackFilter, setTrackFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCohort | null>(null);

  const tracks = useQuery({
    queryKey: ['ref-tracks'],
    queryFn: () => apiFetch<Paginated<AdminTrack>>('/admin/tracks?limit=100'),
  });
  const trackList = tracks.data?.items ?? [];
  const trackTitle = new Map(trackList.map((t) => [t._id, t.title]));

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-cohorts'] });

  async function create(dto: CohortFormValues) {
    await apiFetch('/admin/cohorts', { method: 'POST', body: dto });
    setCreateOpen(false);
    await invalidate();
  }

  async function saveEdit(dto: CohortFormValues) {
    if (!editing) return;
    await apiFetch(`/admin/cohorts/${editing._id}`, { method: 'PATCH', body: dto });
    setEditing(null);
    await invalidate();
  }

  const path = trackFilter ? `/admin/cohorts?trackId=${trackFilter}` : '/admin/cohorts';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Cohorts</h1>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="cp-track">Track</Label>
            <select
              id="cp-track"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
            >
              <option value="">All tracks</option>
              {trackList.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>New cohort</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New cohort</DialogTitle>
              </DialogHeader>
              <CohortForm tracks={trackList} onSubmit={create} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <CursorList<AdminCohort>
        queryKey={['admin-cohorts', trackFilter]}
        path={path}
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Invite code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((cohort) => (
                <TableRow key={cohort._id}>
                  <TableCell>
                    <Link href={`/admin/cohorts/${cohort._id}`} className="hover:underline">
                      {cohort.name}
                    </Link>
                  </TableCell>
                  <TableCell>{trackTitle.get(cohort.trackId) ?? '—'}</TableCell>
                  <TableCell>{cohort.startDate.slice(0, 10)}</TableCell>
                  <TableCell>{cohort.capacity ?? '∞'}</TableCell>
                  <TableCell>
                    {cohort.inviteCode ? (
                      <span className="flex items-center gap-2">
                        <code className="text-sm">{cohort.inviteCode}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Copy invite code"
                          onClick={() => void navigator.clipboard.writeText(cohort.inviteCode!)}
                        >
                          Copy
                        </Button>
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[cohort.status] ?? 'secondary'}>
                      {cohort.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(cohort)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit cohort</DialogTitle>
          </DialogHeader>
          {editing && (
            <CohortForm
              initial={editing}
              tracks={trackList}
              onSubmit={saveEdit}
              submitLabel="Save changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
