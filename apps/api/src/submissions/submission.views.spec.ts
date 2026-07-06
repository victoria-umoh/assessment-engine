import { toCandidateSubmissionView } from './submission.views';

const base = {
  _id: 's1',
  enrollmentId: 'e1',
  problemId: 'p1',
  final: false,
  language: 'python',
  status: 'failed',
  score: 0,
  testResults: [
    { caseIndex: 0, status: 'failed', stdout: 'leaky hidden output', time: 0.1, memory: 100 },
  ],
};

describe('toCandidateSubmissionView', () => {
  it('fails closed: results are masked unless the case is known to be visible', () => {
    // Problem deleted or testCases edited after grading → no hidden metadata.
    // stdout can echo hidden inputs; mask unless hidden === false explicitly.
    const view = toCandidateSubmissionView(base, []);
    expect(view.testResults[0]).toEqual({ caseIndex: 0, status: 'failed', hidden: true });
    const visible = toCandidateSubmissionView(base, [false]);
    expect(visible.testResults[0].stdout).toBe('leaky hidden output');
  });

  it('rows carry an explicit hidden flag so the UI never infers from stdout absence', () => {
    // A VISIBLE case can legitimately produce no stdout — the P5 UI labeled it
    // 'hidden'. The flag is the discriminant, not stdout presence.
    const noOutput = {
      ...base,
      testResults: [{ caseIndex: 0, status: 'passed' }],
    };
    const visible = toCandidateSubmissionView(noOutput, [false]);
    expect(visible.testResults[0]).toMatchObject({ caseIndex: 0, hidden: false });
    const masked = toCandidateSubmissionView(base, [true]);
    expect(masked.testResults[0]).toEqual({ caseIndex: 0, status: 'failed', hidden: true });
  });
});
