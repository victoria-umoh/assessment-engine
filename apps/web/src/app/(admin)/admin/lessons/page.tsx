'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateLessonDto, UpdateLessonDto } from '@lms/shared';
import { apiFetch } from '@/lib/api';
import type { AdminLesson } from '@/lib/admin-types';
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
import { LessonForm } from '@/components/admin/lesson-form';

export default function LessonsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminLesson | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-lessons'] });

  const archive = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  async function create(dto: CreateLessonDto | UpdateLessonDto) {
    await apiFetch('/admin/lessons', { method: 'POST', body: dto });
    setCreateOpen(false);
    await invalidate();
  }

  async function saveEdit(dto: CreateLessonDto | UpdateLessonDto) {
    if (!editing) return;
    await apiFetch(`/admin/lessons/${editing._id}`, { method: 'PATCH', body: dto });
    setEditing(null);
    await invalidate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lessons</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New lesson</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New lesson</DialogTitle>
            </DialogHeader>
            <LessonForm onSubmit={create} />
          </DialogContent>
        </Dialog>
      </div>

      <CursorList<AdminLesson>
        queryKey={['admin-lessons']}
        path="/admin/lessons"
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Minutes</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((lesson) => (
                <TableRow key={lesson._id}>
                  <TableCell className="max-w-md truncate">{lesson.title}</TableCell>
                  <TableCell>{lesson.estMinutes}</TableCell>
                  <TableCell>{lesson.tags.join(', ')}</TableCell>
                  <TableCell>
                    <Badge variant={lesson.status === 'active' ? 'default' : 'secondary'}>
                      {lesson.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(lesson)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={lesson.status === 'archived' || archive.isPending}
                      onClick={() => archive.mutate(lesson._id)}
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
            <DialogTitle>Edit lesson</DialogTitle>
          </DialogHeader>
          {editing && <LessonForm initial={editing} onSubmit={saveEdit} submitLabel="Save changes" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
