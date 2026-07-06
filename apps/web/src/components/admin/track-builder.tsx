'use client';

import { useState } from 'react';
import { updateTrackSchema, type UpdateTrackDto } from '@lms/shared';
import { ApiError } from '@/lib/api';
import type { AdminTrack } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CapstoneDraft, CapstoneEditor } from '@/components/admin/capstone-editor';
import { DraftItem, ItemEditor, RefOptions } from '@/components/admin/item-editor';
import { ScoringEditor } from '@/components/admin/scoring-editor';

interface DraftDay {
  dayNumber: number;
  items: DraftItem[];
}

const ITEM_TYPES: DraftItem['type'][] = ['lesson', 'reading', 'quiz', 'coding', 'exercise'];

// Draft-only editor: the API rejects edits on published tracks and
// regenerates every itemId on save, so drafts never carry itemIds forward.
export function TrackBuilder({
  track,
  refOptions,
  onSave,
  onPublish,
}: {
  track: AdminTrack;
  refOptions: RefOptions;
  onSave: (dto: UpdateTrackDto) => Promise<void>;
  onPublish: () => Promise<void>;
}) {
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(track.description ?? '');
  const [durationDays, setDurationDays] = useState(track.durationDays);
  const [days, setDays] = useState<DraftDay[]>(
    // Mongoose minimize strips empty config objects from the API payload, so
    // a saved item can arrive without a config key.
    track.days.map((d) => ({
      dayNumber: d.dayNumber,
      items: d.items.map((i) => ({ ...i, config: i.config ?? {} })) as DraftItem[],
    })),
  );
  const [scoring, setScoring] = useState(track.scoring);
  const [capstone, setCapstone] = useState<CapstoneDraft | undefined>(track.finalAssessment);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function touch() {
    setDirty(true);
  }

  function setDuration(next: number) {
    if (!Number.isInteger(next) || next < 1) return;
    setDurationDays(next);
    // Never slice here: shrinking hides trailing days but keeps them in state
    // (a keystroke through a smaller number must not destroy authored days).
    // Days beyond durationDays are dropped only when the dto is built at save.
    setDays((prev) => {
      const padded = [...prev];
      while (padded.length < next) padded.push({ dayNumber: padded.length + 1, items: [] });
      return padded.map((d, i) => ({ ...d, dayNumber: i + 1 }));
    });
    touch();
  }

  function updateDay(dayIndex: number, items: DraftItem[]) {
    setDays((prev) => prev.map((d, i) => (i === dayIndex ? { ...d, items } : d)));
    touch();
  }

  function buildDto(): UpdateTrackDto {
    return {
      title,
      description,
      durationDays,
      days: days.slice(0, durationDays).map((d) => ({
        dayNumber: d.dayNumber,
        // itemId stripped everywhere: the server mints fresh ones on save.
        items: d.items.map(({ itemId: _itemId, ...item }) => item),
      })),
      scoring: {
        // Web types keep weights as a loose record; the schema wants the
        // exact five keys.
        weights: {
          quiz: scoring.weights.quiz ?? 0,
          coding: scoring.weights.coding ?? 0,
          exercise: scoring.weights.exercise ?? 0,
          reading: scoring.weights.reading ?? 0,
          finalAssessment: scoring.weights.finalAssessment ?? 0,
        },
        passThreshold: scoring.passThreshold,
        ...(scoring.categoryMinimums ? { categoryMinimums: scoring.categoryMinimums } : {}),
      },
      // null is the explicit unset — a PATCH that omits the key would leave a
      // previously saved capstone in place on the server.
      ...(capstone !== undefined
        ? { finalAssessment: capstone }
        : track.finalAssessment
          ? { finalAssessment: null }
          : {}),
    };
  }

  async function save() {
    setErrors([]);
    const dropped = days.slice(durationDays).filter((d) => d.items.length > 0);
    if (
      dropped.length > 0 &&
      !window.confirm(
        `Saving with ${durationDays} day(s) drops ${dropped.length} hidden day(s) that still have items. Continue?`,
      )
    ) {
      return;
    }
    const dto = buildDto();
    const parsed = updateTrackSchema.safeParse(dto);
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
      await onSave(parsed.data);
      setDirty(false);
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Save failed']);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setErrors([]);
    setBusy(true);
    try {
      await onPublish();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Publish failed']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_1fr_10rem] gap-3">
        <div className="space-y-1">
          <Label htmlFor="tb-title">Title</Label>
          <Input
            id="tb-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              touch();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tb-description">Description</Label>
          <Textarea
            id="tb-description"
            rows={1}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              touch();
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tb-duration">Duration (days)</Label>
          <Input
            id="tb-duration"
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
      </div>

      {days.slice(0, durationDays).map((day, dayIndex) => (
        <section key={day.dayNumber} className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Day {day.dayNumber}</h2>
            {ITEM_TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateDay(dayIndex, [...day.items, { type, config: {} }])}
              >
                Add {type}
              </Button>
            ))}
          </div>
          {day.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          )}
          {day.items.map((item, itemIndex) => (
            <ItemEditor
              key={item.itemId ?? `new-${dayIndex}-${itemIndex}`}
              item={item}
              refOptions={refOptions}
              onChange={(next) =>
                updateDay(
                  dayIndex,
                  day.items.map((it, i) => (i === itemIndex ? next : it)),
                )
              }
              onRemove={() =>
                updateDay(
                  dayIndex,
                  day.items.filter((_, i) => i !== itemIndex),
                )
              }
            />
          ))}
        </section>
      ))}

      <ScoringEditor
        scoring={scoring}
        onChange={(next) => {
          setScoring(next);
          touch();
        }}
      />

      <CapstoneEditor
        value={capstone}
        onChange={(next) => {
          setCapstone(next);
          touch();
        }}
        problems={refOptions.problems}
        categories={refOptions.categories}
      />

      {errors.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          Save
        </Button>
        <Button
          variant="outline"
          onClick={publish}
          disabled={busy || dirty || track.status !== 'draft'}
          title={dirty ? 'Save your changes before publishing' : undefined}
        >
          Publish
        </Button>
        {track.status !== 'draft' && (
          <span className="text-sm text-muted-foreground">
            Published tracks are read-only.
          </span>
        )}
      </div>
    </div>
  );
}
