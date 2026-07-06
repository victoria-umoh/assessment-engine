import { createQuestionSchema } from '@lms/shared';

describe('createQuestionSchema', () => {
  it('accepts a valid mcq payload and applies defaults', () => {
    const result = createQuestionSchema.safeParse({
      type: 'mcq',
      categoryId: '507f1f77bcf86cd799439011',
      difficulty: 2,
      prompt: 'What is 15% of 200?',
      options: ['20', '25', '30', '35'],
      correct: [2],
      explanation: '0.15 × 200 = 30',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('What is 15% of 200?');
      expect(result.data.correct).toEqual([2]);
      expect(result.data.tags).toEqual([]); // default applied
    }
  });

  it('accepts text questions with accepted-answer strings and requires them', () => {
    const ok = createQuestionSchema.safeParse({
      type: 'text',
      categoryId: '507f1f77bcf86cd799439011',
      difficulty: 1,
      prompt: 'Capital of France?',
      correct: ['Paris', 'paris'],
    });
    expect(ok.success).toBe(true);
    const missing = createQuestionSchema.safeParse({
      type: 'text',
      categoryId: '507f1f77bcf86cd799439011',
      difficulty: 1,
      prompt: 'Capital of France?',
    });
    expect(missing.success).toBe(false);
  });
});
