'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import type { AdminCohort } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';

// Dto values stay JSON-friendly (date inputs as YYYY-MM-DD strings; the API's
// z.coerce.date parses them).
export interface CohortFormValues {
  trackId?: string;
  name: string;
  startDate: string;
  endDate?: string;
  capacity?: number;
  pacingOverrides?: { unlockMode: 'hybrid' | 'progress-only' | 'day-only' };
}

export function CohortForm({
  initial,
  tracks,
  onSubmit,
  submitLabel = 'Save cohort',
}: {
  initial?: Partial<AdminCohort>;
  tracks: Array<{ _id: string; title: string; status: string }>;
  onSubmit: (dto: CohortFormValues) => Promise<void>;
  submitLabel?: string;
}) {
  const isEdit = Boolean(initial?._id);
  const [trackId, setTrackId] = useState(initial?.trackId ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 10) ?? '');
  const [capacity, setCapacity] = useState<string>(
    initial?.capacity !== undefined ? String(initial.capacity) : '',
  );
  const [unlockMode, setUnlockMode] = useState<string>(
    initial?.pacingOverrides?.unlockMode ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const published = tracks.filter((t) => t.status === 'published');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dto: CohortFormValues = {
      name,
      startDate,
      ...(isEdit ? {} : { trackId }),
      ...(endDate ? { endDate } : {}),
      ...(capacity !== '' ? { capacity: Number(capacity) } : {}),
      ...(unlockMode
        ? { pacingOverrides: { unlockMode: unlockMode as 'hybrid' | 'progress-only' | 'day-only' } }
        : {}),
    };
    setBusy(true);
    try {
      await onSubmit(dto);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && (
        <div className="space-y-1">
          <Label htmlFor="chf-track">Track</Label>
          <select
            id="chf-track"
            className={SELECT_CLASS}
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
          >
            <option value="">Select a published track…</option>
            {published.map((t) => (
              <option key={t._id} value={t._id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="chf-name">Name</Label>
        <Input id="chf-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="chf-start">Start date</Label>
          <Input
            id="chf-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="chf-end">End date (optional)</Label>
          <Input
            id="chf-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="chf-capacity">Capacity (optional)</Label>
          <Input
            id="chf-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="chf-unlock">Unlock mode</Label>
          <select
            id="chf-unlock"
            className={SELECT_CLASS}
            value={unlockMode}
            onChange={(e) => setUnlockMode(e.target.value)}
          >
            <option value="">Track default (hybrid)</option>
            <option value="hybrid">Hybrid</option>
            <option value="progress-only">Progress only</option>
            <option value="day-only">Day only</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
