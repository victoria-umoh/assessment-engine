import { updateCodingProblemSchema } from '@lms/shared';

describe('updateCodingProblemSchema', () => {
  it('accepts a partial edit and still validates present fields', () => {
    expect(updateCodingProblemSchema.parse({ title: 'Sum of two', difficulty: 2 })).toEqual({
      title: 'Sum of two',
      difficulty: 2,
    });
    // Present fields keep their create-time rules.
    expect(updateCodingProblemSchema.safeParse({ difficulty: 9 }).success).toBe(false);
    expect(updateCodingProblemSchema.safeParse({ testCases: [] }).success).toBe(false);
  });
});
