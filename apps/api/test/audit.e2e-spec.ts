import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Audit log', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('records admin mutations newest-first with actor, entity and payload diff', async () => {
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'abstract-reasoning', name: 'Abstract Reasoning', scoringMode: 'correctness' })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({
        type: 'mcq',
        categoryId: cat.body._id,
        difficulty: 3,
        prompt: 'Which figure comes next?',
        options: ['A', 'B'],
        correct: [0],
        tags: [],
      })
      .expect(201);

    const logs = await request(ctx.app.getHttpServer())
      .get('/admin/audit-logs')
      .set(admin)
      .expect(200);

    expect(logs.body.items.length).toBeGreaterThanOrEqual(2);
    const [newest, older] = logs.body.items;
    // Newest first: the question came after the category.
    expect(newest.entity).toBe('questions');
    expect(newest.action).toBe('POST /admin/questions');
    expect(newest.diff.prompt).toBe('Which figure comes next?');
    expect(newest.actorId).toBeDefined();
    expect(newest.at).toBeDefined();
    expect(older.entity).toBe('categories');
    expect(older.diff.key).toBe('abstract-reasoning');
  });

  it('strips password fields from diffs and ignores non-admin traffic; candidate 403 on viewer', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/users')
      .set(admin)
      .send({ email: 'audited@test.local', password: 'password123', name: 'Audited' })
      .expect(201);

    // Candidate (non-admin path) traffic must not be recorded.
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer()).get('/auth/me').set(candidate).expect(200);

    const logs = await request(ctx.app.getHttpServer())
      .get('/admin/audit-logs?entity=users')
      .set(admin)
      .expect(200);
    const entry = logs.body.items[0];
    expect(entry.entity).toBe('users');
    expect(entry.diff.email).toBe('audited@test.local');
    expect(entry.diff).not.toHaveProperty('password');
    // Every row honors the entity filter.
    expect(logs.body.items.every((l: { entity: string }) => l.entity === 'users')).toBe(true);
    // auth/register/login/me never show up (non-/admin paths).
    const all = await request(ctx.app.getHttpServer())
      .get('/admin/audit-logs?limit=100')
      .set(admin)
      .expect(200);
    expect(all.body.items.every((l: { entity: string }) => l.entity !== 'auth')).toBe(true);

    await request(ctx.app.getHttpServer()).get('/admin/audit-logs').set(candidate).expect(403);
  });

  it('caps oversized diffs instead of storing multi-KB payloads', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Giant lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x'.repeat(20_000) }],
        estMinutes: 5,
      })
      .expect(201);

    const logs = await request(ctx.app.getHttpServer())
      .get('/admin/audit-logs?entity=lessons')
      .set(admin)
      .expect(200);
    const entry = logs.body.items[0];
    expect(entry.diff).toEqual({ truncated: true, bytes: expect.any(Number) });
    expect(entry.diff.bytes).toBeGreaterThan(10_240);
  });
});
