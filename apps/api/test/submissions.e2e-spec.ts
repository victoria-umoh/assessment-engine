import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';
import { CodingProblem } from '../src/coding/coding-problem.schema';
import { GradingService } from '../src/submissions/grading.service';
import { Judge0Client } from '../src/submissions/judge0.client';
import { QueuesService } from '../src/queues/queues.service';

const validScoring = {
  weights: { quiz: 0, coding: 0.8, exercise: 0.2, reading: 0, finalAssessment: 0 },
  passThreshold: 0.7,
};

// Programmable Judge0 stub: tests enqueue per-case results before submitting.
const judge0Stub = {
  nextResults: [] as Array<{ statusId: number; statusDescription: string; stdout: string | null }>,
  failNext: false,
  getBatchFailNext: false,
  createBatchCalls: 0,
  lastGetBatchTokens: null as string[] | null,
  async createBatch(runs: unknown[]): Promise<string[]> {
    if (this.failNext) throw new Error('judge0 unreachable');
    this.createBatchCalls++;
    return runs.map((_, i) => `tok-${i}`);
  },
  async getBatch(tokens: string[]) {
    this.lastGetBatchTokens = tokens;
    if (this.getBatchFailNext) {
      this.getBatchFailNext = false;
      throw new Error('Judge0 polling timed out');
    }
    return tokens.map((token, i) => ({
      token,
      statusId: this.nextResults[i]?.statusId ?? 3,
      statusDescription: this.nextResults[i]?.statusDescription ?? 'Accepted',
      stdout: this.nextResults[i]?.stdout ?? 'ok',
      time: '0.01',
      memory: 1024,
    }));
  },
};

let skipGrading = false;

describe('Submissions', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    // Queue stub grades inline, mirroring the worker; on grading failure it
    // simulates BullMQ's exhausted-retries hook by marking the submission error.
    const queuesStub = {
      async enqueueGrading(submissionId: string) {
        if (skipGrading) return; // leave the submission queued (in-flight tests)
        try {
          await ctx.app.get(GradingService).gradeSubmission(submissionId);
        } catch {
          await ctx.app.get(GradingService).markError(submissionId);
        }
      },
      async enqueueFinalization() {},
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

  beforeEach(() => {
    judge0Stub.nextResults = [];
    judge0Stub.failNext = false;
    judge0Stub.getBatchFailNext = false;
    judge0Stub.createBatchCalls = 0;
    judge0Stub.lastGetBatchTokens = null;
    skipGrading = false;
  });

  let seq = 0;
  async function createCategory() {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/categories')
      .set(admin)
      .send({ key: `sub-cat-${seq++}`, name: `Sub Cat ${seq}`, scoringMode: 'correctness' })
      .expect(201);
    return res.body._id as string;
  }

  async function createProblem(
    categoryId: string,
    testCases: Array<{ input: string; expectedOutput: string; hidden?: boolean; weight?: number }>,
  ) {
    const res = await request(ctx.app.getHttpServer())
      .post('/admin/coding-problems')
      .set(admin)
      .send({
        title: `Sum ${seq++}`,
        statement: 'Read two ints, print their sum.',
        difficulty: 2,
        categoryId,
        languages: ['python'],
        testCases,
      })
      .expect(201);
    return res.body._id as string;
  }

  // 1-day track: day 1 = one coding item for the problem. Returns ids.
  async function createCodingTrack(problemId: string) {
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Coding track ${seq++}`,
        durationDays: 1,
        days: [{ dayNumber: 1, items: [{ type: 'coding', refId: problemId }] }],
        scoring: validScoring,
      })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post(`/admin/tracks/${track.body._id}/publish`)
      .set(admin)
      .expect(200);
    return {
      trackId: track.body._id as string,
      itemId: track.body.days[0].items[0].itemId as string,
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

  it('submission enqueues and grades: all cases pass → passed, score 100, item completed', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [
      { input: '1 2', expectedOutput: '3' },
      { input: '2 3', expectedOutput: '5' },
    ]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);

    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({
        enrollmentId,
        itemId,
        problemId,
        language: 'python',
        sourceCode: 'print(sum(map(int, input().split())))',
      })
      .expect(201);
    expect(created.body.status).toBe('queued');

    const graded = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(candidate)
      .expect(200);
    expect(graded.body.status).toBe('passed');
    expect(graded.body.score).toBe(100);
    expect(graded.body.testResults).toHaveLength(2);

    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === itemId);
    expect(progress.status).toBe('completed');
    expect(progress.score).toBe(100);
  });

  it('weighted partial failure → failed with weighted score', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [
      { input: '1 2', expectedOutput: '3', weight: 1 },
      { input: '2 3', expectedOutput: '5', weight: 3 },
    ]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    judge0Stub.nextResults = [
      { statusId: 3, statusDescription: 'Accepted', stdout: '3' },
      { statusId: 4, statusDescription: 'Wrong Answer', stdout: '6' },
    ];
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(6)' })
      .expect(201);
    const graded = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(candidate)
      .expect(200);
    expect(graded.body.status).toBe('failed');
    expect(graded.body.score).toBe(25);
  });

  it('hidden case results are redacted for candidates; admin sees stdout', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [
      { input: '1 2', expectedOutput: '3' },
      { input: '9 9', expectedOutput: '18', hidden: true },
    ]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(3)' })
      .expect(201);
    const asCandidate = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(candidate)
      .expect(200);
    const hiddenCase = asCandidate.body.testResults.find(
      (r: { caseIndex: number }) => r.caseIndex === 1,
    );
    expect(hiddenCase).toEqual({ caseIndex: 1, status: 'passed', hidden: true });
    expect(asCandidate.body.testResults[0].stdout).toBeDefined();
    expect(JSON.stringify(asCandidate.body)).not.toContain('sourceCode');
    const asAdmin = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(admin)
      .expect(200);
    expect(asAdmin.body.testResults[1].stdout).toBeDefined();
  });

  it('wrong language → 400; problemId not matching the item → 400', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const otherProblemId = await createProblem(categoryId, [{ input: '2', expectedOutput: '2' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'cobol', sourceCode: 'x' })
      .expect(400);
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({
        enrollmentId,
        itemId,
        problemId: otherProblemId,
        language: 'python',
        sourceCode: 'x',
      })
      .expect(400);
  });

  it('second submission while one is queued → 409', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    skipGrading = true;
    const payload = { enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(1)' };
    await request(ctx.app.getHttpServer()).post('/submissions').set(candidate).send(payload).expect(201);
    const res = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send(payload)
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('already in progress');
  });

  it('judge0 outage → submission error, attempt NOT consumed', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    judge0Stub.failNext = true;
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(1)' })
      .expect(201);
    const after = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(candidate)
      .expect(200);
    expect(after.body.status).toBe('error');
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    expect(
      enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === itemId),
    ).toBeUndefined();
  });

  it('regrade is idempotent (settled submission never re-counts an attempt)', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(1)' })
      .expect(201);
    // Simulate a redelivered BullMQ job.
    await ctx.app.get(GradingService).gradeSubmission(created.body._id);
    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === itemId);
    expect(progress.attempts).toBe(1);
  });

  it('locked-day coding item → 409', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Two-day coding ${seq++}`,
        durationDays: 2,
        days: [
          { dayNumber: 1, items: [{ type: 'coding', refId: problemId }] },
          { dayNumber: 2, items: [{ type: 'coding', refId: problemId }] },
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
      .post('/submissions')
      .set(candidate)
      .send({
        enrollmentId,
        itemId: day2Item,
        problemId,
        language: 'python',
        sourceCode: 'print(1)',
      })
      .expect(409);
    expect(JSON.stringify(res.body.message)).toContain('locked');
  });

  it('owner lists own submissions per enrollment; admin filters by enrollmentId', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(1)' })
      .expect(201);
    const own = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/submissions`)
      .set(candidate)
      .expect(200);
    expect(own.body.items).toHaveLength(1);
    expect(own.body.items[0].status).toBe('passed');
    const stranger = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/submissions`)
      .set(stranger)
      .expect(403);
    const asAdmin = await request(ctx.app.getHttpServer())
      .get(`/admin/submissions?enrollmentId=${enrollmentId}`)
      .set(admin)
      .expect(200);
    expect(asAdmin.body.items).toHaveLength(1);
    await request(ctx.app.getHttpServer())
      .get('/admin/submissions')
      .set(candidate)
      .expect(403);
  });

  it('concurrent submissions create exactly one queued job', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1', expectedOutput: '1' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);
    skipGrading = true; // keep them queued so the race window is real
    const payload = { enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(1)' };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(ctx.app.getHttpServer()).post('/submissions').set(candidate).send(payload),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('grading retry reuses persisted judge0 tokens instead of re-creating the batch', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1 2', expectedOutput: '3' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);

    skipGrading = true; // drive gradeSubmission by hand to simulate worker retries
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(3)' })
      .expect(201);
    const id = created.body._id as string;

    // First attempt: batch created, poll times out → job would retry.
    judge0Stub.getBatchFailNext = true;
    await expect(ctx.app.get(GradingService).gradeSubmission(id)).rejects.toThrow();
    expect(judge0Stub.createBatchCalls).toBe(1);

    // Retry: must poll the SAME tokens, not create a second batch.
    await ctx.app.get(GradingService).gradeSubmission(id);
    expect(judge0Stub.createBatchCalls).toBe(1);
    expect(judge0Stub.lastGetBatchTokens).toEqual(['tok-0']);

    const graded = await request(ctx.app.getHttpServer())
      .get(`/submissions/${id}`)
      .set(candidate)
      .expect(200);
    expect(graded.body.status).toBe('passed');
  });

  it('enrollment submission list filters by problemId server-side', async () => {
    const categoryId = await createCategory();
    const problemA = await createProblem(categoryId, [{ input: '1 2', expectedOutput: '3' }]);
    const problemB = await createProblem(categoryId, [{ input: '2 3', expectedOutput: '5' }]);
    const track = await request(ctx.app.getHttpServer())
      .post('/admin/tracks')
      .set(admin)
      .send({
        title: `Two-problem track ${seq++}`,
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'coding', refId: problemA },
              { type: 'coding', refId: problemB },
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
    const enrollmentId = await enroll(candidate, track.body._id);

    for (const [itemId, problemId] of [
      [itemA, problemA],
      [itemB, problemB],
    ]) {
      await request(ctx.app.getHttpServer())
        .post('/submissions')
        .set(candidate)
        .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(0)' })
        .expect(201);
    }

    const filtered = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/submissions?problemId=${problemA}`)
      .set(candidate)
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].problemId).toBe(problemA);

    const bogus = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}/submissions?problemId=not-an-objectid`)
      .set(candidate)
      .expect(200);
    expect(bogus.body.items).toHaveLength(0);
  });

  it('problem drifted to zero test cases → error, attempt not consumed', async () => {
    const categoryId = await createCategory();
    const problemId = await createProblem(categoryId, [{ input: '1 2', expectedOutput: '3' }]);
    const { trackId, itemId } = await createCodingTrack(problemId);
    const candidate = await authHeader(ctx, Role.Candidate);
    const enrollmentId = await enroll(candidate, trackId);

    skipGrading = true;
    const created = await request(ctx.app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ enrollmentId, itemId, problemId, language: 'python', sourceCode: 'print(3)' })
      .expect(201);

    // Schema blocks empty testCases at create/PATCH; simulate DB drift directly.
    const problemModel = ctx.app.get<Model<CodingProblem>>(getModelToken(CodingProblem.name));
    await problemModel.updateOne({ _id: problemId }, { testCases: [] }).exec();

    await ctx.app.get(GradingService).gradeSubmission(created.body._id); // must not throw
    const sub = await request(ctx.app.getHttpServer())
      .get(`/submissions/${created.body._id}`)
      .set(candidate)
      .expect(200);
    expect(sub.body.status).toBe('error');

    const enr = await request(ctx.app.getHttpServer())
      .get(`/enrollments/${enrollmentId}`)
      .set(candidate)
      .expect(200);
    const progress = enr.body.itemProgress.find((p: { itemId: string }) => p.itemId === itemId);
    expect(progress?.status ?? 'pending').not.toBe('completed');
    expect(progress?.attempts ?? 0).toBe(0);
  });
});
