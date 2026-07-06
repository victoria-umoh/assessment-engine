import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

const validScoring = {
  weights: { quiz: 0.4, coding: 0.3, exercise: 0.1, reading: 0.2, finalAssessment: 0 },
  passThreshold: 0.7,
};

describe('Cohorts', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  async function createPublishedTrack(title: string): Promise<string> {
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
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    return track.body._id;
  }

  it('admin creates a cohort on a published track', async () => {
    const trackId = await createPublishedTrack('Cohort host');
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId, name: 'July intake', startDate: new Date().toISOString() })
      .expect(201);
    expect(res.body.inviteCode).toMatch(/^[A-Z2-7]{8}$/);
    expect(res.body.status).toBe('active');
    expect(res.body.trackId).toBe(trackId);
  });

  it('cohort with future startDate is scheduled', async () => {
    const trackId = await createPublishedTrack('Future cohort host');
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({
        trackId,
        name: 'August intake',
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .expect(201);
    expect(res.body.status).toBe('scheduled');
  });

  it('cohort on a draft track → 400', async () => {
    const draft = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Draft host', durationDays: 7, scoring: validScoring })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId: draft.body._id, name: 'Nope', startDate: new Date().toISOString() })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('published');
  });

  it('unknown trackId → 400', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({
        trackId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Ghost',
        startDate: new Date().toISOString(),
      })
      .expect(400);
  });

  it('candidate cannot create a cohort (403)', async () => {
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(candidate)
      .send({
        trackId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        name: 'Nope',
        startDate: new Date().toISOString(),
      })
      .expect(403);
  });

  it('list filters by trackId', async () => {
    const trackA = await createPublishedTrack('Filter A');
    const trackB = await createPublishedTrack('Filter B');
    const start = new Date().toISOString();
    await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId: trackA, name: 'A1', startDate: start })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId: trackB, name: 'B1', startDate: start })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/cohorts?trackId=${trackA}`)
      .set(admin)
      .expect(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].name).toBe('A1');
  });

  it('PATCH recomputes status when startDate moves across now', async () => {
    const trackId = await createPublishedTrack('Recompute host');
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId, name: 'Shifting intake', startDate: new Date().toISOString() })
      .expect(201);
    expect(created.body.status).toBe('active');

    const toFuture = await request(ctx.app.getHttpServer())
      .patch(`/admin/cohorts/${created.body._id}`)
      .set(admin)
      .send({ startDate: new Date(Date.now() + 7 * 86400000).toISOString() })
      .expect(200);
    expect(toFuture.body.status).toBe('scheduled');

    const backToPast = await request(ctx.app.getHttpServer())
      .patch(`/admin/cohorts/${created.body._id}`)
      .set(admin)
      .send({ startDate: new Date(Date.now() - 86400000).toISOString() })
      .expect(200);
    expect(backToPast.body.status).toBe('active');
  });

  it('DELETE archives a cohort', async () => {
    const trackId = await createPublishedTrack('Archive host');
    const cohort = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId, name: 'Doomed', startDate: new Date().toISOString() })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .delete(`/admin/cohorts/${cohort.body._id}`)
      .set(admin)
      .expect(200);
    expect(res.body.status).toBe('archived');
  });
});
