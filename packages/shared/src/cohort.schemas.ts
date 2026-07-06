import { z } from 'zod';

const cohortBaseSchema = z.object({
  trackId: z.string().min(1),
  name: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().min(1).optional(),
  pacingOverrides: z
    .object({
      unlockMode: z.enum(['hybrid', 'progress-only', 'day-only']).optional(),
    })
    .optional(),
});

// Applies when both dates ride the same payload; an update carrying only
// endDate can't be checked against a startDate it doesn't have.
const endAfterStart = (
  d: { startDate?: Date; endDate?: Date },
  ctx: z.RefinementCtx,
): void => {
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be on or after startDate',
    });
  }
};

export const createCohortSchema = cohortBaseSchema.superRefine(endAfterStart);
export type CreateCohortDto = z.infer<typeof createCohortSchema>;

export const updateCohortSchema = cohortBaseSchema
  .partial()
  .omit({ trackId: true })
  .superRefine(endAfterStart);
export type UpdateCohortDto = z.infer<typeof updateCohortSchema>;
