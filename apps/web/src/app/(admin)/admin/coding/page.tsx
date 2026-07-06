'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateCodingProblemDto, UpdateCodingProblemDto } from '@lms/shared';
import { apiFetch } from '@/lib/api';
import type { AdminCodingProblem } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';
import { CodingProblemForm } from '@/components/admin/coding-problem-form';

export default function CodingPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCodingProblem | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-coding'] });

  const archive = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/coding-problems/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  async function create(dto: CreateCodingProblemDto | UpdateCodingProblemDto) {
    await apiFetch('/admin/coding-problems', { method: 'POST', body: dto });
    setCreateOpen(false);
    await invalidate();
  }

  async function saveEdit(dto: CreateCodingProblemDto | UpdateCodingProblemDto) {
    if (!editing) return;
    await apiFetch(`/admin/coding-problems/${editing._id}`, { method: 'PATCH', body: dto });
    setEditing(null);
    await invalidate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Coding problems</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New problem</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New coding problem</DialogTitle>
            </DialogHeader>
            <CodingProblemForm onSubmit={create} />
          </DialogContent>
        </Dialog>
      </div>

      <CursorList<AdminCodingProblem>
        queryKey={['admin-coding']}
        path="/admin/coding-problems"
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Languages</TableHead>
                <TableHead>Test cases</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((problem) => (
                <TableRow key={problem._id}>
                  <TableCell className="max-w-md truncate">{problem.title}</TableCell>
                  <TableCell>{problem.difficulty}</TableCell>
                  <TableCell>{problem.languages.join(', ')}</TableCell>
                  <TableCell>{problem.testCases.length}</TableCell>
                  <TableCell>
                    <Badge variant={problem.status === 'active' ? 'default' : 'secondary'}>
                      {problem.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(problem)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={problem.status === 'archived' || archive.isPending}
                      onClick={() => archive.mutate(problem._id)}
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
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit coding problem</DialogTitle>
          </DialogHeader>
          {editing && (
            <CodingProblemForm initial={editing} onSubmit={saveEdit} submitLabel="Save changes" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
