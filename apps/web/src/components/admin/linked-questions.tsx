'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateQuestionDto, UpdateQuestionDto } from '@lms/shared';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminQuestion } from '@/lib/admin-types';
import type { Paginated } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { QuestionForm } from '@/components/admin/question-form';

export function LinkedQuestions({
  materialId,
  linkedQuestionIds,
  onChanged,
}: {
  materialId: string;
  linkedQuestionIds: string[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = useQuery({
    queryKey: ['material-questions', materialId],
    queryFn: () =>
      apiFetch<Paginated<AdminQuestion>>(`/admin/questions?materialId=${materialId}&limit=100`),
  });

  async function patchLinks(next: string[]) {
    setError(null);
    try {
      await apiFetch(`/admin/materials/${materialId}`, {
        method: 'PATCH',
        body: { linkedQuestionIds: next },
      });
      await queryClient.invalidateQueries({ queryKey: ['material-questions', materialId] });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  async function addQuestion(dto: CreateQuestionDto | UpdateQuestionDto) {
    const created = await apiFetch<{ _id: string }>('/admin/questions', {
      method: 'POST',
      body: dto,
    });
    await patchLinks([...linkedQuestionIds, created._id]);
    setAddOpen(false);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comprehension questions</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Add question
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New comprehension question</DialogTitle>
            </DialogHeader>
            <QuestionForm materialId={materialId} onSubmit={addQuestion} />
          </DialogContent>
        </Dialog>
      </div>

      {questions.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (questions.data?.items.length ?? 0) === 0 ? (
        <p className="text-muted-foreground">No questions linked yet.</p>
      ) : (
        <ul className="space-y-2">
          {questions.data!.items.map((q) => (
            <li key={q._id} className="flex items-center justify-between rounded-md border p-3">
              <span className="truncate text-sm">{q.prompt}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patchLinks(linkedQuestionIds.filter((id) => id !== q._id))}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
