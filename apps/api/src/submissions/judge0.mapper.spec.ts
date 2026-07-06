import { computeWeightedScore, mapCaseResult } from './judge0.mapper';

describe('mapCaseResult', () => {
  it('maps Judge0 status ids to case statuses', () => {
    expect(mapCaseResult({ statusId: 3, statusDescription: 'Accepted', stdout: 'ok', time: '0.01', memory: 512 }).status).toBe('passed');
    expect(mapCaseResult({ statusId: 4, statusDescription: 'Wrong Answer', stdout: 'no', time: '0.01', memory: 512 }).status).toBe('failed');
    expect(mapCaseResult({ statusId: 6, statusDescription: 'Compilation Error', stdout: null, time: null, memory: null }).status).toBe('failed');
    expect(mapCaseResult({ statusId: 5, statusDescription: 'Time Limit Exceeded', stdout: null, time: null, memory: null }).status).toBe('failed');
    // Not-yet-terminal or unknown states are worker errors, not candidate failures.
    expect(mapCaseResult({ statusId: 1, statusDescription: 'In Queue', stdout: null, time: null, memory: null }).status).toBe('error');
    expect(mapCaseResult({ statusId: 2, statusDescription: 'Processing', stdout: null, time: null, memory: null }).status).toBe('error');
    // Judge0 infrastructure faults (13 Internal Error, 14 Exec Format Error)
    // are NOT candidate failures — caught live: a broken sandbox failed a
    // correct solution and consumed the attempt.
    expect(mapCaseResult({ statusId: 13, statusDescription: 'Internal Error', stdout: null, time: null, memory: null }).status).toBe('error');
    expect(mapCaseResult({ statusId: 14, statusDescription: 'Exec Format Error', stdout: null, time: null, memory: null }).status).toBe('error');
  });
});

describe('computeWeightedScore', () => {
  it('weights per-case passes into a 0-100 score', () => {
    expect(
      computeWeightedScore([
        { passed: true, weight: 1 },
        { passed: false, weight: 3 },
      ]),
    ).toBe(25);
    expect(computeWeightedScore([{ passed: true, weight: 2 }])).toBe(100);
    expect(computeWeightedScore([{ passed: false, weight: 5 }])).toBe(0);
    expect(computeWeightedScore([])).toBe(0);
  });
});
