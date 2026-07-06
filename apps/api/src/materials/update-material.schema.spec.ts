import { updateMaterialSchema } from '@lms/shared';

describe('updateMaterialSchema', () => {
  it('accepts partial title/content/linkedQuestionIds edits and validates present fields', () => {
    expect(
      updateMaterialSchema.parse({ title: 'Reading v2', linkedQuestionIds: ['a'.repeat(24)] }),
    ).toEqual({ title: 'Reading v2', linkedQuestionIds: ['a'.repeat(24)] });
    expect(updateMaterialSchema.parse({ content: '# Updated' })).toEqual({ content: '# Updated' });
    expect(updateMaterialSchema.safeParse({ title: '' }).success).toBe(false);
  });
});
