'use client';

import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateTrackDto } from '@lms/shared';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminCodingProblem, AdminLesson, AdminMaterialRow, AdminTrack, Category } from '@/lib/admin-types';
import type { Paginated } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { TrackBuilder } from '@/components/admin/track-builder';
import type { RefOptions } from '@/components/admin/item-editor';

export default function TrackBuilderPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const track = useQuery({
    queryKey: ['admin-track', params.id],
    queryFn: () => apiFetch<AdminTrack>(`/admin/tracks/${params.id}`),
  });
  const lessons = useQuery({
    queryKey: ['ref-lessons'],
    queryFn: () => apiFetch<Paginated<AdminLesson>>('/admin/lessons?limit=100'),
  });
  const materials = useQuery({
    queryKey: ['ref-materials'],
    queryFn: () => apiFetch<Paginated<AdminMaterialRow>>('/admin/materials?limit=100'),
  });
  const problems = useQuery({
    queryKey: ['ref-problems'],
    queryFn: () => apiFetch<Paginated<AdminCodingProblem>>('/admin/coding-problems?limit=100'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });

  if (track.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (track.isError) {
    return (
      <p className="text-destructive">
        {track.error instanceof ApiError ? track.error.message : 'Failed to load track'}
      </p>
    );
  }

  const refOptions: RefOptions = {
    lessons: (lessons.data?.items ?? []).map((l) => ({ _id: l._id, title: l.title })),
    materials: (materials.data?.items ?? []).map((m) => ({ _id: m._id, title: m.title })),
    problems: (problems.data?.items ?? []).map((p) => ({ _id: p._id, title: p.title })),
    categories: (categories.data ?? []).map((c) => ({ _id: c._id, name: c.name })),
  };

  async function save(dto: UpdateTrackDto) {
    await apiFetch(`/admin/tracks/${params.id}`, { method: 'PATCH', body: dto });
    await queryClient.invalidateQueries({ queryKey: ['admin-track', params.id] });
  }

  async function publish() {
    await apiFetch(`/admin/tracks/${params.id}/publish`, { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: ['admin-track', params.id] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Track builder</h1>
        <Badge variant={track.data.status === 'published' ? 'default' : 'secondary'}>
          {track.data.status}
        </Badge>
      </div>
      <TrackBuilder
        // Remount when the SERVER document actually changes (payload updatedAt)
        // — keying on query dataUpdatedAt wiped unsaved drafts on every
        // reconnect refetch (P6 review rider).
        key={`${track.data._id}-${track.data.status}-${track.data.updatedAt ?? ''}`}
        track={track.data}
        refOptions={refOptions}
        onSave={save}
        onPublish={publish}
      />
    </div>
  );
}
