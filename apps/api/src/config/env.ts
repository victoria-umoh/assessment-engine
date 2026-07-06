import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JUDGE0_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Comma-separated CORS allowlist for the web app (Phase 1 rider, closed Phase 5).
  WEB_ORIGIN: z.string().min(1).optional(),
  // Rate limit applied to auth + submission-creating routes (spec §7). Config-driven so
  // the test factory can raise it (auth.helper logs in once per minted user).
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
