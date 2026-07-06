export interface ProblemTestCase {
  input: string;
  expectedOutput: string;
  hidden: boolean;
  weight: number;
}

export interface ProblemLike {
  id: string;
  title: string;
  statement: string;
  difficulty: number;
  categoryId: unknown;
  languages: string[];
  starterCode: Record<string, string>;
  testCases: ProblemTestCase[];
  limits: { cpuTimeSec: number; memoryKb: number; wallTimeSec: number };
  [key: string]: unknown;
}

export interface CandidateProblemView {
  id: string;
  title: string;
  statement: string;
  difficulty: number;
  categoryId: unknown;
  languages: string[];
  starterCode: Record<string, string>;
  visibleTestCases: Array<{ input: string; expectedOutput: string }>;
  limits: ProblemLike['limits'];
}

/**
 * Candidate-facing projection. Hidden test cases are omitted ENTIRELY and
 * weights are stripped from visible ones (spec: answer secrecy). Allowlist
 * construction keeps new schema fields private by default.
 */
export function toCandidateProblemView(p: ProblemLike): CandidateProblemView {
  return {
    id: p.id,
    title: p.title,
    statement: p.statement,
    difficulty: p.difficulty,
    categoryId: p.categoryId,
    languages: p.languages,
    starterCode: p.starterCode,
    visibleTestCases: p.testCases
      .filter((tc) => !tc.hidden)
      .map((tc) => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
    limits: p.limits,
  };
}
