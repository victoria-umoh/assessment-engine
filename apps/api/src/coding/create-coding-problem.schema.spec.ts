import { createCodingProblemSchema } from '@lms/shared';

describe('createCodingProblemSchema', () => {
  it('accepts a valid problem and applies default limits', () => {
    const result = createCodingProblemSchema.safeParse({
      title: 'Sum Two Numbers',
      statement: 'Read two integers and print their sum.',
      difficulty: 1,
      categoryId: '507f1f77bcf86cd799439011',
      languages: ['python'],
      starterCode: { python: '# code' },
      testCases: [{ input: '1 2', expectedOutput: '3', hidden: false, weight: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limits).toEqual({ cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 });
    }
  });
});
