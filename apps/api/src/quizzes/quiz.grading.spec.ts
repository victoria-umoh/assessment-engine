import { computeScore, computeTraitScores, gradeQuestion } from './quiz.grading';

describe('gradeQuestion', () => {
  it('grades mcq answers through the shuffle map', () => {
    // Canonical options [A,B,C,D], correct canonical index 0 (A).
    // Presented order [2,0,3,1] → A is presented at index 1.
    const q = {
      id: 'q1',
      type: 'mcq' as const,
      correct: [0],
      shuffledOptionOrder: [2, 0, 3, 1],
    };
    expect(gradeQuestion(q, 1).correct).toBe(true);
    expect(gradeQuestion(q, 0).correct).toBe(false);
  });

  it('grades multi answers as an order-independent canonical set', () => {
    // Correct canonical set {0,2}; presented order [1,2,0] → canonical 0 is
    // presented at 2, canonical 2 is presented at 1.
    const q = {
      id: 'q2',
      type: 'multi' as const,
      correct: [0, 2],
      shuffledOptionOrder: [1, 2, 0],
    };
    expect(gradeQuestion(q, [2, 1]).correct).toBe(true);
    expect(gradeQuestion(q, [1, 2]).correct).toBe(true);
    expect(gradeQuestion(q, [2]).correct).toBe(false); // partial
    expect(gradeQuestion(q, [0, 1, 2]).correct).toBe(false); // superset
  });

  it('grades text answers case- and whitespace-insensitively against accepted strings', () => {
    const q = { id: 'q3', type: 'text' as const, correct: ['Paris', 'City of Light'] };
    expect(gradeQuestion(q, '  paris ').correct).toBe(true);
    expect(gradeQuestion(q, 'CITY OF LIGHT').correct).toBe(true);
    expect(gradeQuestion(q, 'London').correct).toBe(false);
    expect(gradeQuestion(q, 42).correct).toBe(false);
  });

  it('maps likert answers to trait values with direction, no correctness', () => {
    const fwd = {
      id: 'q4',
      type: 'likert' as const,
      traitMapping: { dimension: 'openness', direction: 1 as const },
    };
    const rev = {
      id: 'q5',
      type: 'likert' as const,
      traitMapping: { dimension: 'openness', direction: -1 as const },
    };
    expect(gradeQuestion(fwd, 4).trait).toEqual({ dimension: 'openness', value: 4 });
    expect(gradeQuestion(fwd, 4).correct).toBeUndefined();
    expect(gradeQuestion(rev, 4).trait).toEqual({ dimension: 'openness', value: 2 }); // 6 - 4
    expect(gradeQuestion(fwd, 9).trait).toBeUndefined(); // out of 1–5 range
    expect(gradeQuestion(fwd, 'x').trait).toBeUndefined();
  });
});

describe('computeTraitScores', () => {
  it('normalizes per-dimension means to 0–100', () => {
    const graded = [
      { id: 'a', trait: { dimension: 'openness', value: 3 } },
      { id: 'b', trait: { dimension: 'openness', value: 3 } },
      { id: 'c', trait: { dimension: 'grit', value: 5 } },
      { id: 'd', trait: { dimension: 'grit', value: 1 } },
      { id: 'e', correct: true }, // non-likert entries ignored
    ];
    // openness mean 3 → (3-1)/4*100 = 50; grit mean 3 → 50
    expect(computeTraitScores(graded)).toEqual({ openness: 50, grit: 50 });
  });
});

describe('computeScore', () => {
  it('scores only gradable entries; all-likert attempts have no score', () => {
    expect(
      computeScore([
        { id: 'a', correct: true },
        { id: 'b', correct: false },
        { id: 'c', correct: true },
        { id: 'd', trait: { dimension: 'grit', value: 4 } }, // excluded
      ]),
    ).toBe(67);
    expect(computeScore([{ id: 'd', trait: { dimension: 'grit', value: 4 } }])).toBeUndefined();
  });
});
