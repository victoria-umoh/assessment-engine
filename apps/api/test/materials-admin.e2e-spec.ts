import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Materials admin surface', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  async function uploadMaterial(title: string): Promise<{ _id: string }> {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/materials/upload')
      .set(admin)
      .field('title', title)
      .attach('file', Buffer.from(`# ${title}\nBody text for ${title}.`), {
        filename: 'doc.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    return res.body;
  }

  it('admin lists materials without heavy content fields', async () => {
    const created = await uploadMaterial('Ratios');

    const list = await request(ctx.app.getHttpServer())
      .get('/admin/materials?limit=100')
      .set(admin)
      .expect(200);

    const row = list.body.items.find((m: { _id: string }) => m._id === created._id);
    expect(row).toBeDefined();
    expect(row.title).toBe('Ratios');
    expect(row.source).toBe('upload');
    expect(row.status).toBe('ready');
    expect(row.archived).toBe(false);
    expect(row.linkedQuestionCount).toBe(0);
    expect(row).not.toHaveProperty('content');
    expect(row).not.toHaveProperty('extractedText');
    expect(row).not.toHaveProperty('storageKey');
    expect(list.body.nextCursor).toBeDefined();
  });

  it('admin detail view exposes edit fields but never storageKey', async () => {
    const created = await uploadMaterial('Fractions');

    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/materials/${created._id}`)
      .set(admin)
      .expect(200);

    expect(res.body.title).toBe('Fractions');
    expect(res.body.source).toBe('upload');
    expect(res.body.status).toBe('ready');
    expect(res.body.extractedText).toContain('Fractions');
    expect(res.body.linkedQuestionIds).toEqual([]);
    expect(res.body.file.mimeType).toBe('text/markdown');
    expect(res.body.file).not.toHaveProperty('storageKey');
    expect(JSON.stringify(res.body)).not.toContain('storageKey');

    await request(ctx.app.getHttpServer())
      .get('/admin/materials/507f1f77bcf86cd799439099')
      .set(admin)
      .expect(404);
  });

  it('admin edits content and links real questions; bogus links 400', async () => {
    const created = await uploadMaterial('Percentages');

    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'verbal-reasoning', name: 'Verbal Reasoning', scoringMode: 'correctness' })
      .expect(201);
    const question = await request(ctx.app.getHttpServer())
      .post('/admin/questions')
      .set(admin)
      .send({
        type: 'mcq',
        categoryId: cat.body._id,
        difficulty: 1,
        prompt: 'What is 10% of 50?',
        options: ['5', '10'],
        correct: [0],
        tags: [],
      })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/materials/${created._id}`)
      .set(admin)
      .send({
        title: 'Percentages (rev)',
        content: '# Percentages\nAuthored body.',
        linkedQuestionIds: [question.body._id],
      })
      .expect(200);
    expect(res.body.title).toBe('Percentages (rev)');
    expect(res.body.content).toBe('# Percentages\nAuthored body.');
    expect(res.body.linkedQuestionIds).toEqual([question.body._id]);

    const bogus = await request(ctx.app.getHttpServer())
      .patch(`/admin/materials/${created._id}`)
      .set(admin)
      .send({ linkedQuestionIds: ['507f1f77bcf86cd799439099'] })
      .expect(400);
    expect(bogus.body.message).toBe('Unknown question');
  });

  it('linkedQuestionIds edits sync question.materialId (unlink is not a no-op)', async () => {
    // question.materialId is what the reading-quiz sampler and the admin
    // roster query use — PATCHing the material's link list must keep it in
    // step, or "Unlink" changes nothing candidates see.
    const material = await uploadMaterial('Syncing');
    const cat = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'logical-reasoning', name: 'Logical Reasoning', scoringMode: 'correctness' })
      .expect(201);
    const makeQuestion = async (prompt: string, materialId?: string) => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'mcq',
          categoryId: cat.body._id,
          difficulty: 1,
          prompt,
          options: ['a', 'b'],
          correct: [0],
          tags: [],
          ...(materialId ? { materialId } : {}),
        })
        .expect(201);
      return res.body as { _id: string };
    };
    const linked = await makeQuestion('Linked at birth', material._id);
    const adopted = await makeQuestion('Adopted later');

    const roster = async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/admin/questions?materialId=${material._id}&limit=100`)
        .set(admin)
        .expect(200);
      return res.body.items.map((q: { _id: string }) => q._id);
    };
    expect(await roster()).toEqual([linked._id]);

    // Replace the link list: drop `linked`, add `adopted`.
    await request(ctx.app.getHttpServer())
      .patch(`/admin/materials/${material._id}`)
      .set(admin)
      .send({ linkedQuestionIds: [adopted._id] })
      .expect(200);

    expect(await roster()).toEqual([adopted._id]);
  });

  it('archiving hides a material from candidates and the default list; candidates 403 on admin routes', async () => {
    const created = await uploadMaterial('Doomed reading');

    const archived = await request(ctx.app.getHttpServer())
      .delete(`/admin/materials/${created._id}`)
      .set(admin)
      .expect(200);
    expect(archived.body.archived).toBe(true);

    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/materials/${created._id}`)
      .set(candidate)
      .expect(404);

    const defaultList = await request(ctx.app.getHttpServer())
      .get('/admin/materials?limit=100')
      .set(admin)
      .expect(200);
    expect(defaultList.body.items.map((m: { _id: string }) => m._id)).not.toContain(created._id);

    const archivedList = await request(ctx.app.getHttpServer())
      .get('/admin/materials?archived=true&limit=100')
      .set(admin)
      .expect(200);
    expect(archivedList.body.items.map((m: { _id: string }) => m._id)).toContain(created._id);

    const server = ctx.app.getHttpServer();
    await request(server).get('/admin/materials').set(candidate).expect(403);
    await request(server).get(`/admin/materials/${created._id}`).set(candidate).expect(403);
    await request(server).patch(`/admin/materials/${created._id}`).set(candidate).send({}).expect(403);
    await request(server).delete(`/admin/materials/${created._id}`).set(candidate).expect(403);
  });
});
