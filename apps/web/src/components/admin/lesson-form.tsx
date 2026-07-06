'use client';

import { useState } from 'react';
import {
  createLessonSchema,
  updateLessonSchema,
  type CreateLessonDto,
  type UpdateLessonDto,
} from '@lms/shared';
import { ApiError } from '@/lib/api';
import type { AdminLesson } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface BlockDraft {
  type: 'markdown' | 'video' | 'image';
  markdown?: string;
  url?: string;
  caption?: string;
}

export function LessonForm({
  initial,
  onSubmit,
  submitLabel = 'Save lesson',
}: {
  initial?: Partial<AdminLesson>;
  onSubmit: (dto: CreateLessonDto | UpdateLessonDto) => Promise<void>;
  submitLabel?: string;
}) {
  const isEdit = Boolean(initial?._id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [estMinutes, setEstMinutes] = useState(initial?.estMinutes ?? 5);
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    (initial?.contentBlocks as BlockDraft[] | undefined) ?? [],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function addBlock(type: BlockDraft['type']) {
    setBlocks((prev) => [...prev, { type }]);
  }

  function updateBlock(index: number, patch: Partial<BlockDraft>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const dto = {
      title,
      estMinutes,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      contentBlocks: blocks.map((b) =>
        b.type === 'markdown'
          ? { type: 'markdown' as const, markdown: b.markdown ?? '' }
          : {
              type: b.type,
              url: b.url ?? '',
              ...(b.caption?.trim() ? { caption: b.caption.trim() } : {}),
            },
      ),
    };
    const parsed = (isEdit ? updateLessonSchema : createLessonSchema).safeParse(dto);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      setErrors([
        ...flat.formErrors,
        ...Object.entries(flat.fieldErrors).map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`),
      ]);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Something went wrong']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="lf-title">Title</Label>
        <Input id="lf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lf-minutes">Estimated minutes</Label>
          <Input
            id="lf-minutes"
            type="number"
            min={1}
            value={estMinutes}
            onChange={(e) => setEstMinutes(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lf-tags">Tags (comma-separated)</Label>
          <Input id="lf-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Content blocks</span>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock('markdown')}>
            Add markdown
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock('video')}>
            Add video
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock('image')}>
            Add image
          </Button>
        </div>
        {blocks.map((block, index) => (
          <div key={index} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {block.type}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(index)}>
                Remove
              </Button>
            </div>
            {block.type === 'markdown' ? (
              <div className="space-y-1">
                <Label htmlFor={`lf-md-${index}`}>Markdown</Label>
                <Textarea
                  id={`lf-md-${index}`}
                  rows={4}
                  value={block.markdown ?? ''}
                  onChange={(e) => updateBlock(index, { markdown: e.target.value })}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`lf-url-${index}`}>
                    {block.type === 'video' ? 'Video URL' : 'Image URL'}
                  </Label>
                  <Input
                    id={`lf-url-${index}`}
                    value={block.url ?? ''}
                    onChange={(e) => updateBlock(index, { url: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`lf-caption-${index}`}>Caption</Label>
                  <Input
                    id={`lf-caption-${index}`}
                    value={block.caption ?? ''}
                    onChange={(e) => updateBlock(index, { caption: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
