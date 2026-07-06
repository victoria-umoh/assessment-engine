'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { Category } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MaterialGenerate({ onCreated }: { onCreated: (id: string) => void }) {
  const [topic, setTopic] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!topic.trim() || !categoryId) {
      setError('Topic and category are required');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<{ _id: string }>('/admin/materials/generate', {
        method: 'POST',
        body: { topic: topic.trim(), numQuestions, categoryId },
      });
      onCreated(created._id);
    } catch (err) {
      // 503 when ANTHROPIC_API_KEY is unset — surface the API copy verbatim.
      setError(err instanceof ApiError ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="mg-topic">Topic</Label>
        <Input id="mg-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="mg-count">Questions (1–20)</Label>
          <Input
            id="mg-count"
            type="number"
            min={1}
            max={20}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mg-category">Category</Label>
          <select
            id="mg-category"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select…</option>
            {(categories.data ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        Generate
      </Button>
    </form>
  );
}
