'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createCodingProblemSchema,
  updateCodingProblemSchema,
  JUDGE0_LANGUAGE_IDS,
  type CreateCodingProblemDto,
  type UpdateCodingProblemDto,
} from '@lms/shared';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminCodingProblem, Category } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CaseDraft {
  input: string;
  expectedOutput: string;
  hidden: boolean;
  weight: number;
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
const LANGUAGES = Object.keys(JUDGE0_LANGUAGE_IDS);

export function CodingProblemForm({
  initial,
  onSubmit,
  submitLabel = 'Save problem',
}: {
  initial?: Partial<AdminCodingProblem>;
  onSubmit: (dto: CreateCodingProblemDto | UpdateCodingProblemDto) => Promise<void>;
  submitLabel?: string;
}) {
  const isEdit = Boolean(initial?._id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [statement, setStatement] = useState(initial?.statement ?? '');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 1);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [languages, setLanguages] = useState<string[]>(initial?.languages ?? []);
  const [starterCode, setStarterCode] = useState<Record<string, string>>(
    initial?.starterCode ?? {},
  );
  const [cases, setCases] = useState<CaseDraft[]>(initial?.testCases ?? []);
  const [limits, setLimits] = useState(
    initial?.limits ?? { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  function updateCase(index: number, patch: Partial<CaseDraft>) {
    setCases((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const dto = {
      title,
      statement,
      difficulty,
      categoryId,
      languages,
      starterCode: Object.fromEntries(
        languages.filter((l) => starterCode[l]?.trim()).map((l) => [l, starterCode[l]]),
      ),
      testCases: cases,
      limits,
    };
    const parsed = (isEdit ? updateCodingProblemSchema : createCodingProblemSchema).safeParse(dto);
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
        <Label htmlFor="cf-title">Title</Label>
        <Input id="cf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cf-statement">Statement (markdown)</Label>
        <Textarea
          id="cf-statement"
          rows={5}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cf-difficulty">Difficulty</Label>
          <select
            id="cf-difficulty"
            className={SELECT_CLASS}
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-category">Category</Label>
          <select
            id="cf-category"
            className={SELECT_CLASS}
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Languages</legend>
        <div className="flex flex-wrap gap-3">
          {LANGUAGES.map((lang) => (
            <label key={lang} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={languages.includes(lang)}
                onChange={() => toggleLanguage(lang)}
                aria-label={lang}
              />
              {lang}
            </label>
          ))}
        </div>
      </fieldset>

      {languages.map((lang) => (
        <div key={lang} className="space-y-1">
          <Label htmlFor={`cf-starter-${lang}`}>Starter code: {lang}</Label>
          <Textarea
            id={`cf-starter-${lang}`}
            rows={3}
            className="font-mono"
            value={starterCode[lang] ?? ''}
            onChange={(e) => setStarterCode((prev) => ({ ...prev, [lang]: e.target.value }))}
          />
        </div>
      ))}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Test cases</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCases((prev) => [
                ...prev,
                { input: '', expectedOutput: '', hidden: false, weight: 1 },
              ])
            }
          >
            Add test case
          </Button>
        </div>
        {cases.map((testCase, index) => (
          <div
            key={index}
            className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-end gap-2 rounded-md border p-3"
          >
            <div className="space-y-1">
              <Label htmlFor={`cf-in-${index}`}>Input {index + 1}</Label>
              <Textarea
                id={`cf-in-${index}`}
                rows={2}
                className="font-mono"
                value={testCase.input}
                onChange={(e) => updateCase(index, { input: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cf-out-${index}`}>Expected output {index + 1}</Label>
              <Textarea
                id={`cf-out-${index}`}
                rows={2}
                className="font-mono"
                value={testCase.expectedOutput}
                onChange={(e) => updateCase(index, { expectedOutput: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-sm">
              <input
                type="checkbox"
                checked={testCase.hidden}
                onChange={(e) => updateCase(index, { hidden: e.target.checked })}
                aria-label={`Hidden ${index + 1}`}
              />
              Hidden
            </label>
            <div className="w-20 space-y-1">
              <Label htmlFor={`cf-weight-${index}`}>Weight {index + 1}</Label>
              <Input
                id={`cf-weight-${index}`}
                type="number"
                min={1}
                value={testCase.weight}
                onChange={(e) => updateCase(index, { weight: Number(e.target.value) })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCases((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="mb-1 text-sm font-medium">Limits</legend>
        <div className="space-y-1">
          <Label htmlFor="cf-cpu">CPU time (s)</Label>
          <Input
            id="cf-cpu"
            type="number"
            step="0.5"
            value={limits.cpuTimeSec}
            onChange={(e) => setLimits({ ...limits, cpuTimeSec: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-mem">Memory (KB)</Label>
          <Input
            id="cf-mem"
            type="number"
            value={limits.memoryKb}
            onChange={(e) => setLimits({ ...limits, memoryKb: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-wall">Wall time (s)</Label>
          <Input
            id="cf-wall"
            type="number"
            step="0.5"
            value={limits.wallTimeSec}
            onChange={(e) => setLimits({ ...limits, wallTimeSec: Number(e.target.value) })}
          />
        </div>
      </fieldset>

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
