'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminMaterialDetail } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/items/markdown';

export function MaterialEditor({
  material,
  onSaved,
}: {
  material: AdminMaterialDetail;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(material.title);
  // Editing always writes `content` — for uploads it starts from the
  // extracted text, so publishing an edit supersedes the raw extraction.
  const [content, setContent] = useState(material.content ?? material.extractedText ?? '');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/materials/${material._id}`, {
        method: 'PATCH',
        body: { title, content },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {material.status !== 'ready' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          Status: {material.status}
          {material.failureReason ? ` — ${material.failureReason}` : ''}
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="me-title">Title</Label>
        <Input id="me-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="me-content">Content (markdown)</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? 'Edit' : 'Preview'}
          </Button>
        </div>
        {preview ? (
          <div className="rounded-md border p-4">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <Textarea
            id="me-content"
            rows={16}
            className="font-mono"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={save} disabled={busy}>
        Save
      </Button>
    </div>
  );
}
