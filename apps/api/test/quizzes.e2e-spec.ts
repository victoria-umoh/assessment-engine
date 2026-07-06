import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';
import { Question } from '../src/questions/question.schema';

const validScoring = {
  weights: { quiz: 0.7, coding: 0, exercise: 0.1, reading: 0.2, finalAssessment: 0 },
  passThreshold: 0.7,
};

describe('Quizzes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  let catSeq = 0;
  async function createCategory(scoringMode: 'correctness' | 'profile' = 'correctness') {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: `quiz-cat-${catSeq++}`, name: `Quiz Cat ${catSeq}`, scoringMode })
      .expect(201);
    return res.body._id as string;
  }

  async function createMcqPool(categoryId: string, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'mcq',
          categoryId,
          difficulty: 2,
          prompt: `Pool question ${i}: pick A`,
          options: ['A', 'B', 'C', 'D'],
          correct: [0],
          explanation: 'A is always right here',
        })
        .expect(201);
      ids.push(res.body._id);
    }
    return ids;
  }

  // 1-day track: day 1 = one quiz item with the given config. Returns ids.
  async function createQuizTrack(config: Record<string, unknown>) {
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Quiz track ${catSeq}-${Math.floor(Math.random() * 1e6)}`,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'quiz', config }] }],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    return {
      trackId: track.body._id as string,
      quizItemId: track.body.days[0].items[0].itemId as string,
    };
  }

  async function enroll(candidate: { Authorization: string }, trackId: string) {
    const res = await request(ctx.app.getHttpServer())
      .post('/enrollments')
      .set(candidate)
      .send({ trackId })
      .expect(201);
    return res.body._id as string;
  }

  it('candidate starts a quiz attempt: sampled count, options present, no answers leaked', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 12);
    const { trackId, quizItemId } = await createQuizTrack({
      count: 5,
      categoryIds: [categoryId],
      timeLimitSec: 600,
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);

    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    expect(res.body.questions).toHaveLength(5);
    expect(res.body.timeLimitSec).toBe(600);
    expect(res.body.status).toBe('in-progress');
    expect(res.body.questions[0].prompt).toBeDefined();
    expect(res.body.questions[0].options).toHaveLength(4);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('"correct"');
    expect(raw).not.toContain('explanation');
    expect(raw).not.toContain('traitMapping');
    expect(raw).not.toContain('shuffledOptionOrder');
  });

  it('starting again resumes the same in-progress attempt', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 6);
    const { trackId, quizItemId } = await createQuizTrack({ count: 3, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const url = `/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`;
    const first = await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(201);
    const second = await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(201);
    expect(second.body._id).toBe(first.body._id);
    expect(second.body.questions[0].prompt).toBeDefined();
    expect(JSON.stringify(second.body)).not.toContain('shuffledOptionOrder');
  });

  it('quiz attempt on a locked day → 409', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 6);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Two-day quiz track',
        durationDays: 2,
        days: [
          { dayNumber: 1, items: [{ type: 'quiz', config: { count: 2, categoryIds: [categoryId] } }] },
          { dayNumber: 2, items: [{ type: 'quiz', config: { count: 2, categoryIds: [categoryId] } }] },
        ],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const day2Item = track.body.days[1].items[0].itemId;
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${day2Item}/quiz-attempts`)
      .set(candidate)
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('locked');
  });

  it('non-owner cannot start an attempt (403)', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const owner = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(owner, trackId);
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(stranger)
      .expect(403);
  });

  it('reading item samples only material-linked questions', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 5); // decoys with no materialId
    const material = await request(ctx.app.getHttpServer())
      .post('/admin/materials/upload')
      .set(admin)
      .attach('file', Buffer.from('# Ratios\nA ratio compares two quantities.'), {
        filename: 'ratios.md',
        contentType: 'text/markdown',
      })
      .field('title', 'Ratios reading')
      .expect(201);
    const linked: string[] = [];
    for (let i = 0; i < 3; i++) {
      const q = await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'mcq',
          categoryId,
          difficulty: 1,
          prompt: `Comprehension ${i}`,
          options: ['Yes', 'No'],
          correct: [0],
          materialId: material.body._id,
        })
        .expect(201);
      linked.push(q.body._id);
    }
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: 'Reading track',
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'reading', refId: material.body._id }] }],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const readingItemId = track.body.days[0].items[0].itemId;
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${readingItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    expect(res.body.questions).toHaveLength(3);
    for (const q of res.body.questions) expect(linked).toContain(q.questionId);
  });

  it('empty pool → 422', async () => {
    const emptyCategory = await createCategory();
    const { trackId, quizItemId } = await createQuizTrack({
      count: 3,
      categoryIds: [emptyCategory],
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(422);
    expect(JSON.stringify(res.body.message)).toContain('pool is empty');
  });

  it('misconfigured quiz item (count: -1) → 422', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({
      count: -1,
      categoryIds: [categoryId],
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(422);
    expect(JSON.stringify(res.body.message)).toContain('misconfigured');
  });

  it('submitting graded answers scores the attempt and completes the item', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 5);
    const { trackId, quizItemId } = await createQuizTrack({ count: 5, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    // Canonical correct answer is always 'A'; find its presented index.
    const answers = attempt.body.questions.map(
      (q: { questionId: string; options: string[] }, i: number) => ({
        questionId: q.questionId,
        answer: i === 0 ? (q.options.indexOf('A') + 1) % 4 : q.options.indexOf('A'), // first one wrong
      }),
    );
    const res = await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);
    expect(res.body.score).toBe(80);
    expect(res.body.correctCount).toBe(4);
    expect(res.body.total).toBe(5);
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === quizItemId);
    expect(progress.status).toBe('completed');
    expect(progress.score).toBe(80);
    expect(progress.attempts).toBe(1);
  });

  it('likert quiz produces traitScores and no score', async () => {
    const categoryId = await createCategory('profile');
    for (let i = 0; i < 4; i++) {
      await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'likert',
          categoryId,
          difficulty: 1,
          prompt: `I enjoy statement ${i}`,
          traitMapping: { dimension: 'openness', direction: i % 2 === 0 ? 1 : -1 },
        })
        .expect(201);
    }
    const { trackId, quizItemId } = await createQuizTrack({ count: 4, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const answers = attempt.body.questions.map((q: { questionId: string }) => ({
      questionId: q.questionId,
      answer: 5, // strongly agree everywhere
    }));
    const res = await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);
    expect(res.body.score).toBeUndefined();
    // Two forward (value 5) + two reversed (value 1) → mean 3 → 50.
    expect(res.body.traitScores).toEqual({ openness: 50 });
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === quizItemId);
    expect(progress.status).toBe('completed');
    expect(progress.score).toBeUndefined();
  });

  it('submit after the time limit → 409 and the attempt expires', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({
      count: 2,
      categoryIds: [categoryId],
      timeLimitSec: 60,
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const { getConnectionToken } = await import('@nestjs/mongoose');
    const conn = ctx.app.get(getConnectionToken());
    await conn
      .model('QuizAttempt')
      .updateOne(
        { _id: attempt.body._id },
        { $set: { startedAt: new Date(Date.now() - 3600 * 1000) } },
      );
    const res = await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers: [] })
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('Time limit');
    const settled = await conn.model('QuizAttempt').findById(attempt.body._id).lean();
    expect(settled.status).toBe('expired');
  });

  it('maxAttempts exhausted → 409 on the next start', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({
      count: 2,
      categoryIds: [categoryId],
      maxAttempts: 1,
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const url = `/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`;
    const attempt = await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(201);
    const answers = attempt.body.questions.map((q: { questionId: string }) => ({
      questionId: q.questionId,
      answer: 0,
    }));
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);
    const res = await request(ctx.app.getHttpServer()).post(url).set(candidate).expect(409);
    expect(JSON.stringify(res.body.message)).toContain('No attempts remaining');
  });

  it('resubmitting a settled attempt → 409', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const answers = attempt.body.questions.map((q: { questionId: string }) => ({
      questionId: q.questionId,
      answer: 0,
    }));
    const submitUrl = `/quiz-attempts/${attempt.body._id}/submit`;
    await request(ctx.app.getHttpServer()).post(submitUrl).set(candidate).send({ answers }).expect(200);
    const res = await request(ctx.app.getHttpServer())
      .post(submitUrl)
      .set(candidate)
      .send({ answers })
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('settled');
  });

  it('higher retake score wins on itemProgress', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 2);
    const { trackId, quizItemId } = await createQuizTrack({
      count: 2,
      categoryIds: [categoryId],
      maxAttempts: 2,
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const startUrl = `/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`;

    async function takeQuiz(correctCount: number) {
      const attempt = await request(ctx.app.getHttpServer()).post(startUrl).set(candidate).expect(201);
      const answers = attempt.body.questions.map(
        (q: { questionId: string; options: string[] }, i: number) => ({
          questionId: q.questionId,
          answer: i < correctCount ? q.options.indexOf('A') : (q.options.indexOf('A') + 1) % 4,
        }),
      );
      const res = await request(ctx.app.getHttpServer())
        .post(`/quiz-attempts/${attempt.body._id}/submit`)
        .set(candidate)
        .send({ answers })
        .expect(200);
      return res.body.score as number;
    }

    expect(await takeQuiz(1)).toBe(50);
    expect(await takeQuiz(2)).toBe(100);
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === quizItemId);
    expect(progress.score).toBe(100);
    expect(progress.attempts).toBe(2);
  });

  it('GET settled attempt shows per-question correctness but never answer keys; stranger 403', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 2);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const answers = attempt.body.questions.map(
      (q: { questionId: string; options: string[] }) => ({
        questionId: q.questionId,
        answer: q.options.indexOf('A'),
      }),
    );
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);
    const res = await request(ctx.app.getHttpServer())
      .get(`/quiz-attempts/${attempt.body._id}`)
      .set(candidate)
      .expect(200);
    expect(res.body.status).toBe('submitted');
    expect(res.body.score).toBe(100);
    expect(res.body.questions[0].correct).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('explanation');
    expect(JSON.stringify(res.body)).not.toContain('shuffledOptionOrder');
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/quiz-attempts/${attempt.body._id}`)
      .set(stranger)
      .expect(403);
  });

  it('concurrent submits settle an attempt exactly once', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 2);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const answers = attempt.body.questions.map((q: { questionId: string }) => ({
      questionId: q.questionId,
      answer: 0,
    }));
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(ctx.app.getHttpServer())
          .post(`/quiz-attempts/${attempt.body._id}/submit`)
          .set(candidate)
          .send({ answers }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === quizItemId);
    expect(progress.attempts).toBe(1);
  });

  it('concurrent starts yield a single in-progress attempt', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const url = `/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(ctx.app.getHttpServer()).post(url).set(candidate)),
    );
    const ids = new Set(results.filter((r) => r.status === 201).map((r) => r.body._id));
    expect(ids.size).toBe(1);
  });

  it('question hard-deleted mid-attempt is excluded from the score denominator', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 2);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);

    // Hard-delete one sampled question (admin archive keeps the doc; this
    // simulates true removal/DB drift between start and submit).
    const questionModel = ctx.app.get<Model<Question>>(getModelToken(Question.name));
    const [gone, kept] = attempt.body.questions as Array<{
      questionId: string;
      options: string[];
    }>;
    await questionModel.deleteOne({ _id: gone.questionId }).exec();

    const res = await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({
        answers: [
          { questionId: gone.questionId, answer: 0 },
          { questionId: kept.questionId, answer: kept.options.indexOf('A') },
        ],
      })
      .expect(200);
    // The deleted question must not count against the candidate.
    expect(res.body.total).toBe(1);
    expect(res.body.correctCount).toBe(1);
    expect(res.body.score).toBe(100);
  });

  it('attempt views expose serverNow so the client can anchor its countdown', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);

    const started = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    expect(typeof started.body.serverNow).toBe('string');
    expect(Math.abs(new Date(started.body.serverNow).getTime() - Date.now())).toBeLessThan(5000);

    const fetched = await request(ctx.app.getHttpServer())
      .get(`/quiz-attempts/${started.body._id}`)
      .set(candidate)
      .expect(200);
    expect(typeof fetched.body.serverNow).toBe('string');
  });

  it('settled attempt echoes candidate answers for review; in-progress never does', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 3);
    const { trackId, quizItemId } = await createQuizTrack({ count: 2, categoryIds: [categoryId] });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);

    const inProgress = await request(ctx.app.getHttpServer())
      .get(`/quiz-attempts/${attempt.body._id}`)
      .set(candidate)
      .expect(200);
    for (const q of inProgress.body.questions) expect(q).not.toHaveProperty('answer');

    const answers = attempt.body.questions.map((q: { questionId: string }, i: number) => ({
      questionId: q.questionId,
      answer: i, // presented indices 0 and 1
    }));
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);

    const settled = await request(ctx.app.getHttpServer())
      .get(`/quiz-attempts/${attempt.body._id}`)
      .set(candidate)
      .expect(200);
    const byId = new Map(
      settled.body.questions.map((q: { questionId: string; answer?: unknown }) => [
        q.questionId,
        q.answer,
      ]),
    );
    expect(byId.get(answers[0].questionId)).toBe(0);
    expect(byId.get(answers[1].questionId)).toBe(1);
  });
});
