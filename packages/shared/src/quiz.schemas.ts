import { z } from 'zod';

// Parsed from TrackItem.config at attempt start (config also carries
// required:false etc. — passthrough keeps unknown keys out of our way).
export const quizItemConfigSchema = z
  .object({
    count: z.number().int().min(1).max(50).default(10),
    categoryIds: z.array(z.string()).optional(),
    difficulty: z
      .object({
        min: z.number().int().min(1).max(5),
        max: z.number().int().min(1).max(5),
      })
      .optional(),
    timeLimitSec: z.number().int().min(30).max(7200).default(900),
    maxAttempts: z.number().int().min(1).optional(),
  })
  .passthrough();
export type QuizItemConfig = z.infer<typeof quizItemConfigSchema>;

export const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        answer: z.union([
          z.number().int().min(0),
          z.array(z.number().int().min(0)),
          z.string().max(2000),
        ]),
      }),
    )
    .max(100),
});
export type SubmitQuizDto = z.infer<typeof submitQuizSchema>;
