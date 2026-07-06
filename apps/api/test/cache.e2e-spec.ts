import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';
import { FinalizationService } from '../src/assessments/finalization.service';
import { CacheService } from '../src/cache/cache.service';
import { EnrollmentsService } from '../src/enrollments/enrollments.service';

// Recording stub: reads flow through so responses stay real; we assert the
// key/TTL contract documented in ARCHITECTURE.md (spec §6).
const wrapCalls: Array<{ key: string; ttl: number }> = [];
const delCalls: string[][] = [];
const cacheStub = {
  async get() {
    return null;
  },
  async set() {},
  async del(...keys: string[]) {
    delCalls.push(keys);
  },
  async wrap<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
    wrapCalls.push({ key, ttl });
    return fn();
  },
};

describe('Cache wiring', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp({
      overrides: (b) => b.overrideProvider(CacheService).useValue(cacheStub),
    });
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  beforeEach(() => {
    wrapCalls.length = 0;
    delCalls.length = 0;
  });

  it('GET /categories reads through cats:active (ttl 300)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'cache-cat', name: 'Cache Cat', scoringMode: 'correctness' })
      .expect(201);
    const res = await request(ctx.app.getHttpServer()).get('/categories').set(admin).expect(200);
    expect(res.body.map((c: { key: string }) => c.key)).toContain('cache-cat');
    expect(wrapCalls).toContainEqual({ key: 'cats:active', ttl: 300 });
  });

  it('candidate track reads go through track:pub:list and track:pub:<id> (ttl 300)', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Cache lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Cache track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0.5, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);

    wrapCalls.length = 0;
    const list = await request(ctx.app.getHttpServer()).get('/tracks').set(admin).expect(200);
    expect(list.body.map((t: { _id: string }) => t._id)).toContain(track.body._id);
    expect(wrapCalls).toContainEqual({ key: 'track:pub:list', ttl: 300 });

    await request(ctx.app.getHttpServer()).get(`/tracks/${track.body._id}`).set(admin).expect(200);
    expect(wrapCalls).toContainEqual({ key: `track:pub:${track.body._id}`, ttl: 300 });
  });

  it('candidate lesson reads cache the serialized VIEW under lesson:cand:<id> (ttl 300)', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Cached lesson view',
        contentBlocks: [{ type: 'markdown', markdown: 'body' }],
        estMinutes: 2,
      })
      .expect(201);
    wrapCalls.length = 0;
    const res = await request(ctx.app.getHttpServer())
      .get(`/lessons/${lesson.body._id}`)
      .set(admin)
      .expect(200);
    expect(wrapCalls).toContainEqual({ key: `lesson:cand:${lesson.body._id}`, ttl: 300 });
    // The cached value is the candidate view (projection applied before caching).
    expect(res.body).not.toHaveProperty('status');
    expect(res.body.title).toBe('Cached lesson view');
  });

  it('unlock-state reads cache briefly under unlock:<enrollmentId> (ttl 30)', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Unlock lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Unlock cache track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0.5, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId: track.body._id })
      .expect(201);

    wrapCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}/unlock-state`)
      .set(candidate)
      .expect(200);
    expect(wrapCalls).toContainEqual({ key: `unlock:${enrollment.body._id}`, ttl: 30 });
  });

  it('category create and archive invalidate cats:active', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'inval-cat', name: 'Inval Cat', scoringMode: 'correctness' })
      .expect(201);
    expect(delCalls).toContainEqual(['cats:active']);

    delCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .delete(`/admin/categories/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(delCalls).toContainEqual(['cats:active']);
  });

  it('track update/publish/archive invalidate track:pub:list and track:pub:<id>', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Inval track lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Inval track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0.5, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    const id = track.body._id as string;
    const expected = ['track:pub:list', `track:pub:${id}`];

    delCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .patch(`/admin/tracks/${id}`)
      .set(admin)
      .send({ title: 'Inval track v2' })
      .expect(200);
    expect(delCalls).toContainEqual(expected);

    delCalls.length = 0;
    await request(ctx.app.getHttpServer()).post(`/admin/tracks/${id}/publish`).set(admin).expect(200);
    expect(delCalls).toContainEqual(expected);

    delCalls.length = 0;
    await request(ctx.app.getHttpServer()).delete(`/admin/tracks/${id}`).set(admin).expect(200);
    expect(delCalls).toContainEqual(expected);
  });

  it('lesson update/archive invalidate lesson:cand:<id>', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Inval lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const id = lesson.body._id as string;

    delCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .patch(`/admin/lessons/${id}`)
      .set(admin)
      .send({ title: 'Inval lesson v2' })
      .expect(200);
    expect(delCalls).toContainEqual([`lesson:cand:${id}`]);

    delCalls.length = 0;
    await request(ctx.app.getHttpServer()).delete(`/admin/lessons/${id}`).set(admin).expect(200);
    expect(delCalls).toContainEqual([`lesson:cand:${id}`]);
  });

  it('completing an item invalidates unlock:<enrollmentId>', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Complete inval lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Complete inval track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0.5, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId: track.body._id })
      .expect(201);

    delCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .post(
        `/enrollments/${enrollment.body._id}/items/${track.body.days[0].items[0].itemId}/complete`,
      )
      .set(candidate)
      .expect(200);
    expect(delCalls).toContainEqual([`unlock:${enrollment.body._id}`]);

    // Graded path (quiz/coding results) must invalidate too.
    delCalls.length = 0;
    await ctx.app
      .get(EnrollmentsService)
      .recordItemResult(enrollment.body._id, track.body.days[0].items[0].itemId, 90);
    expect(delCalls).toContainEqual([`unlock:${enrollment.body._id}`]);
  });

  it('cohort dashboard reads through cohort:dash:<id> (ttl 30)', async () => {
    const lesson = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Dash lesson',
        contentBlocks: [{ type: 'markdown', markdown: 'x' }],
        estMinutes: 1,
      })
      .expect(201);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Dash track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lesson.body._id }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0.5, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const cohort = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId: track.body._id, name: 'Dash cohort', startDate: new Date().toISOString() })
      .expect(201);

    wrapCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .get(`/admin/cohorts/${cohort.body._id}/dashboard`)
      .set(admin)
      .expect(200);
    expect(wrapCalls).toContainEqual({ key: `cohort:dash:${cohort.body._id}`, ttl: 30 });

    // Editing the cohort (e.g. moving startDate) busts its dashboard cache.
    delCalls.length = 0;
    await request(ctx.app.getHttpServer())
      .patch(`/admin/cohorts/${cohort.body._id}`)
      .set(admin)
      .send({ name: 'Dash cohort renamed' })
      .expect(200);
    expect(delCalls).toContainEqual([`cohort:dash:${cohort.body._id}`]);

    // Finalization of a cohort enrollment busts the dashboard cache.
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ inviteCode: cohort.body.inviteCode })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(
        `/enrollments/${enrollment.body._id}/items/${track.body.days[0].items[0].itemId}/complete`,
      )
      .set(candidate)
      .expect(200);
    delCalls.length = 0;
    await ctx.app.get(FinalizationService).finalize(enrollment.body._id);
    expect(delCalls).toContainEqual([`cohort:dash:${cohort.body._id}`]);
  });
});
