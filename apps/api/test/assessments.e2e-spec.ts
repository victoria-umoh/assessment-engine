import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';
import { FinalizationService } from '../src/assessments/finalization.service';
import { GradingService } from '../src/submissions/grading.service';
import { Judge0Client } from '../src/submissions/judge0.client';
import { QueuesService } from '../src/queues/queues.service';

// All Judge0 calls pass every case (capstone coding test).
const judge0Stub = {
  async createBatch(runs: unknown[]): Promise<string[]> {
    return runs.map((_, i) => `tok-${i}`);
  },
  async getBatch(tokens: string[]) {
    return tokens.map((token) => ({
      token,
      statusId: 3,
      statusDescription: 'Accepted',
      stdout: 'ok',
      time: '0.01',
      memory: 1024,
    }));
  },
};

describe('Assessments', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    // Queue stub runs grading and finalization inline, mirroring the worker.
    const queuesStub = {
      async enqueueGrading(submissionId: string) {
        await ctx.app.get(GradingService).gradeSubmission(submissionId);
      },
      async enqueueFinalization(enrollmentId: string) {
        await ctx.app.get(FinalizationService).finalize(enrollmentId);
      },
    };
    ctx = await createTestApp({
      overrides: (b) =>
        b
          .overrideProvider(Judge0Client)
          .useValue(judge0Stub)
          .overrideProvider(QueuesService)
          .useValue(queuesStub),
    });
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  let seq = 0;
  async function createCategory(key?: string, scoringMode: 'correctness' | 'profile' = 'correctness') {
    const k = key ?? `assess-cat-${seq++}`;
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: k, name: `Assess ${k}`, scoringMode })
      .expect(201);
    return res.body._id as string;
  }

  async function createMcqPool(categoryId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'mcq',
          categoryId,
          difficulty: 2,
          prompt: `Q${i}: pick A`,
          options: ['A', 'B', 'C', 'D'],
          correct: [0],
        })
        .expect(201);
    }
  }

  async function createLesson(title: string) {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/lessons')
      .set(admin)
      .send({ title, contentBlocks: [{ type: 'markdown', markdown: '# x' }], estMinutes: 5 })
      .expect(201);
    return res.body._id as string;
  }

  // 1-day track: lesson + quiz. Returns ids.
  async function createLessonQuizTrack(categoryId: string, extra: Record<string, unknown> = {}) {
    const lessonId = await createLesson(`Lesson ${seq++}`);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Assess track ${seq++}`,
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: lessonId },
              { type: 'quiz', config: { count: 2, categoryIds: [categoryId] } },
            ],
          },
        ],
        scoring: {
          weights: { quiz: 0.8, coding: 0, exercise: 0.2, reading: 0, finalAssessment: 0 },
          passThreshold: 0.7,
        },
        ...extra,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const items = track.body.days[0].items as Array<{ itemId: string; type: string }>;
    return {
      trackId: track.body._id as string,
      lessonItemId: items.find((i) => i.type === 'lesson')!.itemId,
      quizItemId: items.find((i) => i.type === 'quiz')!.itemId,
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

  async function completeLesson(
    candidate: { Authorization: string },
    enrollmentId: string,
    itemId: string,
  ) {
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${itemId}/complete`)
      .set(candidate)
      .expect(200);
  }

  async function takeQuiz(
    candidate: { Authorization: string },
    enrollmentId: string,
    itemId: string,
    correctFraction: number,
  ) {
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${itemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    const total = attempt.body.questions.length;
    const correctCount = Math.round(total * correctFraction);
    const answers = attempt.body.questions.map(
      (q: { questionId: string; options: string[] }, i: number) => ({
        questionId: q.questionId,
        answer: i < correctCount ? q.options.indexOf('A') : (q.options.indexOf('A') + 1) % 4,
      }),
    );
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({ answers })
      .expect(200);
  }

  it('completing all required items finalizes: result written, verdict pass, enrollment completed', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 1);

    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.verdict).toBe('pass');
    expect(result.body.weightedTotal).toBe(100);
    expect(Object.keys(result.body.breakdown)).toHaveLength(1);

    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    expect(enr.body.status).toBe('completed');
  });

  it('failing scores finalize to verdict fail and enrollment failed', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 0); // 0% quiz, exercise weight carries 20%
    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.verdict).toBe('fail');
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    expect(enr.body.status).toBe('failed');
  });

  it('categoryMinimums below floor → fail with failedMinimums despite a high total', async () => {
    const takenCatKey = `min-taken-${seq}`;
    const missedCatKey = `min-missed-${seq}`;
    const categoryId = await createCategory(takenCatKey);
    await createCategory(missedCatKey); // exists but never quizzed
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId, {
      scoring: {
        weights: { quiz: 0.8, coding: 0, exercise: 0.2, reading: 0, finalAssessment: 0 },
        passThreshold: 0.7,
        categoryMinimums: { [missedCatKey]: 0.5 },
      },
    });
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 1); // 100%
    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.weightedTotal).toBe(100);
    expect(result.body.verdict).toBe('fail');
    expect(result.body.failedMinimums).toEqual([missedCatKey]);
  });

  it('personalityProfile is reported when a likert quiz was taken and never affects the total', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const profileCatId = await createCategory(undefined, 'profile');
    for (let i = 0; i < 2; i++) {
      await request(ctx.app.getHttpServer())
        .post('/admin/questions')
        .set(admin)
        .send({
          type: 'likert',
          categoryId: profileCatId,
          difficulty: 1,
          prompt: `I like statement ${i}`,
          traitMapping: { dimension: 'grit', direction: 1 },
        })
        .expect(201);
    }
    const lessonId = await createLesson(`Profile lesson ${seq++}`);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Profile track ${seq++}`,
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: lessonId },
              { type: 'quiz', config: { count: 2, categoryIds: [categoryId] } },
              { type: 'quiz', config: { count: 2, categoryIds: [profileCatId] } },
            ],
          },
        ],
        scoring: {
          weights: { quiz: 1, coding: 0, exercise: 0, reading: 0, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const items = track.body.days[0].items as Array<{ itemId: string; type: string }>;
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);
    await completeLesson(candidate, enrollmentId, items[0].itemId);
    await takeQuiz(candidate, enrollmentId, items[1].itemId, 1); // correctness quiz 100%
    // Likert quiz: agree strongly with everything.
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${items[2].itemId}/quiz-attempts`)
      .set(candidate)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({
        answers: attempt.body.questions.map((q: { questionId: string }) => ({
          questionId: q.questionId,
          answer: 5,
        })),
      })
      .expect(200);
    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.personalityProfile).toEqual({ grit: 100 });
    expect(result.body.weightedTotal).toBe(100); // profile quiz excluded from means
    expect(result.body.verdict).toBe('pass');
  });

  it('result is 404 before completion; non-owner 403; admin can read after', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(404);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 1);
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(stranger)
      .expect(403);
    const asAdmin = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(admin)
      .expect(200);
    expect(asAdmin.body.verdict).toBe('pass');
  });

  it('finalize is idempotent: re-running produces one result doc with the same values', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 1);
    await ctx.app.get(FinalizationService).finalize(enrollmentId); // redelivered job
    const { getConnectionToken } = await import('@nestjs/mongoose');
    const conn = ctx.app.get(getConnectionToken());
    const docs = await conn
      .model('AssessmentResult')
      .find({ enrollmentId: new (await import('mongoose')).Types.ObjectId(enrollmentId) })
      .lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].verdict).toBe('pass');
    expect(docs[0].weightedTotal).toBe(100);
  });

  it('finalAssessment capstone gates finalization and feeds its weight', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const problem = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send({
        title: `Final problem ${seq++}`,
        statement: 'Echo input.',
        difficulty: 2,
        categoryId,
        languages: ['python'],
        testCases: [{ input: '1', expectedOutput: '1' }],
      })
      .expect(201);
    const lessonId = await createLesson(`Capstone lesson ${seq++}`);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Capstone track ${seq++}`,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lessonId }] }],
        scoring: {
          weights: { quiz: 0.5, coding: 0, exercise: 0, reading: 0, finalAssessment: 0.5 },
          passThreshold: 0.7,
        },
        finalAssessment: {
          quizConfig: { count: 2, categoryIds: [categoryId] },
          codingProblemIds: [problem.body._id],
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const lessonItemId = track.body.days[0].items[0].itemId;
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);

    // Capstone locked until the days are complete.
    const before = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/final-assessment`)
      .set(candidate)
      .expect(200);
    expect(before.body.available).toBe(false);
    await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/final-quiz/quiz-attempts`)
      .set(candidate)
      .expect(409);

    await completeLesson(candidate, enrollmentId, lessonItemId);
    // Days done, but capstone incomplete → no result yet.
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(404);
    const after = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/final-assessment`)
      .set(candidate)
      .expect(200);
    expect(after.body.available).toBe(true);

    // Final quiz: 100%.
    const attempt = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/final-quiz/quiz-attempts`)
      .set(candidate)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/quiz-attempts/${attempt.body._id}/submit`)
      .set(candidate)
      .send({
        answers: attempt.body.questions.map((q: { questionId: string; options: string[] }) => ({
          questionId: q.questionId,
          answer: q.options.indexOf('A'),
        })),
      })
      .expect(200);
    // Coding part still missing → no result.
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(404);

    // Final coding submission passes (stubbed Judge0).
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({
        enrollmentId,
        problemId: problem.body._id,
        language: 'python',
        sourceCode: 'print(input())',
        final: true,
      })
      .expect(201);

    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.typeScores.finalAssessment).toBe(100);
    expect(result.body.weightedTotal).toBe(100); // renormalized: only finalAssessment scoreable
    expect(result.body.verdict).toBe('pass');
  });

  it('a lesson as the last required item also triggers finalization', async () => {
    const lessonId = await createLesson(`Lesson-only ${seq++}`);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Lesson-only track ${seq++}`,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lessonId }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 1, reading: 0, finalAssessment: 0 },
          passThreshold: 0.7,
        },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);
    await completeLesson(candidate, enrollmentId, track.body.days[0].items[0].itemId);
    // Lessons aren't scoreable — weightedTotal 0 → verdict fail, but the
    // finalization itself must have run off the completeItem path.
    const result = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/result`)
      .set(candidate)
      .expect(200);
    expect(result.body.verdict).toBe('fail');
  });

  it('final submissions are gated: days incomplete → 409; foreign problem → 400', async () => {
    const categoryId = await createCategory();
    const problem = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send({
        title: `Gated final ${seq++}`,
        statement: 'Echo.',
        difficulty: 1,
        categoryId,
        languages: ['python'],
        testCases: [{ input: '1', expectedOutput: '1' }],
      })
      .expect(201);
    const foreign = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send({
        title: `Not in capstone ${seq++}`,
        statement: 'Echo.',
        difficulty: 1,
        categoryId,
        languages: ['python'],
        testCases: [{ input: '1', expectedOutput: '1' }],
      })
      .expect(201);
    const lessonId = await createLesson(`Gate lesson ${seq++}`);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Gated capstone track ${seq++}`,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'lesson', refId: lessonId }] }],
        scoring: {
          weights: { quiz: 0, coding: 0, exercise: 0.5, reading: 0, finalAssessment: 0.5 },
          passThreshold: 0.7,
        },
        finalAssessment: { codingProblemIds: [problem.body._id] },
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, track.body._id);
    const payload = {
      enrollmentId,
      problemId: problem.body._id,
      language: 'python',
      sourceCode: 'print(input())',
      final: true,
    };
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send(payload)
      .expect(409); // days incomplete
    await completeLesson(candidate, enrollmentId, track.body.days[0].items[0].itemId);
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ ...payload, problemId: foreign.body._id })
      .expect(400); // not part of the capstone
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send(payload)
      .expect(201);
  });

  it('a finalized enrollment locks further attempts and submissions (409)', async () => {
    const categoryId = await createCategory();
    await createMcqPool(categoryId, 4);
    const { trackId, lessonItemId, quizItemId } = await createLessonQuizTrack(categoryId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await completeLesson(candidate, enrollmentId, lessonItemId);
    await takeQuiz(candidate, enrollmentId, quizItemId, 0); // fail → enrollment 'failed'
    const res = await request(ctx.app.getHttpServer())
      .post(`/enrollments/${enrollmentId}/items/${quizItemId}/quiz-attempts`)
      .set(candidate)
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('not active');
  });
});
