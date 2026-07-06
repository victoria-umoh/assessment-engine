import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Lessons', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const lesson = () => ({
    title: 'Intro to Ratios',
    contentBlocks: [
      { type: 'markdown', markdown: '# Ratios\nA ratio compares two quantities.' },
      { type: 'video', url: 'https://videos.example.com/ratios-101', caption: 'Ratios in 5 minutes' },
    ],
    estMinutes: 12,
    tags: ['numeracy'],
  });

  it('admin creates a lesson with markdown and video blocks', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send(lesson())
      .expect(201);
    expect(res.body.title).toBe('Intro to Ratios');
    expect(res.body.contentBlocks).toHaveLength(2);
    expect(res.body.status).toBe('active');
  });

  it('rejects a video block without a url (400)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({ ...lesson(), contentBlocks: [{ type: 'video', caption: 'no url' }] })
      .expect(400);
  });

  it('candidate cannot create lessons (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(candidate)
      .send(lesson())
      .expect(403);
  });
});
