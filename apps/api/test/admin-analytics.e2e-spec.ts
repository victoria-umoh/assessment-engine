import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Admin analytics', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };
  let categoryId: string;
  let trackId: string;
  let lessonItemId: string;
  let cohortId: string;
  let enrollmentA: string; // candidate A: progress + attempt + result
  let enrollmentB: string; // candidate B: untouched
  let questionId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
    const server = ctx.app.getHttpServer();

    const cat = await request(server)
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'numerical-reasoning', name: 'Numerical', scoringMode: 'correctness' })
      .expect(201);
    categoryId = cat.body._id;

    const q = await request(server)
      .post('/admin/questions')
      .set(admin)
      .send({
        type: 'mcq',
        categoryId,
        difficulty: 1,
        prompt: 'What is 2+2?',
        options: ['3', '4'],
        correct: [1],
        tags: [],
      })
      .expect(201);
    questionId = q.body._id;

    const lesson = await request(server)
      .post('/admin/lessons')
      .set(admin)
      .send({
        title: 'Intro',
        contentBlocks: [{ type: 'markdown', markdown: '# Intro' }],
        estMinutes: 5,
      })
      .expect(201);

    const track = await request(server)
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Analytics track',
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: lesson.body._id },
              { type: 'exercise', config: { instructions: 'Do the thing' } },
            ],
          },
        ],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 1, reading: 0, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    trackId = track.body._id;
    lessonItemId = track.body.days[0].items[0].itemId;
    await request(server).post(`/admin/tracks/${trackId}/publish`).set(admin).expect(200);

    const cohort = await request(server)
      .post('/admin/cohorts')
      .set(admin)
      .send({ trackId, name: 'Cohort 1', startDate: new Date(Date.now() - 86400000).toISOString() })
      .expect(201);
    cohortId = cohort.body._id;

    const candA = await authHeader(ctx, Role.Candidate);
    const candB = await authHeader(ctx, Role.Candidate);
    const enrollA = await request(server)
      .post('/enrollments')
      .set(candA)
      .send({ inviteCode: cohort.body.inviteCode })
      .expect(201);
    enrollmentA = enrollA.body._id;
    const enrollB = await request(server)
      .post('/enrollments')
      .set(candB)
      .send({ inviteCode: cohort.body.inviteCode })
      .expect(201);
    enrollmentB = enrollB.body._id;

    // Candidate A completes the lesson.
    await request(server)
      .post(`/enrollments/${enrollmentA}/items/${lessonItemId}/complete`)
      .set(candA)
      .expect(200);

    // Direct inserts: a settled quiz attempt (1 right, 1 wrong on the same
    // question) and a pass result for A — grading/finalization pipelines have
    // their own suites; analytics only reads these collections.
    const { getConnectionToken } = await import('@nestjs/mongoose');
    const { Types } = await import('mongoose');
    const conn = ctx.app.get(getConnectionToken());
    const attempt = (quizItemId: string, correct: boolean) => ({
      enrollmentId: new Types.ObjectId(enrollmentA),
      quizItemId,
      status: 'submitted',
      questions: [
        {
          questionId: new Types.ObjectId(questionId),
          presentedOrder: 0,
          answer: correct ? 1 : 0,
          correct,
        },
      ],
      score: correct ? 100 : 0,
      startedAt: new Date(),
      submittedAt: new Date(),
      timeLimitSec: 900,
    });
    await conn
      .collection('quizattempts')
      .insertMany([attempt('attempt-item-1', true), attempt('attempt-item-2', false)]);
    await conn.collection('assessmentresults').insertOne({
      enrollmentId: new Types.ObjectId(enrollmentA),
      breakdown: { 'numerical-reasoning': 90 },
      // scoring.engine weightedTotal is 0–100 — keep fixtures on the real scale.
      weightedTotal: 90,
      verdict: 'pass',
      generatedAt: new Date(),
    });
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('overview reports platform counts', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/admin/analytics/overview')
      .set(admin)
      .expect(200);

    expect(res.body.users.admins).toBeGreaterThanOrEqual(1);
    expect(res.body.users.candidates).toBeGreaterThanOrEqual(2);
    expect(res.body.users.total).toBe(res.body.users.admins + res.body.users.candidates);
    expect(res.body.tracks.published).toBe(1);
    expect(res.body.cohorts.active).toBe(1);
    expect(res.body.enrollments.active).toBe(2);
    expect(res.body.submissions.queued).toBe(0);
  });

  it('cohort dashboard aggregates verdicts and per-candidate progress', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/cohorts/${cohortId}/dashboard`)
      .set(admin)
      .expect(200);

    expect(res.body.cohort.name).toBe('Cohort 1');
    expect(res.body.cohort.trackTitle).toBe('Analytics track');
    expect(res.body.cohort.inviteCode).toBeDefined();

    expect(res.body.stats.enrolled).toBe(2);
    expect(res.body.stats.byStatus.active).toBe(2);
    expect(res.body.stats.verdicts).toEqual({ pass: 1, fail: 0, pending: 1 });
    expect(res.body.stats.avgWeightedTotal).toBeCloseTo(90);

    expect(res.body.candidates).toHaveLength(2);
    const rowA = res.body.candidates.find(
      (c: { enrollmentId: string }) => c.enrollmentId === enrollmentA,
    );
    const rowB = res.body.candidates.find(
      (c: { enrollmentId: string }) => c.enrollmentId === enrollmentB,
    );
    expect(rowA.email).toContain('@test.local');
    expect(rowA.name).toBeDefined();
    expect(rowA.requiredComplete).toBe(1); // lesson done, exercise pending
    expect(rowA.requiredTotal).toBe(2);
    expect(rowA.verdict).toBe('pass');
    expect(rowA.weightedTotal).toBeCloseTo(90);
    expect(rowB.requiredComplete).toBe(0);
    expect(rowB.verdict).toBeUndefined();

    await request(ctx.app.getHttpServer())
      .get('/admin/cohorts/507f1f77bcf86cd799439099/dashboard')
      .set(admin)
      .expect(404);
  });

  it('enrollment detail joins user/track/attempts/submissions/result without leaking keys', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/enrollments/${enrollmentA}/detail`)
      .set(admin)
      .expect(200);

    expect(res.body.enrollment._id).toBe(enrollmentA);
    expect(res.body.enrollment.itemProgress.length).toBeGreaterThanOrEqual(1);
    expect(res.body.user.email).toContain('@test.local');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('sessions');
    expect(res.body.track.title).toBe('Analytics track');
    expect(res.body.track.durationDays).toBe(1);

    expect(res.body.attempts).toHaveLength(2);
    // Attempt summaries never carry the sampled questions (correct answers ride there).
    for (const attempt of res.body.attempts) {
      expect(attempt).not.toHaveProperty('questions');
      expect(attempt.status).toBe('submitted');
    }
    expect(res.body.submissions).toEqual([]);
    expect(res.body.result.verdict).toBe('pass');

    await request(ctx.app.getHttpServer())
      .get('/admin/enrollments/507f1f77bcf86cd799439099/detail')
      .set(admin)
      .expect(404);
  });

  it('question stats aggregate served counts and correct rates; candidate 403 everywhere', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/admin/analytics/questions?categoryId=${categoryId}`)
      .set(admin)
      .expect(200);

    expect(res.body).toHaveLength(1);
    const stat = res.body[0];
    expect(stat.questionId).toBe(questionId);
    expect(stat.prompt).toBe('What is 2+2?');
    expect(stat.served).toBe(2);
    expect(stat.correctRate).toBeCloseTo(0.5);

    const candidate = await authHeader(ctx, Role.Candidate);
    const server = ctx.app.getHttpServer();
    await request(server).get('/admin/analytics/overview').set(candidate).expect(403);
    await request(server).get(`/admin/cohorts/${cohortId}/dashboard`).set(candidate).expect(403);
    await request(server).get(`/admin/enrollments/${enrollmentA}/detail`).set(candidate).expect(403);
    await request(server).get('/admin/analytics/questions').set(candidate).expect(403);
  });

  it('question stats category filter applies before the served-count limit', async () => {
    // A low-traffic category must still surface its own questions even when
    // the global top-N by served is dominated by another category.
    const server = ctx.app.getHttpServer();
    const catB = await request(server)
      .post('/admin/categories')
      .set(admin)
      .send({ key: 'verbal-reasoning', name: 'Verbal', scoringMode: 'correctness' })
      .expect(201);
    const qB = await request(server)
      .post('/admin/questions')
      .set(admin)
      .send({
        type: 'mcq',
        categoryId: catB.body._id,
        difficulty: 1,
        prompt: 'Pick the synonym of big',
        options: ['large', 'tiny'],
        correct: [0],
        tags: [],
      })
      .expect(201);

    const { getConnectionToken } = await import('@nestjs/mongoose');
    const { Types } = await import('mongoose');
    const conn = ctx.app.get(getConnectionToken());
    await conn.collection('quizattempts').insertOne({
      enrollmentId: new Types.ObjectId(enrollmentA),
      quizItemId: 'attempt-item-3',
      status: 'submitted',
      questions: [
        { questionId: new Types.ObjectId(qB.body._id), presentedOrder: 0, answer: 0, correct: true },
      ],
      score: 100,
      startedAt: new Date(),
      submittedAt: new Date(),
      timeLimitSec: 900,
    });

    // limit=1: the global top question by served is the numerical one (2
    // serves); filtering by the verbal category must still return qB.
    const res = await request(server)
      .get(`/admin/analytics/questions?categoryId=${catB.body._id}&limit=1`)
      .set(admin)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].questionId).toBe(qB.body._id);
    expect(res.body[0].served).toBe(1);
  });
});
