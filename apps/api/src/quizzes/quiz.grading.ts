// Pure grading (no nest/mongoose imports). Candidates answer with PRESENTED
// option indices; the shuffle permutation maps them back to canonical ones.

export interface GradableQuestion {
  id: string;
  type: 'mcq' | 'multi' | 'text' | 'likert';
  correct?: Array<number | string>;
  traitMapping?: { dimension: string; direction: 1 | -1 };
  shuffledOptionOrder?: number[];
}

export interface GradedQuestion {
  id: string;
  correct?: boolean;
  trait?: { dimension: string; value: number };
}

export function computeScore(graded: GradedQuestion[]): number | undefined {
  const gradable = graded.filter((g) => g.correct !== undefined);
  if (gradable.length === 0) return undefined;
  return Math.round((100 * gradable.filter((g) => g.correct).length) / gradable.length);
}

export function computeTraitScores(graded: GradedQuestion[]): Record<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const g of graded) {
    if (!g.trait) continue;
    const entry = sums.get(g.trait.dimension) ?? { sum: 0, count: 0 };
    entry.sum += g.trait.value;
    entry.count += 1;
    sums.set(g.trait.dimension, entry);
  }
  const scores: Record<string, number> = {};
  for (const [dimension, { sum, count }] of sums) {
    scores[dimension] = Math.round(((sum / count - 1) / 4) * 100);
  }
  return scores;
}

function toCanonical(q: GradableQuestion, presented: number): number {
  return q.shuffledOptionOrder?.[presented] ?? presented;
}

export function gradeQuestion(q: GradableQuestion, answer: unknown): GradedQuestion {
  if (q.type === 'mcq') {
    const correct =
      typeof answer === 'number' && toCanonical(q, answer) === q.correct?.[0];
    return { id: q.id, correct };
  }
  if (q.type === 'multi') {
    if (!Array.isArray(answer) || !answer.every((a) => typeof a === 'number')) {
      return { id: q.id, correct: false };
    }
    const canonical = new Set((answer as number[]).map((a) => toCanonical(q, a)));
    const expected = new Set((q.correct ?? []) as number[]);
    const correct =
      canonical.size === expected.size && [...expected].every((c) => canonical.has(c));
    return { id: q.id, correct };
  }
  if (q.type === 'likert') {
    if (
      q.traitMapping &&
      typeof answer === 'number' &&
      Number.isInteger(answer) &&
      answer >= 1 &&
      answer <= 5
    ) {
      const value = q.traitMapping.direction === 1 ? answer : 6 - answer;
      return { id: q.id, trait: { dimension: q.traitMapping.dimension, value } };
    }
    return { id: q.id };
  }
  if (q.type === 'text') {
    const normalize = (s: string) => s.trim().toLowerCase();
    const correct =
      typeof answer === 'string' &&
      (q.correct ?? []).some((c) => typeof c === 'string' && normalize(c) === normalize(answer));
    return { id: q.id, correct };
  }
  return { id: q.id };
}
