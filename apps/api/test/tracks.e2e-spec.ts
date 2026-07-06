import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

const validScoring = {
  weights: { quiz: 0.4, coding: 0.3, exercise: 0.1, reading: 0.2, finalAssessment: 0 },
  passThreshold: 0.7,
};

describe('Tracks', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('admin creates a draft track', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Bootcamp', durationDays: 7, scoring: validScoring })
      .expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.days).toEqual([]);
    expect(res.body.title).toBe('Bootcamp');
  });

  it('weights not summing to 1 → 400', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Bad weights',
        durationDays: 7,
        scoring: {
          weights: { quiz: 0.9, coding: 0, exercise: 0, reading: 0, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(400);
  });

  it('candidate cannot create (403); unauthenticated 401', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    const body = { title: 'Nope', durationDays: 7, scoring: validScoring };
    await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(candidate)
      .send(body)
      .expect(403);
    await request(ctx.app.getHttpServer()).post('/admin/tracks').send(body).expect(401);
  });

  it('PATCH finalAssessment: null removes a saved capstone from a draft', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Capstone removal',
        durationDays: 1,
        scoring: validScoring,
        finalAssessment: { quizConfig: { count: 5 } },
      })
      .expect(201);
    expect(created.body.finalAssessment).toBeDefined();

    const cleared = await request(ctx.app.getHttpServer())
      .patch(`/admin/tracks/${created.body._id}`)
      .set(admin)
      .send({ finalAssessment: null })
      .expect(200);
    expect(cleared.body.finalAssessment ?? undefined).toBeUndefined();

    // And the removal survives a re-read (not just the PATCH echo).
    const reread = await request(ctx.app.getHttpServer())
      .get(`/admin/tracks/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(reread.body.finalAssessment ?? undefined).toBeUndefined();
  });

  it('PATCH adds a day with a lesson item; itemId is assigned', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Intro',
        contentBlocks: [{ type: 'markdown', markdown: '# Hello' }],
        estMinutes: 10,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'With day', durationDays: 7, scoring: validScoring })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/admin/tracks/${track.body._id}`)
      .set(admin)
      .send({ days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }] })
      .expect(200);
    expect(res.body.days[0].items[0].itemId).toMatch(/^[a-f0-9]{24}$/);
  });

  it('publish fails on empty track', async () => {
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Empty', durationDays: 7, scoring: validScoring })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('at least one day');
  });

  it('publish fails when days.length does not match durationDays', async () => {
    const lessonRes = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Mismatch lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'hi' }],
        estMinutes: 5,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Mismatch',
        durationDays: 3,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lessonRes.body._id }] }],
        scoring: validScoring,
      })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('track has 1 days but durationDays is 3');
  });

  it('publish fails on dangling refId', async () => {
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Dangling',
        durationDays: 7,
        days: [
          { dayNumber: 1, items: [{ type: 'lesson', refId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }] },
        ],
        scoring: validScoring,
      })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('refId');
  });

  async function createValidTrack(title: string) {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: `${title} lesson`,
        contentBlocks: [{ type: 'markdown', markdown: '# Day 1' }],
        estMinutes: 5,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: validScoring,
      })
      .expect(201);
    return track.body;
  }

  it('publish succeeds on valid track', async () => {
    const track = await createValidTrack('Publishable');
    const res = await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track._id}/publish`)
      .set(admin)
      .expect(200);
    expect(res.body.status).toBe('published');
  });

  it('PATCH on published → 409', async () => {
    const track = await createValidTrack('Locked after publish');
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track._id}/publish`)
      .set(admin)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .patch(`/admin/tracks/${track._id}`)
      .set(admin)
      .send({ title: 'New title' })
      .expect(409);
  });

  it('GET /tracks lists only published for candidates', async () => {
    const published = await createValidTrack('Visible to candidates');
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${published._id}/publish`)
      .set(admin)
      .expect(200);
    const draft = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Hidden draft', durationDays: 7, scoring: validScoring })
      .expect(201);
    const candidate = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer()).get('/tracks').set(candidate).expect(200);
    const ids = res.body.map((t: { _id: string }) => t._id);
    expect(ids).toContain(published._id);
    expect(ids).not.toContain(draft.body._id);
    expect(res.body.every((t: { status: string }) => t.status === 'published')).toBe(true);
  });

  it('GET /tracks/:id of draft → 404 for candidate', async () => {
    const draft = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Draft detail', durationDays: 7, scoring: validScoring })
      .expect(201);
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/tracks/${draft.body._id}`)
      .set(candidate)
      .expect(404);
  });

  it('DELETE archives; archived track leaves /tracks list', async () => {
    const track = await createValidTrack('To be archived');
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track._id}/publish`)
      .set(admin)
      .expect(200);
    const del = await request(ctx.app.getHttpServer())
      .delete(`/admin/tracks/${track._id}`)
      .set(admin)
      .expect(200);
    expect(del.body.status).toBe('archived');
    const candidate = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer()).get('/tracks').set(candidate).expect(200);
    expect(res.body.map((t: { _id: string }) => t._id)).not.toContain(track._id);
  });

  it('candidate track views omit finalAssessment (exam integrity)', async () => {
    const track = await createValidTrack('Final exam leak');
    await request(ctx.app.getHttpServer())
      .patch(`/admin/tracks/${track._id}`)
      .set(admin)
      .send({ finalAssessment: { codingProblemIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'] } })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track._id}/publish`)
      .set(admin)
      .expect(200);
    const candidate = await authHeader(ctx, Role.Candidate);
    const detail = await request(ctx.app.getHttpServer())
      .get(`/tracks/${track._id}`)
      .set(candidate)
      .expect(200);
    expect(detail.body.finalAssessment).toBeUndefined();
    const list = await request(ctx.app.getHttpServer()).get('/tracks').set(candidate).expect(200);
    const inList = list.body.find((t: { _id: string }) => t._id === track._id);
    expect(inList.finalAssessment).toBeUndefined();
  });
});
