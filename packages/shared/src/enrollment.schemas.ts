import { z } from 'zod';

export const enrollSchema = z
  .object({
    trackId: z.string().min(1).optional(),
    cohortId: z.string().min(1).optional(),
    inviteCode: z.string().min(1).optional(),
  })
  .refine((d) => d.trackId || d.cohortId || d.inviteCode, {
    message: 'trackId, cohortId or inviteCode required',
  });
export type EnrollDto = z.infer<typeof enrollSchema>;
