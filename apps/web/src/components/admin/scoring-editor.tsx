'use client';

import type { TrackScoring } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const WEIGHT_KEYS = ['quiz', 'coding', 'exercise', 'reading', 'finalAssessment'] as const;

export function ScoringEditor({
  scoring,
  onChange,
  categoryKeys = [],
}: {
  scoring: TrackScoring;
  onChange: (next: TrackScoring) => void;
  categoryKeys?: string[];
}) {
  const sum = WEIGHT_KEYS.reduce((acc, key) => acc + (scoring.weights[key] ?? 0), 0);
  // Same tolerance and copy as the shared scoringSchema refinement.
  const unbalanced = Math.abs(sum - 1) > 0.001;
  const minimums = Object.entries(scoring.categoryMinimums ?? {});

  function setWeight(key: string, value: number) {
    onChange({ ...scoring, weights: { ...scoring.weights, [key]: value } });
  }

  function setMinimum(index: number, key: string, value: number) {
    const next = minimums.map((entry, i) => (i === index ? [key, value] : entry));
    onChange({ ...scoring, categoryMinimums: Object.fromEntries(next) });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Scoring</h2>
      <div className="grid grid-cols-5 gap-3">
        {WEIGHT_KEYS.map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`se-${key}`}>{key}</Label>
            <Input
              id={`se-${key}`}
              aria-label={`${key} weight`}
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={scoring.weights[key] ?? 0}
              onChange={(e) => setWeight(key, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      <p className={unbalanced ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {unbalanced ? 'weights must sum to 1' : `Weights sum to ${sum.toFixed(2)}`}
      </p>

      <div className="w-48 space-y-1">
        <Label htmlFor="se-threshold">Pass threshold (0–1)</Label>
        <Input
          id="se-threshold"
          type="number"
          step="0.05"
          min={0}
          max={1}
          value={scoring.passThreshold}
          onChange={(e) => onChange({ ...scoring, passThreshold: Number(e.target.value) })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Category minimums (optional)</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...scoring,
                categoryMinimums: { ...(scoring.categoryMinimums ?? {}), '': 0.5 },
              })
            }
          >
            Add minimum
          </Button>
        </div>
        {minimums.map(([key, value], index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`se-min-key-${index}`}>Category key</Label>
              {categoryKeys.length > 0 ? (
                <select
                  id={`se-min-key-${index}`}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={key}
                  onChange={(e) => setMinimum(index, e.target.value, value as number)}
                >
                  <option value="">Select…</option>
                  {categoryKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`se-min-key-${index}`}
                  value={key}
                  onChange={(e) => setMinimum(index, e.target.value, value as number)}
                />
              )}
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor={`se-min-val-${index}`}>Minimum</Label>
              <Input
                id={`se-min-val-${index}`}
                type="number"
                step="0.05"
                min={0}
                max={1}
                value={value as number}
                onChange={(e) => setMinimum(index, key, Number(e.target.value))}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = Object.fromEntries(minimums.filter((_, i) => i !== index));
                onChange({
                  ...scoring,
                  categoryMinimums: Object.keys(next).length > 0 ? next : undefined,
                });
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
