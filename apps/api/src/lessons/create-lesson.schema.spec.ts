import { createLessonSchema } from '@lms/shared';

describe('createLessonSchema', () => {
  it('accepts markdown and video blocks', () => {
    const result = createLessonSchema.safeParse({
      title: 'Intro to Ratios',
      contentBlocks: [
        { type: 'markdown', markdown: '# Ratios' },
        { type: 'video', url: 'https://videos.example.com/ratios-101' },
      ],
      estMinutes: 12,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });
});
