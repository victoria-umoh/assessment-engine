import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Categories', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('admin creates a category', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'logical-reasoning', name: 'Logical Reasoning', scoringMode: 'correctness' })
      .expect(201);
    expect(res.body.key).toBe('logical-reasoning');
    expect(res.body.status).toBe('active');
  });

  it('candidate cannot create (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(candidate)
      .send({ key: 'x-cat', name: 'X', scoringMode: 'correctness' })
      .expect(403);
  });

  it('unauthenticated cannot create (401)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .send({ key: 'y-cat', name: 'Y', scoringMode: 'correctness' })
      .expect(401);
  });

  it('rejects invalid payload (400)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'Bad Key!', name: 'Bad', scoringMode: 'correctness' })
      .expect(400);
  });

  it('duplicate key is rejected with 409', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'logical-reasoning', name: 'Dup', scoringMode: 'correctness' })
      .expect(409);
  });

  it('GET /categories lists active categories for any authenticated user', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer()).get('/categories').set(candidate).expect(200);
    expect(res.body.map((c: { key: string }) => c.key)).toContain('logical-reasoning');
  });

  it('archive (DELETE) hides a category from the list', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'temp-cat', name: 'Temp', scoringMode: 'correctness' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .delete(`/admin/categories/${created.body._id}`)
      .set(admin)
      .expect(200);

    const res = await request(ctx.app.getHttpServer()).get('/categories').set(admin).expect(200);
    expect(res.body.map((c: { key: string }) => c.key)).not.toContain('temp-cat');
  });
});
