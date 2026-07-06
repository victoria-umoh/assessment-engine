'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CapstoneDraft {
  quizConfig?: Record<string, unknown>;
  codingProblemIds?: string[];
}

// Optional final assessment: a final quiz config and/or capstone coding
// problems. Behavior pinned by capstone-editor.test.tsx.
export function CapstoneEditor({
  value,
  onChange,
  problems,
  categories,
}: {
  value: CapstoneDraft | undefined;
  onChange: (next: CapstoneDraft | undefined) => void;
  problems: Array<{ _id: string; title: string }>;
  categories: Array<{ _id: string; name: string }>;
}) {
  const enabled = value !== undefined;
  const quiz = value?.quizConfig;
  const problemIds = value?.codingProblemIds ?? [];

  function setQuiz(patch: Record<string, unknown>) {
    onChange({ ...value, quizConfig: { ...(quiz ?? {}), ...patch } });
  }

  return (
    <section className="space-y-3">
      <label className="flex items-center gap-2 text-lg font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? {} : undefined)}
          aria-label="Enable final assessment"
        />
        Final assessment (capstone)
      </label>

      {enabled && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={quiz !== undefined}
              onChange={(e) =>
                onChange({
                  ...value,
                  quizConfig: e.target.checked ? { count: 10, timeLimitSec: 900 } : undefined,
                })
              }
              aria-label="Include final quiz"
            />
            Final quiz
          </label>
          {quiz && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ce-count">Question count</Label>
                <Input
                  id="ce-count"
                  type="number"
                  min={1}
                  max={50}
                  value={(quiz.count as number) ?? 10}
                  onChange={(e) => setQuiz({ count: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ce-time">Time limit (seconds)</Label>
                <Input
                  id="ce-time"
                  type="number"
                  min={30}
                  max={7200}
                  value={(quiz.timeLimitSec as number) ?? 900}
                  onChange={(e) => setQuiz({ timeLimitSec: Number(e.target.value) })}
                />
              </div>
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Categories (blank = all)</legend>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => {
                    const selected = (quiz.categoryIds as string[] | undefined) ?? [];
                    const checked = selected.includes(cat._id);
                    return (
                      <label key={cat._id} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`Final quiz ${cat.name}`}
                          onChange={() => {
                            const next = checked
                              ? selected.filter((id) => id !== cat._id)
                              : [...selected, cat._id];
                            setQuiz({ categoryIds: next.length > 0 ? next : undefined });
                          }}
                        />
                        {cat.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Capstone coding problems</legend>
            <div className="flex flex-wrap gap-3">
              {problems.map((p) => {
                const checked = problemIds.includes(p._id);
                return (
                  <label key={p._id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={p.title}
                      onChange={() => {
                        const next = checked
                          ? problemIds.filter((id) => id !== p._id)
                          : [...problemIds, p._id];
                        onChange({
                          ...value,
                          codingProblemIds: next.length > 0 ? next : undefined,
                        });
                      }}
                    />
                    {p.title}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </section>
  );
}
