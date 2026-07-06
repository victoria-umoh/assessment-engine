'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Track day item draft. itemId is SERVER-generated — new items post without
// one and pick it up when the saved track is re-read.
export interface DraftItem {
  itemId?: string;
  type: 'lesson' | 'reading' | 'quiz' | 'coding' | 'exercise';
  refId?: string;
  config: Record<string, unknown>;
}

export interface RefOptions {
  lessons: Array<{ _id: string; title: string }>;
  materials: Array<{ _id: string; title: string }>;
  problems: Array<{ _id: string; title: string }>;
  categories: Array<{ _id: string; name: string }>;
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';

export function ItemEditor({
  item,
  refOptions,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  refOptions: RefOptions;
  onChange: (next: DraftItem) => void;
  onRemove: () => void;
}) {
  // Stable per-instance ids for label wiring.
  const id = useId();

  function setConfig(patch: Record<string, unknown>) {
    onChange({ ...item, config: { ...item.config, ...patch } });
  }

  const refSelect = (
    label: string,
    options: Array<{ _id: string; title: string }>,
  ): React.ReactNode => (
    <div className="min-w-56 space-y-1">
      <Label htmlFor={`ie-ref-${id}`}>{label}</Label>
      <select
        id={`ie-ref-${id}`}
        className={SELECT_CLASS}
        value={item.refId ?? ''}
        onChange={(e) => onChange({ ...item, refId: e.target.value || undefined })}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o._id} value={o._id}>
            {o.title}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-muted-foreground">{item.type}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={item.config.required !== false}
              onChange={(e) => setConfig({ required: e.target.checked })}
              aria-label="Required"
            />
            Required
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>

      {item.type === 'lesson' && refSelect('Lesson', refOptions.lessons)}
      {item.type === 'reading' && refSelect('Reading material', refOptions.materials)}
      {item.type === 'coding' && refSelect('Coding problem', refOptions.problems)}

      {item.type === 'quiz' && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Categories (blank = all)</legend>
          <div className="flex flex-wrap gap-3">
            {refOptions.categories.map((cat) => {
              const selected = (item.config.categoryIds as string[] | undefined) ?? [];
              const checked = selected.includes(cat._id);
              return (
                <label key={cat._id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={cat.name}
                    onChange={() => {
                      const next = checked
                        ? selected.filter((id) => id !== cat._id)
                        : [...selected, cat._id];
                      setConfig({ categoryIds: next.length > 0 ? next : undefined });
                    }}
                  />
                  {cat.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {(item.type === 'quiz' || item.type === 'reading') && (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`ie-count-${id}`}>Question count</Label>
            <Input
              id={`ie-count-${id}`}
              type="number"
              min={1}
              max={50}
              value={(item.config.count as number) ?? 10}
              onChange={(e) => setConfig({ count: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ie-time-${id}`}>Time limit (seconds)</Label>
            <Input
              id={`ie-time-${id}`}
              type="number"
              min={30}
              max={7200}
              value={(item.config.timeLimitSec as number) ?? 900}
              onChange={(e) => setConfig({ timeLimitSec: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`ie-attempts-${id}`}>Max attempts (blank = unlimited)</Label>
            <Input
              id={`ie-attempts-${id}`}
              type="number"
              min={1}
              value={(item.config.maxAttempts as number) ?? ''}
              onChange={(e) =>
                setConfig({
                  maxAttempts: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}

      {item.type === 'exercise' && (
        <div className="space-y-1">
          <Label htmlFor={`ie-instructions-${id}`}>Instructions</Label>
          <Textarea
            id={`ie-instructions-${id}`}
            rows={3}
            value={(item.config.instructions as string) ?? ''}
            onChange={(e) => setConfig({ instructions: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
