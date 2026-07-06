import { z } from 'zod';

export const createSubmissionSchema = z
  .object({
    enrollmentId: z.string().min(1),
    itemId: z.string().min(1).optional(),
    problemId: z.string().min(1),
    language: z.string().min(1),
    sourceCode: z.string().min(1).max(65536),
    final: z.boolean().default(false),
  })
  .refine((d) => d.final !== Boolean(d.itemId), {
    message: 'Provide itemId for day items or final:true for the capstone',
  });
export type CreateSubmissionDto = z.infer<typeof createSubmissionSchema>;
