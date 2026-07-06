// Pure assessment scoring (spec §5 final verdict). No nest/mongoose imports.
//
// typeScore(type) = mean of that type's non-null day-item scores;
// finalAssessment = mean of the capstone quiz score and per-problem best
// coding scores. Types with no scoreable entries drop out and their weight is
// redistributed proportionally over the present types — otherwise a track
// without all five item types could never pass.

export type ScoreableType = 'quiz' | 'coding' | 'exercise' | 'reading';

export interface ScoringInput {
  weights: Record<ScoreableType | 'finalAssessment', number>;
  passThreshold: number; // 0–1
  categoryMinimums?: Record<string, number>; // 0–1, keyed by category KEY
  items: Array<{ type: ScoreableType; score: number | null }>; // completed day items; null = profile quiz
  finalScores?: { quiz?: number; codingByProblem?: number[] };
  categoryStats: Array<{ categoryKey: string; correct: number; total: number }>;
  traitScores: Array<Record<string, number>>; // per settled likert attempt, 0–100 per dimension
}

export interface ScoringResult {
  breakdown: Record<string, number>; // 0–100 per category key
  typeScores: Partial<Record<ScoreableType | 'finalAssessment', number>>;
  weightedTotal: number; // 0–100
  personalityProfile?: Record<string, number>;
  verdict: 'pass' | 'fail';
  failedMinimums: string[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function computeAssessmentResult(input: ScoringInput): ScoringResult {
  const typeScores: Partial<Record<ScoreableType | 'finalAssessment', number>> = {};
  for (const type of ['quiz', 'coding', 'exercise', 'reading'] as const) {
    const scores = input.items
      .filter((i) => i.type === type && i.score !== null)
      .map((i) => i.score as number);
    if (scores.length > 0) typeScores[type] = Math.round(mean(scores));
  }
  const finalParts = [
    ...(input.finalScores?.quiz !== undefined ? [input.finalScores.quiz] : []),
    ...(input.finalScores?.codingByProblem ?? []),
  ];
  if (finalParts.length > 0) typeScores.finalAssessment = Math.round(mean(finalParts));

  const presentTypes = Object.keys(typeScores) as Array<ScoreableType | 'finalAssessment'>;
  const presentWeight = presentTypes.reduce((sum, t) => sum + input.weights[t], 0);
  const weightedTotal =
    presentWeight > 0
      ? Math.round(
          presentTypes.reduce(
            (sum, t) => sum + (typeScores[t] as number) * (input.weights[t] / presentWeight),
            0,
          ),
        )
      : 0;

  const breakdown: Record<string, number> = {};
  for (const stat of input.categoryStats) {
    if (stat.total > 0) breakdown[stat.categoryKey] = Math.round((100 * stat.correct) / stat.total);
  }

  const failedMinimums = Object.entries(input.categoryMinimums ?? {})
    .filter(([key, min]) => (breakdown[key] ?? 0) / 100 < min)
    .map(([key]) => key);

  let personalityProfile: Record<string, number> | undefined;
  if (input.traitScores.length > 0) {
    const dims = new Map<string, number[]>();
    for (const attempt of input.traitScores) {
      for (const [dim, value] of Object.entries(attempt)) {
        dims.set(dim, [...(dims.get(dim) ?? []), value]);
      }
    }
    personalityProfile = Object.fromEntries(
      [...dims].map(([dim, values]) => [dim, Math.round(mean(values))]),
    );
  }

  const verdict =
    weightedTotal / 100 >= input.passThreshold && failedMinimums.length === 0 ? 'pass' : 'fail';

  return { breakdown, typeScores, weightedTotal, personalityProfile, verdict, failedMinimums };
}
