import { z } from 'zod';

export const createCategorySchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/, 'kebab-case letters, digits and dashes only'),
  name: z.string().min(1),
  description: z.string().default(''),
  scoringMode: z.enum(['correctness', 'profile']),
  traitDimensions: z.array(z.string().min(1)).optional(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().omit({ key: true });
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

// Grown test-first: currently the fields exercised by the mcq unit + e2e path.
// Base object extracted so updateQuestionSchema derives from the same fields;
// updates merge onto the stored doc and re-parse via createQuestionSchema, so
// the type-dependent refinements below keep holding on every edit.
const questionBaseSchema = z.object({
  type: z.enum(['mcq', 'multi', 'text', 'likert']),
  categoryId: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).optional(),
  // Canonical option indices (mcq/multi) or accepted answer strings (text).
  correct: z
    .union([z.array(z.number().int().min(0)), z.array(z.string().min(1))])
    .optional(),
  traitMapping: z
    .object({ dimension: z.string().min(1), direction: z.union([z.literal(1), z.literal(-1)]) })
    .optional(),
  explanation: z.string().optional(),
  tags: z.array(z.string()).default([]),
  materialId: z.string().optional(),
});

export const createQuestionSchema = questionBaseSchema
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (q.type === 'mcq' || q.type === 'multi') {
      const optionCount = q.options?.length ?? 0;
      if (optionCount < 2) issue(`${q.type} requires at least 2 options`);
      if (
        !q.correct ||
        q.correct.length === 0 ||
        !q.correct.every((i) => typeof i === 'number' && i < optionCount)
      ) {
        issue('correct indexes must reference existing options');
      }
    }
    if (q.type === 'text') {
      if (!q.correct || q.correct.length === 0 || !q.correct.every((c) => typeof c === 'string')) {
        issue('text requires accepted answer strings in correct');
      }
    }
    if (q.type === 'likert') {
      if (!q.traitMapping) issue('likert requires traitMapping');
      if (q.correct) issue('likert must not define correct answers');
    }
  });
export type CreateQuestionDto = z.infer<typeof createQuestionSchema>;

// type and materialId are immutable on edit: changing type would corrupt past
// attempts; material linkage is owned by the material edit flow.
export const updateQuestionSchema = questionBaseSchema
  .omit({ type: true, materialId: true })
  .partial();
export type UpdateQuestionDto = z.infer<typeof updateQuestionSchema>;

export const createCodingProblemSchema = z.object({
  title: z.string().min(1),
  statement: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  categoryId: z.string().min(1),
  languages: z.array(z.string().min(1)).min(1),
  starterCode: z.record(z.string()).default({}),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        hidden: z.boolean().default(false),
        weight: z.number().min(1).default(1),
      }),
    )
    .min(1),
  limits: z
    .object({
      cpuTimeSec: z.number().positive().default(2),
      memoryKb: z.number().int().positive().default(128000),
      wallTimeSec: z.number().positive().default(5),
    })
    .default({ cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 }),
});
export type CreateCodingProblemDto = z.infer<typeof createCodingProblemSchema>;

export const updateCodingProblemSchema = createCodingProblemSchema.partial();
export type UpdateCodingProblemDto = z.infer<typeof updateCodingProblemSchema>;

export const updateMaterialSchema = z
  .object({
    title: z.string().min(1),
    content: z.string(),
    linkedQuestionIds: z.array(z.string().min(1)),
  })
  .partial();
export type UpdateMaterialDto = z.infer<typeof updateMaterialSchema>;

export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('markdown'), markdown: z.string().min(1) }),
  z.object({ type: z.literal('video'), url: z.string().url(), caption: z.string().optional() }),
  z.object({ type: z.literal('image'), url: z.string().url(), caption: z.string().optional() }),
]);

export const createLessonSchema = z.object({
  title: z.string().min(1),
  contentBlocks: z.array(lessonBlockSchema).min(1),
  estMinutes: z.number().int().min(1),
  tags: z.array(z.string()).default([]),
});
export type CreateLessonDto = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = createLessonSchema.partial();
export type UpdateLessonDto = z.infer<typeof updateLessonSchema>;
