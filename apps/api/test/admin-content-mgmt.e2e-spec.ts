import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Admin content management', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let categoryId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'logical-reasoning', name: 'Logical Reasoning', scoringMode: 'correctness' });
    categoryId = cat.body._id;
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const mcq = () => ({
    type: 'mcq',
    categoryId,
    difficulty: 2,
    prompt: 'Which shape completes the sequence?',
    options: ['circle', 'square', 'triangle'],
    correct: [1],
    tags: [],
  });

  it('admin edits a question prompt and difficulty', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send(mcq())
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/questions/${created.body._id}`)
      .set(admin)
      .send({ prompt: 'Which figure completes the series?', difficulty: 4 })
      .expect(200);

    expect(res.body.prompt).toBe('Which figure completes the series?');
    expect(res.body.difficulty).toBe(4);
    expect(res.body.options).toEqual(['circle', 'square', 'triangle']);
    expect(res.body.correct).toEqual([1]);
  });

  it('rejects an edit that breaks the type invariants (merged revalidation)', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send(mcq())
      .expect(201);

    // Emptying correct on an mcq must fail the merged createQuestionSchema parse.
    await request(ctx.app.getHttpServer())
      .patch(`/admin/questions/${created.body._id}`)
      .set(admin)
      .send({ correct: [] })
      .expect(400);

    // Out-of-range index against the stored options fails too.
    await request(ctx.app.getHttpServer())
      .patch(`/admin/questions/${created.body._id}`)
      .set(admin)
      .send({ correct: [9] })
      .expect(400);
  });

  it('rejects an edit pointing at an unknown category (400)', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send(mcq())
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/questions/${created.body._id}`)
      .set(admin)
      .send({ categoryId: '507f1f77bcf86cd799439099' })
      .expect(400);
    expect(res.body.message).toBe('Unknown category');
  });

  const lesson = (title: string) => ({
    title,
    contentBlocks: [{ type: 'markdown', markdown: `# ${title}` }],
    estMinutes: 5,
    tags: [],
  });

  it('admin lists lessons with cursor pagination', async () => {
    await request(ctx.app.getHttpServer()).post('/admin/lessons').set(admin).send(lesson('L1')).expect(201);
    await request(ctx.app.getHttpServer()).post('/admin/lessons').set(admin).send(lesson('L2')).expect(201);

    const page1 = await request(ctx.app.getHttpServer())
      .get('/admin/lessons?limit=1')
      .set(admin)
      .expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(ctx.app.getHttpServer())
      .get(`/admin/lessons?limit=1&after=${page1.body.nextCursor}`)
      .set(admin)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].title).not.toBe(page1.body.items[0].title);
  });

  it('admin edits a lesson', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send(lesson('Editable'))
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/lessons/${created.body._id}`)
      .set(admin)
      .send({ title: 'Edited title', estMinutes: 9 })
      .expect(200);
    expect(res.body.title).toBe('Edited title');
    expect(res.body.estMinutes).toBe(9);
    expect(res.body.contentBlocks).toHaveLength(1);
  });

  it('archiving a lesson hides it from candidates and the default list', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send(lesson('Doomed'))
      .expect(201);

    const archived = await request(ctx.app.getHttpServer())
      .delete(`/admin/lessons/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(archived.body.status).toBe('archived');

    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/lessons/${created.body._id}`)
      .set(candidate)
      .expect(404);

    const list = await request(ctx.app.getHttpServer())
      .get('/admin/lessons?limit=100')
      .set(admin)
      .expect(200);
    const ids = list.body.items.map((l: { _id: string }) => l._id);
    expect(ids).not.toContain(created.body._id);

    const archivedList = await request(ctx.app.getHttpServer())
      .get('/admin/lessons?status=archived&limit=100')
      .set(admin)
      .expect(200);
    expect(archivedList.body.items.map((l: { _id: string }) => l._id)).toContain(created.body._id);
  });

  const problem = (title: string) => ({
    title,
    statement: 'Return the sum of two numbers.',
    difficulty: 1,
    categoryId,
    languages: ['python'],
    starterCode: { python: 'def solve(): pass' },
    testCases: [{ input: '1 2', expectedOutput: '3', hidden: false, weight: 1 }],
  });

  it('admin lists, edits and archives a coding problem; candidates lose access', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send(problem('Sum'))
      .expect(201);

    const list = await request(ctx.app.getHttpServer())
      .get('/admin/coding-problems?limit=100')
      .set(admin)
      .expect(200);
    expect(list.body.items.map((p: { _id: string }) => p._id)).toContain(created.body._id);
    expect(list.body.nextCursor).toBeDefined();

    const edited = await request(ctx.app.getHttpServer())
      .patch(`/admin/coding-problems/${created.body._id}`)
      .set(admin)
      .send({ title: 'Sum of two', difficulty: 2 })
      .expect(200);
    expect(edited.body.title).toBe('Sum of two');
    expect(edited.body.difficulty).toBe(2);
    expect(edited.body.testCases).toHaveLength(1);

    const archived = await request(ctx.app.getHttpServer())
      .delete(`/admin/coding-problems/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(archived.body.status).toBe('archived');

    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/coding-problems/${created.body._id}`)
      .set(candidate)
      .expect(404);

    const defaultList = await request(ctx.app.getHttpServer())
      .get('/admin/coding-problems?limit=100')
      .set(admin)
      .expect(200);
    expect(defaultList.body.items.map((p: { _id: string }) => p._id)).not.toContain(
      created.body._id,
    );
  });

  it('candidates get 403 on every new admin route', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    const server = ctx.app.getHttpServer();
    const someId = '507f1f77bcf86cd799439011';
    await request(server).patch(`/admin/questions/${someId}`).set(candidate).send({}).expect(403);
    await request(server).get('/admin/lessons').set(candidate).expect(403);
    await request(server).patch(`/admin/lessons/${someId}`).set(candidate).send({}).expect(403);
    await request(server).delete(`/admin/lessons/${someId}`).set(candidate).expect(403);
    await request(server).get('/admin/coding-problems').set(candidate).expect(403);
    await request(server)
      .patch(`/admin/coding-problems/${someId}`)
      .set(candidate)
      .send({})
      .expect(403);
    await request(server).delete(`/admin/coding-problems/${someId}`).set(candidate).expect(403);
  });
});
