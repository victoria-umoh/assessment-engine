import request from 'supertest';
import { Role } from '@lms/shared';
import { MaterialGenerator } from '../src/materials/material-generator';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

// Lives in its own spec file: ConfigModule captures env at import time, so
// each jest module registry supports exactly ONE createTestApp() boot.
describe('Materials generation (stubbed generator)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let categoryId: string;

  const stub = {
    isConfigured: () => true,
    generate: async (topic: string, numQuestions: number) => ({
      title: `Reading: ${topic}`,
      content: `# ${topic}\n\nGenerated body text.`,
      questions: Array.from({ length: numQuestions }, (_, i) => ({
        type: 'mcq' as const,
        prompt: `Comprehension question ${i + 1} about ${topic}?`,
        options: ['A', 'B', 'C', 'D'],
        correct: [i % 4],
        explanation: 'Stub explanation.',
      })),
    }),
  };

  beforeAll(async () => {
    ctx = await createTestApp({
      overrides: (builder) => builder.overrideProvider(MaterialGenerator).useValue(stub),
    });
    admin = await authHeader(ctx, Role.Admin);
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'verbal-reasoning', name: 'Verbal Reasoning', scoringMode: 'correctness' });
    categoryId = cat.body._id;
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('creates the material with linked comprehension questions', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/materials/generate')
      .set(admin)
      .send({ topic: 'Ratios', numQuestions: 3, categoryId })
      .expect(201);

    expect(res.body.source).toBe('generated');
    expect(res.body.content).toContain('Generated body text.');
    expect(res.body.linkedQuestionIds).toHaveLength(3);

    const linked = await request(ctx.app.getHttpServer())
      .get('/admin/questions')
      .query({ materialId: res.body._id })
      .set(admin)
      .expect(200);
    expect(linked.body.items).toHaveLength(3);
    expect(linked.body.items[0].source).toBe('generated');
  });
});
