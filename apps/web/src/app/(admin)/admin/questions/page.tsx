'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateQuestionDto, UpdateQuestionDto } from '@lms/shared';
import { apiFetch } from '@/lib/api';
import type { AdminQuestion, Category } from '@/lib/admin-types';
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
import { QuestionForm } from '@/components/admin/question-form';
import { QuestionStats } from '@/components/admin/question-stats';

const FILTER_SELECT =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';

export default function QuestionsPage() {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });
  const categoryName = new Map((categories.data ?? []).map((c) => [c._id, c.name]));

  const params = new URLSearchParams();
  if (categoryId) params.set('categoryId', categoryId);
  if (type) params.set('type', type);
  if (difficulty) params.set('difficulty', difficulty);
  if (status) params.set('status', status);
  const qs = params.toString();
  const path = qs ? `/admin/questions?${qs}` : '/admin/questions';

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-questions'] });

  const archive = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/questions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  async function create(dto: CreateQuestionDto | UpdateQuestionDto) {
    await apiFetch('/admin/questions', { method: 'POST', body: dto });
    setCreateOpen(false);
    await invalidate();
  }

  async function saveEdit(dto: CreateQuestionDto | UpdateQuestionDto) {
    if (!editing) return;
    await apiFetch(`/admin/questions/${editing._id}`, { method: 'PATCH', body: dto });
    setEditing(null);
    await invalidate();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Question pool</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New question</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New question</DialogTitle>
            </DialogHeader>
            <QuestionForm onSubmit={create} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="qp-category">Category</Label>
          <select
            id="qp-category"
            className={FILTER_SELECT}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All</option>
            {(categories.data ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qp-type">Type</Label>
          <select
            id="qp-type"
            className={FILTER_SELECT}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All</option>
            <option value="mcq">mcq</option>
            <option value="multi">multi</option>
            <option value="text">text</option>
            <option value="likert">likert</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qp-difficulty">Difficulty</Label>
          <select
            id="qp-difficulty"
            className={FILTER_SELECT}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">All</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qp-status">Status</Label>
          <select
            id="qp-status"
            className={FILTER_SELECT}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <CursorList<AdminQuestion>
        queryKey={['admin-questions', qs]}
        path={path}
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((q) => (
                <TableRow key={q._id}>
                  <TableCell className="max-w-md truncate">{q.prompt}</TableCell>
                  <TableCell>{q.type}</TableCell>
                  <TableCell>{categoryName.get(q.categoryId) ?? '—'}</TableCell>
                  <TableCell>{q.difficulty}</TableCell>
                  <TableCell>
                    <Badge variant={q.status === 'active' ? 'default' : 'secondary'}>
                      {q.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(q)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={q.status === 'archived' || archive.isPending}
                      onClick={() => archive.mutate(q._id)}
                    >
                      Archive
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit question</DialogTitle>
          </DialogHeader>
          {editing && (
            <QuestionForm initial={editing} onSubmit={saveEdit} submitLabel="Save changes" />
          )}
        </DialogContent>
      </Dialog>

      <QuestionStats />
    </div>
  );
}
