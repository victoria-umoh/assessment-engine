import { QuestionSchema } from './question.schema';

describe('Question indexes', () => {
  // Spec §6: the quiz sampler's $match stage must be index-supported.
  it('defines the compound {categoryId, difficulty, status} index', () => {
    const indexes = QuestionSchema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({ categoryId: 1, difficulty: 1, status: 1 });
  });
});
