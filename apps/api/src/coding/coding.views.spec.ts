import { toCandidateProblemView } from './coding.views';

describe('toCandidateProblemView', () => {
  it('excludes hidden test cases entirely and strips weights from visible ones', () => {
    const view = toCandidateProblemView({
      id: 'p1',
      title: 'Sum Two Numbers',
      statement: 'Read two ints, print their sum.',
      difficulty: 1,
      categoryId: 'cat1',
      languages: ['python', 'javascript'],
      starterCode: { python: 'a, b = map(int, input().split())' },
      testCases: [
        { input: '1 2', expectedOutput: '3', hidden: false, weight: 1 },
        { input: '10 20', expectedOutput: '30', hidden: true, weight: 2 },
        { input: '-5 5', expectedOutput: '0', hidden: true, weight: 2 },
      ],
      limits: { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
      status: 'active',
    });

    expect(view.visibleTestCases).toEqual([{ input: '1 2', expectedOutput: '3' }]);
    expect(JSON.stringify(view)).not.toContain('30');
    expect(JSON.stringify(view)).not.toContain('hidden');
    expect(JSON.stringify(view)).not.toContain('weight');
    expect(view).toMatchObject({
      id: 'p1',
      title: 'Sum Two Numbers',
      languages: ['python', 'javascript'],
      limits: { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
    });
  });
});
