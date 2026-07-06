import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

// Candidate content reads (Phase 5 Task 1): lessons, materials, and coding
// problems become readable by any authenticated user through allowlist views —
// answer-bearing fields (hidden test cases, weights) and internal fields
// (storageKey, generationMeta, extractedText-as-field) never serialize.
describe('Candidate content reads', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let candidate: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
    candidate = await authHeader(ctx, Role.Candidate);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  describe('GET /lessons/:id', () => {
    let lessonId: string;

    beforeAll(async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/lessons')
        .set(admin)
        .send({
          title: 'Intro to Logic',
          contentBlocks: [
            { type: 'markdown', markdown: '# Welcome' },
            { type: 'video', url: 'https://example.com/v.mp4', caption: 'Overview' },
          ],
          estMinutes: 10,
          tags: ['logic'],
        });
      lessonId = res.body._id;
    });

    it('serves an active lesson to a candidate with exactly the allowlist fields', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/lessons/${lessonId}`)
        .set(candidate)
        .expect(200);
      expect(res.body.title).toBe('Intro to Logic');
      expect(res.body.contentBlocks).toHaveLength(2);
      expect(res.body.estMinutes).toBe(10);
      expect(res.body.tags).toEqual(['logic']);
      expect(Object.keys(res.body).sort()).toEqual(
        ['_id', 'contentBlocks', 'estMinutes', 'tags', 'title'].sort(),
      );
    });

    it('404s an archived lesson', async () => {
      const model = ctx.app.get(getModelToken('Lesson'));
      const archived = await model.create({
        title: 'Old lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 5,
        status: 'archived',
      });
      await request(ctx.app.getHttpServer())
        .get(`/lessons/${archived._id}`)
        .set(candidate)
        .expect(404);
    });

    it('401s without a token and keeps admin creation admin-only after the guard restructure', async () => {
      await request(ctx.app.getHttpServer()).get(`/lessons/${lessonId}`).expect(401);
      await request(ctx.app.getHttpServer())
        .post('/admin/lessons')
        .set(candidate)
        .send({
          title: 'Nope',
          contentBlocks: [{ type: 'markdown', markdown: 'x' }],
          estMinutes: 1,
        })
        .expect(403);
    });
  });

  describe('GET /materials/:id', () => {
    it('serves a ready material as { _id, title, body } — internal fields never serialize', async () => {
      const model = ctx.app.get(getModelToken('Material'));
      const ready = await model.create({
        title: 'Reading: Sets',
        source: 'authored',
        content: '# Sets\nA set is a collection.',
        extractedText: 'should not leak as its own field',
        status: 'ready',
      });
      const res = await request(ctx.app.getHttpServer())
        .get(`/materials/${ready._id}`)
        .set(candidate)
        .expect(200);
      expect(res.body).toEqual({
        _id: String(ready._id),
        title: 'Reading: Sets',
        body: '# Sets\nA set is a collection.',
      });
    });

    it('404s a material that is not ready and falls back to extractedText for uploads', async () => {
      const model = ctx.app.get(getModelToken('Material'));
      const processing = await model.create({
        title: 'Still processing',
        source: 'upload',
        status: 'processing',
      });
      await request(ctx.app.getHttpServer())
        .get(`/materials/${processing._id}`)
        .set(candidate)
        .expect(404);

      const uploaded = await model.create({
        title: 'Uploaded doc',
        source: 'upload',
        extractedText: 'Parsed text from the PDF.',
        status: 'ready',
      });
      const res = await request(ctx.app.getHttpServer())
        .get(`/materials/${uploaded._id}`)
        .set(candidate)
        .expect(200);
      expect(res.body.body).toBe('Parsed text from the PDF.');
    });
  });

  describe('GET /coding-problems/:id', () => {
    it('serves the candidate view: visible cases only, no hidden data or weights', async () => {
      const cat = await request(ctx.app.getHttpServer())
        .post('/admin/categories')
        .set(admin)
        .send({ key: 'computational-thinking', name: 'Computational Thinking', scoringMode: 'correctness' });
      const created = await request(ctx.app.getHttpServer())
        .post('/admin/coding-problems')
        .set(admin)
        .send({
          title: 'Sum Two Numbers',
          statement: 'Read two integers from stdin and print their sum.',
          difficulty: 1,
          categoryId: cat.body._id,
          languages: ['python', 'javascript'],
          starterCode: { python: 'print()' },
          testCases: [
            { input: '1 2', expectedOutput: '3', hidden: false, weight: 1 },
            { input: '10 20', expectedOutput: '30', hidden: true, weight: 2 },
          ],
        });
      const res = await request(ctx.app.getHttpServer())
        .get(`/coding-problems/${created.body._id}`)
        .set(candidate)
        .expect(200);
      expect(res.body.title).toBe('Sum Two Numbers');
      expect(res.body.starterCode).toEqual({ python: 'print()' });
      expect(res.body.visibleTestCases).toEqual([{ input: '1 2', expectedOutput: '3' }]);
      expect(res.body.testCases).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('"30"');
      expect(JSON.stringify(res.body)).not.toContain('hidden');
      expect(JSON.stringify(res.body)).not.toContain('weight');
    });

    it('404s an archived problem (indistinguishable from missing, like lessons/materials)', async () => {
      const model = ctx.app.get(getModelToken('CodingProblem'));
      const archived = await model.create({
        title: 'Retired problem',
        statement: 'old',
        difficulty: 1,
        categoryId: new Types.ObjectId(),
        languages: ['python'],
        testCases: [{ input: '1', expectedOutput: '1', hidden: false, weight: 1 }],
        status: 'archived',
      });
      await request(ctx.app.getHttpServer())
        .get(`/coding-problems/${archived._id}`)
        .set(candidate)
        .expect(404);
      // Admin read still serves it (lifecycle management).
      await request(ctx.app.getHttpServer())
        .get(`/admin/coding-problems/${archived._id}`)
        .set(admin)
        .expect(200);
    });
  });
});
