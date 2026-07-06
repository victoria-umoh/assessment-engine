/**
 * Seed CLI: `pnpm --filter api seed` (requires MONGO_URI etc. in the environment).
 * Idempotent — safe to re-run; existing categories/questions are updated in place.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const { categories, questions } = await app.get(SeedService).run();
    console.log(`Seed complete: ${categories} categories, ${questions} questions.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
