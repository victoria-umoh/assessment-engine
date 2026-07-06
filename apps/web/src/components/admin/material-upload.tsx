'use client';

import { useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MaterialUpload({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!title.trim() || !file) {
      setError('Title and file are required');
      return;
    }
    const form = new FormData();
    form.set('title', title.trim());
    form.set('file', file);
    setBusy(true);
    try {
      const created = await apiFetch<{ _id: string }>('/admin/materials/upload', {
        method: 'POST',
        body: form,
      });
      onCreated(created._id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="mu-title">Title</Label>
        <Input id="mu-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="mu-file">File</Label>
        <Input id="mu-file" ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        Upload
      </Button>
    </form>
  );
}
