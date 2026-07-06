import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginDto = z.infer<typeof loginSchema>;

// Admin user management (Phase 6). Self role/status changes are rejected in
// the service layer, not here.
export const createUserSchema = registerSchema.extend({
  role: z.enum(['admin', 'candidate']).default('candidate'),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(1),
    role: z.enum(['admin', 'candidate']),
    status: z.enum(['active', 'disabled']),
  })
  .partial();
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
