import { computeAssessmentResult, ScoringInput } from './scoring.engine';

function input(overrides: Partial<ScoringInput>): ScoringInput {
  return {
    weights: { quiz: 0.4, coding: 0.3, exercise: 0.1, reading: 0.2, finalAssessment: 0 },
    passThreshold: 0.7,
    items: [],
    categoryStats: [],
    traitScores: [],
    ...overrides,
  };
}

describe('computeAssessmentResult', () => {
  it('renormalizes weights when only one type has scoreable items', () => {
    // Only quiz items exist: quiz weight 0.4 renormalizes to 1.0.
    const result = computeAssessmentResult(
      input({ items: [{ type: 'quiz', score: 80 }, { type: 'quiz', score: 60 }] }),
    );
    expect(result.typeScores.quiz).toBe(70);
    expect(result.weightedTotal).toBe(70);
    expect(result.verdict).toBe('pass');
  });

  it('weights present types proportionally', () => {
    // quiz .4 + coding .3 present → normalized 4/7 and 3/7.
    const result = computeAssessmentResult(
      input({
        items: [
          { type: 'quiz', score: 70 },
          { type: 'coding', score: 100 },
        ],
      }),
    );
    expect(result.weightedTotal).toBe(Math.round(70 * (4 / 7) + 100 * (3 / 7))); // 83
    expect(result.verdict).toBe('pass');
  });

  it('excludes profile (null-score) items and handles the all-absent case', () => {
    const withProfile = computeAssessmentResult(
      input({
        items: [
          { type: 'quiz', score: 90 },
          { type: 'quiz', score: null }, // profile quiz — must not drag the mean
        ],
      }),
    );
    expect(withProfile.typeScores.quiz).toBe(90);
    const empty = computeAssessmentResult(input({ items: [{ type: 'quiz', score: null }] }));
    expect(empty.weightedTotal).toBe(0);
    expect(empty.verdict).toBe('fail');
  });

  it('averages capstone quiz and per-problem coding scores under finalAssessment', () => {
    const result = computeAssessmentResult(
      input({
        weights: { quiz: 0.5, coding: 0, exercise: 0, reading: 0, finalAssessment: 0.5 },
        items: [{ type: 'quiz', score: 100 }],
        finalScores: { quiz: 80, codingByProblem: [100, 60] },
      }),
    );
    expect(result.typeScores.finalAssessment).toBe(80); // mean(80, 100, 60)
    expect(result.weightedTotal).toBe(90); // 100*.5 + 80*.5
  });

  it('passes at exactly the threshold and fails below it', () => {
    const at = computeAssessmentResult(input({ items: [{ type: 'quiz', score: 70 }] }));
    expect(at.verdict).toBe('pass');
    const below = computeAssessmentResult(input({ items: [{ type: 'quiz', score: 69 }] }));
    expect(below.verdict).toBe('fail');
  });

  it('fails categoryMinimums below floor (missing category counts as 0) and reports them', () => {
    const result = computeAssessmentResult(
      input({
        items: [{ type: 'quiz', score: 95 }],
        categoryStats: [
          { categoryKey: 'logical', correct: 9, total: 10 },
          { categoryKey: 'verbal', correct: 1, total: 10 },
        ],
        categoryMinimums: { logical: 0.5, verbal: 0.5, spatial: 0.3 }, // spatial never taken
      }),
    );
    expect(result.breakdown).toEqual({ logical: 90, verbal: 10 });
    expect(result.failedMinimums.sort()).toEqual(['spatial', 'verbal']);
    expect(result.verdict).toBe('fail'); // high total, but minimums gate
  });

  it('averages trait scores across attempts into personalityProfile; absent when none', () => {
    const withTraits = computeAssessmentResult(
      input({
        items: [{ type: 'quiz', score: 100 }],
        traitScores: [{ openness: 40, grit: 80 }, { openness: 60 }],
      }),
    );
    expect(withTraits.personalityProfile).toEqual({ openness: 50, grit: 80 });
    expect(withTraits.verdict).toBe('pass'); // profile never affects the verdict
    const none = computeAssessmentResult(input({ items: [{ type: 'quiz', score: 100 }] }));
    expect(none.personalityProfile).toBeUndefined();
  });
});
