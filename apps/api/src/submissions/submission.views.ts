// Candidate view: hidden-case results collapse to { caseIndex, status } —
// stdout/expected output of hidden cases never reach candidates (spec §7).
// sourceCode is also dropped (candidates already have it; keep payloads lean).

export interface SubmissionLike {
  _id: unknown;
  enrollmentId: unknown;
  itemId?: string;
  problemId: unknown;
  final: boolean;
  language: string;
  status: string;
  score: number;
  testResults: Array<{
    caseIndex: number;
    status: string;
    statusDescription?: string;
    stdout?: string;
    time?: number;
    memory?: number;
  }>;
  createdAt?: Date;
}

export function toCandidateSubmissionView(submission: SubmissionLike, hiddenByIndex: boolean[]) {
  return {
    _id: submission._id,
    enrollmentId: submission.enrollmentId,
    ...(submission.itemId ? { itemId: submission.itemId } : {}),
    problemId: submission.problemId,
    final: submission.final,
    language: submission.language,
    status: submission.status,
    score: submission.score,
    createdAt: submission.createdAt,
    // Fail closed: only cases explicitly known to be visible (hidden === false)
    // expose stdout/timing — a deleted or re-edited problem must not leak.
    // Every row carries an explicit `hidden` flag: a visible case with no
    // stdout must not read as hidden in the UI (P5 rider).
    testResults: submission.testResults.map((r) =>
      hiddenByIndex[r.caseIndex] === false
        ? { ...r, hidden: false }
        : { caseIndex: r.caseIndex, status: r.status, hidden: true },
    ),
  };
}
