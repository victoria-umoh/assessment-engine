// Pure mapping from Judge0 batch results to our case results.
// Judge0 status ids: 1 In Queue, 2 Processing, 3 Accepted, 4 Wrong Answer,
// 5–12 candidate-side failures (limits/compile/runtime), 13 Internal Error /
// 14 Exec Format Error are Judge0-side faults. Non-terminal and Judge0-side
// states → 'error' (the worker retries; candidates are never failed on
// infrastructure states).

export interface Judge0CaseResult {
  statusId: number;
  statusDescription: string;
  stdout: string | null;
  time: string | null;
  memory: number | null;
}

export interface CaseResult {
  status: 'passed' | 'failed' | 'error';
  statusDescription: string;
  stdout?: string;
  time?: number;
  memory?: number;
}

export function computeWeightedScore(cases: Array<{ passed: boolean; weight: number }>): number {
  const total = cases.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;
  const passed = cases.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0);
  return Math.round((100 * passed) / total);
}

export function mapCaseResult(r: Judge0CaseResult): CaseResult {
  const status =
    r.statusId === 3 ? 'passed' : r.statusId >= 4 && r.statusId <= 12 ? 'failed' : 'error';
  return {
    status,
    statusDescription: r.statusDescription,
    ...(r.stdout !== null ? { stdout: r.stdout } : {}),
    ...(r.time !== null ? { time: Number(r.time) } : {}),
    ...(r.memory !== null ? { memory: r.memory } : {}),
  };
}
