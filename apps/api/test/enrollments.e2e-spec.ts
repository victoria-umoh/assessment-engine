import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

const validScoring = {
  weights: { quiz: 0.4, coding: 0.3, exercise: 0.1, reading: 0.2, finalAssessment: 0 },
  passThreshold: 0.7,
};

describe('Enrollments', () => {
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

  it('parallel completes across two items never 500 and land exactly once each', async () => {
    // Pins the optimistic-concurrency retry semantics (P3): version-guarded
    // writes may 409 under contention but must never 500 or double-apply.
    const mkLesson = async (t: string) =>
      (
        await request(ctx.app.getHttpServer())
          .post('/admin/lessons')
          .set(admin)
          .send({
            title: t,
            contentBlocks: [{ type: 'markdown', markdown: 'x' }],
            estMinutes: 1,
          })
          .expect(201)
      ).body._id as string;
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Concurrent completes',
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: await mkLesson('cc lesson 1') },
              { type: 'lesson', refId: await mkLesson('cc lesson 2') },
            ],
          },
        ],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const [itemA, itemB] = track.body.days[0].items.map((i: { itemId: string }) => i.itemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId: track.body._id })
      .expect(201);

    const complete = (itemId: string) =>
      request(ctx.app.getHttpServer())
        .post(`/enrollments/${enrollment.body._id}/items/${itemId}/complete`)
        .set(candidate);
    const results = await Promise.all([
      complete(itemA),
      complete(itemB),
      complete(itemA),
      complete(itemB),
    ]);
    for (const r of results) expect([200, 409]).toContain(r.status);

    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}`)
      .set(candidate)
      .expect(200);
    for (const itemId of [itemA, itemB]) {
      const p = enr.body.itemProgress.find((x: { itemId: string }) => x.itemId === itemId);
      expect(p.status).toBe('completed');
      expect(p.attempts).toBe(1);
    }
  });

  it('candidate enrolls in a published track', async () => {
    const trackId = await createPublishedTrack('Enrollable');
    const candidate = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    expect(res.body.unlockedDay).toBe(1);
    expect(res.body.status).toBe('active');
    expect(res.body.trackId).toBe(trackId);
    expect(res.body.cohortId ?? null).toBeNull();
  });

  it('duplicate enroll → 409', async () => {
    const trackId = await createPublishedTrack('Once only');
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('Already enrolled');
  });

  it('duplicate enroll → 409 even while the unique index is absent (cold-start race)', async () => {
    // On a fresh database the unique {userId,trackId} index builds in the
    // background, so E11000 alone can miss a duplicate. Simulate that window
    // by dropping the indexes outright.
    const { getConnectionToken } = await import('@nestjs/mongoose');
    const conn = ctx.app.get(getConnectionToken());
    const trackId = await createPublishedTrack('Indexless');
    await conn.collection('enrollments').dropIndexes();
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(409);
    // Restore the dropped indexes for the tests that follow.
    await conn.model('Enrollment').syncIndexes();
  });

  it('enroll in a draft track → 400', async () => {
    const draft = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({ title: 'Draft only', durationDays: 7, scoring: validScoring })
      .expect(201);
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId: draft.body._id })
      .expect(400);
  });

  async function createCohort(trackId: string, extra: Record<string, unknown> = {}) {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId, name: 'Test cohort', startDate: new Date().toISOString(), ...extra })
      .expect(201);
    return res.body;
  }

  it('enroll via inviteCode joins the cohort', async () => {
    const trackId = await createPublishedTrack('Invite host');
    const cohort = await createCohort(trackId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ inviteCode: cohort.inviteCode })
      .expect(201);
    expect(res.body.cohortId).toBe(cohort._id);
    expect(res.body.trackId).toBe(trackId);
  });

  it('capacity-1 cohort: second candidate → 409 Cohort is full', async () => {
    const trackId = await createPublishedTrack('Tiny cohort host');
    const cohort = await createCohort(trackId, { capacity: 1 });
    const first = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(first)
      .send({ inviteCode: cohort.inviteCode })
      .expect(201);
    const second = await authHeader(ctx, Role.Candidate);
    const res = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(second)
      .send({ inviteCode: cohort.inviteCode })
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('Cohort is full');
  });

  it('GET /enrollments/me returns own enrollments only', async () => {
    const trackA = await createPublishedTrack('Mine A');
    const trackB = await createPublishedTrack('Theirs B');
    const me = await authHeader(ctx, Role.Candidate);
    const other = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(me)
      .send({ trackId: trackA })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(other)
      .send({ trackId: trackB })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .get('/enrollments/me')
      .set(me)
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].trackId).toBe(trackA);
  });

  it("other user's enrollment by id → 403; admin can read any", async () => {
    const trackId = await createPublishedTrack('Ownership');
    const owner = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(owner)
      .send({ trackId })
      .expect(201);
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}`)
      .set(stranger)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}`)
      .set(owner)
      .expect(200);
    const asAdmin = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}`)
      .set(admin)
      .expect(200);
    expect(asAdmin.body._id).toBe(enrollment.body._id);
  });

  // Two-day track for unlock-state tests. Returns track id + day item ids by type.
  async function createTwoDayTrack(title: string) {
    const lesson = async (t: string) => {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/lessons')
        .set(admin)
        .send({ title: t, contentBlocks: [{ type: 'markdown', markdown: '# x' }], estMinutes: 5 })
        .expect(201);
      return res.body._id as string;
    };
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title,
        durationDays: 2,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: await lesson(`${title} d1`) },
              { type: 'quiz', config: { count: 5, required: false } },
            ],
          },
          { dayNumber: 2, items: [{ type: 'lesson', refId: await lesson(`${title} d2`) }] },
        ],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const items = track.body.days.map((d: { items: Array<{ itemId: string; type: string }> }) =>
      d.items.map((i) => ({ itemId: i.itemId, type: i.type })),
    );
    return { trackId: track.body._id as string, items };
  }

  it('unlock-state for a fresh enrollment shows day 1 unlocked, day 2 locked', async () => {
    const { trackId } = await createTwoDayTrack('Unlock fresh');
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    const res = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}/unlock-state`)
      .set(candidate)
      .expect(200);
    expect(res.body.unlockedDay).toBe(1);
    expect(res.body.days[0].unlocked).toBe(true);
    expect(res.body.days[1].unlocked).toBe(false);
  });

  it('cohort 2 days in: completing the day-1 lesson unlocks day 2 (hybrid)', async () => {
    const { trackId, items } = await createTwoDayTrack('Hybrid flow');
    const cohort = await createCohort(trackId, {
      startDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ inviteCode: cohort.inviteCode })
      .expect(201);
    const lessonItem = items[0].find((i: { type: string }) => i.type === 'lesson');
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollment.body._id}/items/${lessonItem.itemId}/complete`)
      .set(candidate)
      .expect(200);
    expect(res.body.unlockedDay).toBe(2);
    expect(res.body.days[1].unlocked).toBe(true);
  });

  it('completing a quiz item → 422 (graded in a later phase)', async () => {
    const { trackId, items } = await createTwoDayTrack('Quiz 422');
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    const quizItem = items[0].find((i: { type: string }) => i.type === 'quiz');
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollment.body._id}/items/${quizItem.itemId}/complete`)
      .set(candidate)
      .expect(422);
  });

  it('non-owner cannot complete an item (403); unknown itemId → 404', async () => {
    const { trackId, items } = await createTwoDayTrack('Complete guards');
    const owner = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(owner)
      .send({ trackId })
      .expect(201);
    const lessonItem = items[0].find((i: { type: string }) => i.type === 'lesson');
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollment.body._id}/items/${lessonItem.itemId}/complete`)
      .set(stranger)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollment.body._id}/items/aaaaaaaaaaaaaaaaaaaaaaaa/complete`)
      .set(owner)
      .expect(404);
  });

  it('re-completing an item is idempotent (200, attempts unchanged)', async () => {
    const { trackId, items } = await createTwoDayTrack('Idempotent');
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    const lessonItem = items[0].find((i: { type: string }) => i.type === 'lesson');
    const url = `/enrollments/${enrollment.body._id}/items/${lessonItem.itemId}/complete`;
    await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(200);
    await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(200);
    const doc = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollment.body._id}`)
      .set(candidate)
      .expect(200);
    const progress = doc.body.itemProgress.find(
      (p: { itemId: string }) => p.itemId === lessonItem.itemId,
    );
    expect(progress.attempts).toBe(1);
    expect(doc.body.version).toBe(1);
  });

  it('cannot complete an item on a locked day (409)', async () => {
    const { trackId, items } = await createTwoDayTrack('Locked day');
    const candidate = await authHeader(ctx, Role.Candidate);
    // Self-paced: anchor is now, so day 2's date gate is closed.
    const enrollment = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    const day2Lesson = items[1].find((i: { type: string }) => i.type === 'lesson');
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollment.body._id}/items/${day2Lesson.itemId}/complete`)
      .set(candidate)
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('locked');
  });

  it('concurrent enrolls never exceed cohort capacity', async () => {
    const trackId = await createPublishedTrack('Capacity race');
    const cohort = await createCohort(trackId, { capacity: 1 });
    const candidates = await Promise.all(
      Array.from({ length: 5 }, () => authHeader(ctx, Role.Candidate)),
    );
    const results = await Promise.all(
      candidates.map((c) =>
        request(ctx.app.getHttpServer())
          .post('/enrollments')
          .set(c)
          .send({ inviteCode: cohort.inviteCode }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((s) => s === 201).length).toBe(1);
    const list = await request(ctx.app.getHttpServer())
      .get(`/admin/enrollments?cohortId=${cohort._id}`)
      .set(admin)
      .expect(200);
    expect(list.body.items.length).toBe(1);
  });
});
