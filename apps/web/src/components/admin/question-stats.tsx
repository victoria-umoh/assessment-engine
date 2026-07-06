'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Category, QuestionStat } from '@/lib/admin-types';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function QuestionStats() {
  const [categoryId, setCategoryId] = useState('');

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });
  const stats = useQuery({
    queryKey: ['question-stats', categoryId],
    queryFn: () =>
      apiFetch<QuestionStat[]>(
        categoryId ? `/admin/analytics/questions?categoryId=${categoryId}` : '/admin/analytics/questions',
      ),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="text-lg font-semibold">Question performance</h2>
        <div className="space-y-1">
          <Label htmlFor="qs-category">Category</Label>
          <select
            id="qs-category"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {stats.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : stats.isError ? (
        <p className="text-destructive">{(stats.error as Error).message}</p>
      ) : stats.data.length === 0 ? (
        <p className="text-muted-foreground">No answered questions yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead className="w-24 text-right">Served</TableHead>
              <TableHead className="w-28 text-right">Correct rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.data.map((s) => (
              <TableRow key={s.questionId}>
                <TableCell className="max-w-md truncate">{s.prompt ?? s.questionId}</TableCell>
                <TableCell className="text-right">{s.served}</TableCell>
                <TableCell className="text-right">{Math.round(s.correctRate * 100)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
