import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { quizItemConfigSchema, SubmitQuizDto } from '@lms/shared';
import { AuthUser } from '../auth/jwt.strategy';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { QueuesService } from '../queues/queues.service';
import { QuizAttempt, QuizAttemptDocument } from './quiz-attempt.schema';
import {
  computeScore,
  computeTraitScores,
  GradableQuestion,
  GradedQuestion,
  gradeQuestion,
} from './quiz.grading';
import { QuizSampler } from './quiz.sampler';
import { QuestionDocLike, toCandidateAttemptView } from './quiz.views';

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

@Injectable()
export class QuizzesService {
  constructor(
    @InjectModel(QuizAttempt.name) private attemptModel: Model<QuizAttempt>,
    private sampler: QuizSampler,
    private enrollments: EnrollmentsService,
    private queues: QueuesService,
  ) {}

  async startAttempt(user: AuthUser, enrollmentId: string, itemId: string) {
    let enrollment;
    let rawConfig: Record<string, unknown>;
    let materialId: string | undefined;
    let readingDefaultCount = false;

    if (itemId === 'final-quiz') {
      // Capstone quiz: gated on all required day items being complete.
      const gate = await this.enrollments.assertCapstoneActionable(user, enrollmentId);
      enrollment = gate.enrollment;
      if (!gate.track.finalAssessment?.quizConfig) {
        throw new NotFoundException('Track has no final assessment quiz');
      }
      rawConfig = gate.track.finalAssessment.quizConfig;
    } else {
      const gate = await this.enrollments.assertItemActionable(user, enrollmentId, itemId);
      enrollment = gate.enrollment;
      const item = gate.item;
      if (item.type !== 'quiz' && item.type !== 'reading') {
        throw new UnprocessableEntityException('Item is not a quiz');
      }
      rawConfig = item.config ?? {};
      if (item.type === 'reading') {
        materialId = item.refId;
        readingDefaultCount = (item.config as { count?: number } | undefined)?.count == null;
      }
    }

    const parsed = quizItemConfigSchema.safeParse(rawConfig);
    if (!parsed.success) throw new UnprocessableEntityException('Quiz item is misconfigured');
    const config = parsed.data;
    // Reading items default to the whole linked pool (capped by zod max 50)
    // when count isn't configured explicitly.
    if (readingDefaultCount) config.count = 50;

    const existing = await this.attemptModel.findOne({
      enrollmentId: enrollment._id,
      quizItemId: itemId,
      status: 'in-progress',
    });
    if (existing) return this.presentAttempt(existing);

    if (config.maxAttempts) {
      const settled = await this.attemptModel.countDocuments({
        enrollmentId: enrollment._id,
        quizItemId: itemId,
        status: { $in: ['submitted', 'expired'] },
      });
      if (settled >= config.maxAttempts) throw new ConflictException('No attempts remaining');
    }

    const prior = await this.attemptModel
      .find({ enrollmentId: enrollment._id, quizItemId: itemId })
      .select('questions.questionId')
      .lean()
      .exec();
    const excludeIds = prior.flatMap((a) =>
      a.questions.map((q) => q.questionId as Types.ObjectId),
    );

    const sampled = await this.sampler.sample({
      count: config.count,
      categoryIds: materialId ? undefined : config.categoryIds,
      difficulty: config.difficulty,
      materialId,
      excludeIds,
    });

    const ordered = shuffle(sampled);
    const questions = ordered.map((q, i) => ({
      questionId: q._id,
      presentedOrder: i,
      shuffledOptionOrder:
        (q.type === 'mcq' || q.type === 'multi') && q.options
          ? shuffle(q.options.map((_, j) => j))
          : undefined,
    }));

    let attempt: QuizAttemptDocument;
    try {
      attempt = await this.attemptModel.create({
        enrollmentId: enrollment._id,
        quizItemId: itemId,
        materialId,
        questions,
        startedAt: new Date(),
        timeLimitSec: config.timeLimitSec,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        // Lost the concurrent-start race — resume the winner's attempt.
        const winner = await this.attemptModel.findOne({
          enrollmentId: enrollment._id,
          quizItemId: itemId,
          status: 'in-progress',
        });
        if (winner) return this.presentAttempt(winner);
      }
      throw err;
    }
    return toCandidateAttemptView(attempt, new Map(ordered.map((q) => [String(q._id), q])));
  }

  // Owner (or admin) read. In-progress attempts render the candidate view;
  // settled ones add score/traitScores and per-question correctness — never
  // the answer keys themselves.
  async getAttempt(user: AuthUser, attemptId: string) {
    const attempt = Types.ObjectId.isValid(attemptId)
      ? await this.attemptModel.findById(attemptId)
      : null;
    if (!attempt) throw new NotFoundException('Attempt not found');
    await this.enrollments.findByIdFor(user, String(attempt.enrollmentId)); // owner or admin
    const view = await this.presentAttempt(attempt);
    if (attempt.status === 'in-progress') return view;
    return {
      ...view,
      score: attempt.score,
      ...(attempt.traitScores ? { traitScores: attempt.traitScores } : {}),
      submittedAt: attempt.submittedAt,
      questions: view.questions.map((q, i) => {
        const aq = [...attempt.questions].sort((a, b) => a.presentedOrder - b.presentedOrder)[i];
        return {
          ...q,
          ...(aq?.correct !== undefined ? { correct: aq.correct } : {}),
          // Settled only: echo what the candidate chose so review can render
          // their selections (still never the answer KEY).
          ...(aq?.answer !== undefined ? { answer: aq.answer } : {}),
        };
      }),
    };
  }

  async submitAttempt(user: AuthUser, attemptId: string, dto: SubmitQuizDto) {
    const found = Types.ObjectId.isValid(attemptId)
      ? await this.attemptModel.findById(attemptId)
      : null;
    if (!found) throw new NotFoundException('Attempt not found');
    // Ownership through the enrollment (owner or admin read, then owner-only).
    const enrollment = await this.enrollments.findByIdFor(user, String(found.enrollmentId));
    if (String(enrollment.userId) !== user.userId) {
      throw new ForbiddenException('Not your attempt');
    }

    // Atomically claim the attempt — concurrent submits get exactly one winner.
    const attempt = await this.attemptModel.findOneAndUpdate(
      { _id: found._id, status: 'in-progress' },
      { $set: { status: 'submitted' } },
      { new: true },
    );
    if (!attempt) throw new ConflictException('Attempt already settled');

    const now = new Date();
    if (now.getTime() > attempt.startedAt.getTime() + attempt.timeLimitSec * 1000 + 5000) {
      attempt.status = 'expired';
      await attempt.save();
      throw new ConflictException('Time limit exceeded');
    }

    const onAttempt = new Set(attempt.questions.map((q) => String(q.questionId)));
    for (const a of dto.answers) {
      if (!onAttempt.has(a.questionId)) throw new BadRequestException('Unknown question in answers');
    }
    const answersById = new Map(dto.answers.map((a) => [a.questionId, a.answer]));

    const docs = await this.sampler.findByIds(attempt.questions.map((q) => q.questionId));
    const docsById = new Map(docs.map((d) => [String(d._id), d]));

    const graded: GradedQuestion[] = attempt.questions.map((aq) => {
      const doc = docsById.get(String(aq.questionId));
      // Question hard-deleted between start and submit: don't grade it as
      // wrong — leave correct undefined so computeScore drops it from the
      // denominator (candidate answer still recorded for review).
      if (!doc) {
        aq.answer = answersById.get(String(aq.questionId));
        return { id: String(aq.questionId) };
      }
      const gradable: GradableQuestion = {
        id: String(aq.questionId),
        type: (doc?.type ?? 'mcq') as GradableQuestion['type'],
        correct: doc?.correct as Array<number | string> | undefined,
        traitMapping: doc?.traitMapping,
        shuffledOptionOrder: aq.shuffledOptionOrder,
      };
      const result = gradeQuestion(gradable, answersById.get(String(aq.questionId)));
      aq.answer = answersById.get(String(aq.questionId));
      if (result.correct !== undefined) aq.correct = result.correct;
      return result;
    });

    const score = computeScore(graded);
    const traitScores = computeTraitScores(graded);
    attempt.score = score;
    if (Object.keys(traitScores).length > 0) attempt.traitScores = traitScores;
    attempt.submittedAt = now;
    attempt.status = 'submitted';
    await attempt.save();

    // Capstone attempts aren't day items; finalization (Task 6) reads them directly.
    if (attempt.quizItemId !== 'final-quiz') {
      await this.enrollments.recordItemResult(
        String(attempt.enrollmentId),
        attempt.quizItemId,
        score ?? null,
      );
    } else {
      // Capstone quiz settled — finalization decides whether everything's in.
      await this.queues.enqueueFinalization(String(attempt.enrollmentId));
    }

    const gradableCount = graded.filter((g) => g.correct !== undefined).length;
    return {
      attemptId: attempt._id,
      score,
      ...(Object.keys(traitScores).length > 0 ? { traitScores } : {}),
      correctCount: graded.filter((g) => g.correct).length,
      total: gradableCount,
      unlockState: await this.enrollments.getUnlockState(user, String(attempt.enrollmentId)),
    };
  }

  private async presentAttempt(attempt: QuizAttemptDocument) {
    const docs = await this.sampler.findByIds(attempt.questions.map((q) => q.questionId));
    return toCandidateAttemptView(
      attempt,
      new Map(docs.map((q) => [String(q._id), q as unknown as QuestionDocLike])),
    );
  }
}
