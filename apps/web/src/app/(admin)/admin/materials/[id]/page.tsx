'use client';

import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminMaterialDetail } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LinkedQuestions } from '@/components/admin/linked-questions';
import { MaterialEditor } from '@/components/admin/material-editor';

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const material = useQuery({
    queryKey: ['admin-material', params.id],
    queryFn: () => apiFetch<AdminMaterialDetail>(`/admin/materials/${params.id}`),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin-material', params.id] });

  if (material.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (material.isError) {
    return (
      <p className="text-destructive">
        {material.error instanceof ApiError ? material.error.message : 'Failed to load material'}
      </p>
    );
  }

  const m = material.data;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{m.title}</h1>
        <Badge variant="secondary">{m.source}</Badge>
        {m.archived && <Badge variant="destructive">archived</Badge>}
      </div>
      {m.file && (
        <p className="text-sm text-muted-foreground">
          {m.file.originalName} · {m.file.mimeType} · {Math.round(m.file.size / 1024)} KB
        </p>
      )}
      <MaterialEditor material={m} onSaved={refresh} />
      <Separator />
      <LinkedQuestions
        materialId={m._id}
        linkedQuestionIds={m.linkedQuestionIds}
        onChanged={refresh}
      />
    </div>
  );
}
