import { submitQuizSchema } from '@lms/shared';
import { describe, expect, it } from 'vitest';
import { answeredCount, setAnswer, toSubmitDto } from '@/components/quiz/answers';

describe('answers', () => {
  it('replaces mcq/likert/text values immutably', () => {
    const m1 = setAnswer({}, 'q1', 'mcq', 2);
    expect(m1).toEqual({ q1: 2 });
    const m2 = setAnswer(m1, 'q1', 'mcq', 0);
    expect(m2).toEqual({ q1: 0 });
    expect(m1).toEqual({ q1: 2 }); // prior map untouched

    expect(setAnswer({}, 'q2', 'likert', 5)).toEqual({ q2: 5 });
    expect(setAnswer({}, 'q3', 'text', 'because')).toEqual({ q3: 'because' });
  });

  it('toggles multi selections keeping a sorted index array', () => {
    let m = setAnswer({}, 'q1', 'multi', 2);
    m = setAnswer(m, 'q1', 'multi', 0);
    expect(m).toEqual({ q1: [0, 2] });
    m = setAnswer(m, 'q1', 'multi', 2);
    expect(m).toEqual({ q1: [0] });
  });

  it('toSubmitDto matches the shared submitQuizSchema and answeredCount skips empties', () => {
    const map = {
      q1: 1,
      q2: [0, 2],
      q3: 'text answer',
      q4: '',
      q5: [] as number[],
    };
    expect(answeredCount(map)).toBe(3);
    const dto = toSubmitDto(map);
    expect(dto.answers.map((a) => a.questionId)).toEqual(['q1', 'q2', 'q3']);
    expect(() => submitQuizSchema.parse(dto)).not.toThrow();
  });
});
