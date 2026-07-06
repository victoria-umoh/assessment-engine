import { z } from 'zod';

export const trackItemSchema = z
  .object({
    type: z.enum(['lesson', 'reading', 'quiz', 'coding', 'exercise']),
    refId: z.string().optional(),
    config: z.record(z.unknown()).default({}),
  })
  .superRefine((it, ctx) => {
    if (['lesson', 'reading', 'coding'].includes(it.type) && !it.refId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${it.type} item requires refId` });
    }
  });

export const trackDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  items: z.array(trackItemSchema).default([]),
});

export const scoringSchema = z
  .object({
    weights: z.object({
      quiz: z.number().min(0),
      coding: z.number().min(0),
      exercise: z.number().min(0),
      reading: z.number().min(0),
      finalAssessment: z.number().min(0),
    }),
    passThreshold: z.number().min(0).max(1),
    categoryMinimums: z.record(z.number().min(0).max(1)).optional(),
  })
  .superRefine((s, ctx) => {
    const sum = Object.values(s.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'weights must sum to 1' });
    }
  });

export const createTrackSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  durationDays: z.number().int().min(1),
  days: z.array(trackDaySchema).default([]),
  scoring: scoringSchema,
  finalAssessment: z
    .object({
      quizConfig: z.record(z.unknown()).optional(),
      codingProblemIds: z.array(z.string()).optional(),
    })
    .optional(),
});
export type CreateTrackDto = z.infer<typeof createTrackSchema>;

export const updateTrackSchema = createTrackSchema.partial().extend({
  // null is the explicit "remove the capstone" signal — omitting the key
  // leaves the stored value untouched (PATCH merge semantics).
  finalAssessment: createTrackSchema.shape.finalAssessment.nullable(),
});
export type UpdateTrackDto = z.infer<typeof updateTrackSchema>;
