import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Materials', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('admin uploads a markdown material and gets extracted text back', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/materials/upload')
      .set(admin)
      .field('title', 'Ratios Reading Pack')
      .attach('file', Buffer.from('# Ratios\nA ratio compares two quantities.'), {
        filename: 'ratios.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    expect(res.body.title).toBe('Ratios Reading Pack');
    expect(res.body.source).toBe('upload');
    expect(res.body.status).toBe('ready');
    expect(res.body.extractedText).toContain('A ratio compares two quantities.');
    expect(res.body.file.mimeType).toBe('text/markdown');
  });

  it('rejects unsupported file types with 415', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/materials/upload')
      .set(admin)
      .field('title', 'Nope')
      .attach('file', Buffer.from('MZ...'), { filename: 'evil.exe', contentType: 'application/x-msdownload' })
      .expect(415);
  });

  it('candidate cannot upload materials (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/materials/upload')
      .set(candidate)
      .field('title', 'Nope')
      .attach('file', Buffer.from('# x'), { filename: 'x.md', contentType: 'text/markdown' })
      .expect(403);
  });

  it('generation returns 503 when no ANTHROPIC_API_KEY is configured', async () => {
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'verbal-reasoning', name: 'Verbal Reasoning', scoringMode: 'correctness' });

    await request(ctx.app.getHttpServer())
      .post('/admin/materials/generate')
      .set(admin)
      .send({ topic: 'Reading comprehension: ratios', numQuestions: 3, categoryId: cat.body._id })
      .expect(503);
  });
});
