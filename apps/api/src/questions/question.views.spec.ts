import { toCandidateQuestionView } from './question.views';

describe('toCandidateQuestionView', () => {
  it('strips answer-revealing fields and keeps presentation fields', () => {
    const view = toCandidateQuestionView({
      id: 'q1',
      type: 'mcq',
      categoryId: 'cat1',
      difficulty: 3,
      prompt: 'What comes next: 2, 4, 8, ?',
      media: [{ kind: 'svg', value: '<svg/>' }],
      options: ['12', '16', '24', '32'],
      correct: [1],
      traitMapping: { dimension: 'openness', direction: 1 },
      explanation: 'Powers of two double each step.',
      tags: ['series'],
      source: 'seed',
      status: 'active',
    });

    expect(view).toEqual({
      id: 'q1',
      type: 'mcq',
      categoryId: 'cat1',
      difficulty: 3,
      prompt: 'What comes next: 2, 4, 8, ?',
      media: [{ kind: 'svg', value: '<svg/>' }],
      options: ['12', '16', '24', '32'],
    });
    expect(view).not.toHaveProperty('correct');
    expect(view).not.toHaveProperty('explanation');
    expect(view).not.toHaveProperty('traitMapping');
  });
});
