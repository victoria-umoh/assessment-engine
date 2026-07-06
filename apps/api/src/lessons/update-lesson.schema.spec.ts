import { updateLessonSchema } from '@lms/shared';

describe('updateLessonSchema', () => {
  it('accepts a partial edit and still validates present fields', () => {
    expect(updateLessonSchema.parse({ title: 'New title', estMinutes: 9 })).toEqual({
      title: 'New title',
      estMinutes: 9,
    });
    // Present fields keep their create-time rules.
    expect(updateLessonSchema.safeParse({ estMinutes: 0 }).success).toBe(false);
    expect(
      updateLessonSchema.safeParse({ contentBlocks: [{ type: 'video', url: 'not-a-url' }] })
        .success,
    ).toBe(false);
  });
});
