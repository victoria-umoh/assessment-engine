import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Coding problems', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let categoryId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'computational-thinking', name: 'Computational Thinking', scoringMode: 'correctness' });
    categoryId = cat.body._id;
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const problem = () => ({
    title: 'Sum Two Numbers',
    statement: 'Read two integers from stdin and print their sum.',
    difficulty: 1,
    categoryId,
    languages: ['python', 'javascript'],
    starterCode: { python: 'a, b = map(int, input().split())\n# your code here' },
    testCases: [
      { input: '1 2', expectedOutput: '3', hidden: false, weight: 1 },
      { input: '10 20', expectedOutput: '30', hidden: true, weight: 2 },
      { input: '-5 5', expectedOutput: '0', hidden: true, weight: 2 },
    ],
  });

  it('admin creates a problem and reads back hidden test cases', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send(problem())
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/coding-problems/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(res.body.testCases).toHaveLength(3);
    expect(res.body.testCases.filter((t: { hidden: boolean }) => t.hidden)).toHaveLength(2);
    expect(res.body.limits).toEqual({ cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 }); // defaults
  });

  it('rejects a problem with zero test cases (400)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send({ ...problem(), testCases: [] })
      .expect(400);
  });

  it('candidate cannot create problems (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(candidate)
      .send(problem())
      .expect(403);
  });
});
