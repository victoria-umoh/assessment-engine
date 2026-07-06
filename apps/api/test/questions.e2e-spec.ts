import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Questions', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let categoryId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'numerical-reasoning', name: 'Numerical Reasoning', scoringMode: 'correctness' });
    categoryId = cat.body._id;
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const mcq = () => ({
    type: 'mcq',
    categoryId,
    difficulty: 2,
    prompt: 'What is 15% of 200?',
    options: ['20', '25', '30', '35'],
    correct: [2],
    explanation: '0.15 × 200 = 30',
    tags: ['percentages'],
  });

  it('admin creates an mcq question and can read it back with the answer', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send(mcq())
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/questions/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(res.body.prompt).toBe('What is 15% of 200?');
    expect(res.body.correct).toEqual([2]);
    expect(res.body.status).toBe('active');
    expect(res.body.source).toBe('admin');
  });

  it('rejects an mcq whose correct index is out of range (400)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({ ...mcq(), correct: [7] })
      .expect(400);
  });

  it('rejects an unknown categoryId (400)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({ ...mcq(), categoryId: '507f1f77bcf86cd799439099' })
      .expect(400);
  });

  it('candidate cannot create questions (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(candidate)
      .send(mcq())
      .expect(403);
  });

  it('accepts a likert question with traitMapping and rejects one with correct answers', async () => {
    const likert = {
      type: 'likert',
      categoryId,
      difficulty: 1,
      prompt: 'I enjoy meeting new people.',
      options: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
      traitMapping: { dimension: 'extraversion', direction: 1 },
    };
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send(likert)
      .expect(201);
    expect(created.body.traitMapping).toEqual({ dimension: 'extraversion', direction: 1 });

    await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({ ...likert, correct: [4] })
      .expect(400);
  });

  it('lists with filters and walks cursor pages without overlap', async () => {
    for (let i = 0; i < 5; i++) {
      await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({ ...mcq(), prompt: `Page item ${i}`, difficulty: 4 })
        .expect(201);
    }

    const seen = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = await request(ctx.app.getHttpServer())
        .get('/admin/questions')
        .query({ categoryId, difficulty: 4, limit: 2, ...(after ? { after } : {}) })
        .set(admin)
        .expect(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      for (const item of res.body.items) {
        expect(seen.has(item._id)).toBe(false);
        seen.add(item._id);
        expect(item.difficulty).toBe(4);
      }
      after = res.body.nextCursor;
      if (!after) break;
    }
    expect(seen.size).toBe(5);
  });

  it('archive (DELETE) removes a question from the default list', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({ ...mcq(), prompt: 'Archive me', difficulty: 5 })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .delete(`/admin/questions/${created.body._id}`)
      .set(admin)
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .get('/admin/questions')
      .query({ categoryId, difficulty: 5 })
      .set(admin)
      .expect(200);
    expect(res.body.items.map((q: { prompt: string }) => q.prompt)).not.toContain('Archive me');
  });
});
