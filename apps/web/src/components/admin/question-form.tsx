'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createQuestionSchema,
  updateQuestionSchema,
  type CreateQuestionDto,
  type UpdateQuestionDto,
} from '@lms/shared';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminQuestion, Category } from '@/lib/admin-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type QuestionType = 'mcq' | 'multi' | 'text' | 'likert';

// Native selects throughout: they carry the same data and stay testable in
// jsdom (radix Select needs real pointer events).
const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';

export function QuestionForm({
  initial,
  materialId,
  onSubmit,
  submitLabel = 'Save question',
}: {
  initial?: Partial<AdminQuestion>;
  materialId?: string;
  onSubmit: (dto: CreateQuestionDto | UpdateQuestionDto) => Promise<void>;
  submitLabel?: string;
}) {
  const isEdit = Boolean(initial?._id);
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'mcq');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 1);
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join('\n'));
  const [correctIndices, setCorrectIndices] = useState<number[]>(
    Array.isArray(initial?.correct) && typeof initial?.correct[0] === 'number'
      ? (initial?.correct as number[])
      : [],
  );
  const [acceptedText, setAcceptedText] = useState(
    Array.isArray(initial?.correct) && typeof initial?.correct[0] === 'string'
      ? (initial?.correct as string[]).join('\n')
      : '',
  );
  const [traitDimension, setTraitDimension] = useState(initial?.traitMapping?.dimension ?? '');
  const [traitDirection, setTraitDirection] = useState<1 | -1>(
    initial?.traitMapping?.direction ?? 1,
  );
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories'),
  });

  const options = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

  function toggleCorrect(index: number) {
    if (type === 'mcq') setCorrectIndices([index]);
    else {
      setCorrectIndices((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort(),
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const dto: Record<string, unknown> = {
      categoryId,
      difficulty,
      prompt,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (!isEdit) {
      dto.type = type;
      if (materialId) dto.materialId = materialId;
    }
    if (type === 'mcq' || type === 'multi') {
      dto.options = options;
      dto.correct = correctIndices;
    } else if (type === 'text') {
      dto.correct = acceptedText
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean);
    } else if (type === 'likert') {
      dto.traitMapping = { dimension: traitDimension, direction: traitDirection };
    }
    if (explanation.trim()) dto.explanation = explanation.trim();

    const schema = isEdit ? updateQuestionSchema : createQuestionSchema;
    const parsed = schema.safeParse(dto);
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
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="qf-type">Type</Label>
          <select
            id="qf-type"
            className={SELECT_CLASS}
            value={type}
            disabled={isEdit}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            <option value="mcq">Multiple choice</option>
            <option value="multi">Multi-select</option>
            <option value="text">Text answer</option>
            <option value="likert">Likert (profile)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-category">Category</Label>
          <select
            id="qf-category"
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
        <div className="space-y-1">
          <Label htmlFor="qf-difficulty">Difficulty</Label>
          <select
            id="qf-difficulty"
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
      </div>

      <div className="space-y-1">
        <Label htmlFor="qf-prompt">Prompt</Label>
        <Textarea
          id="qf-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
      </div>

      {(type === 'mcq' || type === 'multi') && (
        <>
          <div className="space-y-1">
            <Label htmlFor="qf-options">Options (one per line)</Label>
            <Textarea
              id="qf-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
            />
          </div>
          {options.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">
                Correct {type === 'mcq' ? 'answer' : 'answers'}
              </legend>
              {options.map((option, index) => (
                <label key={`${option}-${index}`} className="flex items-center gap-2 text-sm">
                  <input
                    type={type === 'mcq' ? 'radio' : 'checkbox'}
                    name="qf-correct"
                    checked={correctIndices.includes(index)}
                    onChange={() => toggleCorrect(index)}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}

      {type === 'text' && (
        <div className="space-y-1">
          <Label htmlFor="qf-accepted">Accepted answers (one per line)</Label>
          <Textarea
            id="qf-accepted"
            value={acceptedText}
            onChange={(e) => setAcceptedText(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {type === 'likert' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="qf-dimension">Trait dimension</Label>
            <Input
              id="qf-dimension"
              value={traitDimension}
              onChange={(e) => setTraitDimension(e.target.value)}
              placeholder="e.g. conscientiousness"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qf-direction">Direction</Label>
            <select
              id="qf-direction"
              className={SELECT_CLASS}
              value={traitDirection}
              onChange={(e) => setTraitDirection(Number(e.target.value) as 1 | -1)}
            >
              <option value={1}>Agree scores high (+)</option>
              <option value={-1}>Agree scores low (−)</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="qf-explanation">Explanation (optional)</Label>
          <Input
            id="qf-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="qf-tags">Tags (comma-separated)</Label>
          <Input id="qf-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>
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
