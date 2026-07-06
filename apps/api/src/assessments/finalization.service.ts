import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { cohortDashCacheKey } from '../analytics/analytics.service';
import { CacheService } from '../cache/cache.service';
import { Category } from '../categories/category.schema';
import { Enrollment } from '../enrollments/enrollment.schema';
import { Question } from '../questions/question.schema';
import { QuizAttempt } from '../quizzes/quiz-attempt.schema';
import { Submission } from '../submissions/submission.schema';
import { Track } from '../tracks/track.schema';
import { AssessmentResult } from './assessment-result.schema';
import { computeAssessmentResult, ScoreableType, ScoringInput } from './scoring.engine';

// Builds the ScoringInput from persisted attempts/submissions/progress and
// writes assessmentResults. Idempotent: re-runs recompute and overwrite.
@Injectable()
export class FinalizationService {
  private logger = new Logger(FinalizationService.name);

  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    private cache: CacheService,
    @InjectModel(Track.name) private trackModel: Model<Track>,
    @InjectModel(QuizAttempt.name) private attemptModel: Model<QuizAttempt>,
    @InjectModel(Submission.name) private submissionModel: Model<Submission>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(AssessmentResult.name) private resultModel: Model<AssessmentResult>,
  ) {}

  // Candidate-facing capstone surface: availability + per-part status.
  async capstoneStatus(enrollment: {
    _id: unknown;
    trackId: unknown;
    itemProgress: Array<{ itemId: string; status: string }>;
  }) {
    const track = await this.trackModel.findById(enrollment.trackId).lean();
    if (!track?.finalAssessment) throw new NotFoundException('Track has no final assessment');

    const completed = new Set(
      enrollment.itemProgress.filter((p) => p.status === 'completed').map((p) => p.itemId),
    );
    const available = track.days.every((d) =>
      d.items.every(
        (i) => (i.config as { required?: boolean })?.required === false || completed.has(i.itemId),
      ),
    );

    const status: Record<string, unknown> = { available };
    if (track.finalAssessment.quizConfig) {
      const attempts = await this.attemptModel
        .find({ enrollmentId: enrollment._id, quizItemId: 'final-quiz', status: 'submitted' })
        .lean();
      status.quiz = {
        config: track.finalAssessment.quizConfig,
        attempted: attempts.length > 0,
        ...(attempts.length > 0
          ? { score: Math.max(...attempts.map((a) => a.score ?? 0)) }
          : {}),
      };
    }
    if (track.finalAssessment.codingProblemIds?.length) {
      const finalSubs = await this.submissionModel
        .find({ enrollmentId: enrollment._id, final: true, status: { $in: ['passed', 'failed'] } })
        .lean();
      status.coding = track.finalAssessment.codingProblemIds.map((pid) => {
        const scores = finalSubs
          .filter((s) => String(s.problemId) === String(pid))
          .map((s) => s.score);
        return {
          problemId: pid,
          settled: scores.length > 0,
          ...(scores.length > 0 ? { bestScore: Math.max(...scores) } : {}),
        };
      });
    }
    return status;
  }

  async finalize(enrollmentId: string): Promise<void> {
    const enrollment = await this.enrollmentModel.findById(enrollmentId).lean();
    if (!enrollment) return;
    const track = await this.trackModel.findById(enrollment.trackId).lean();
    if (!track) return;

    // Capstone gate: with a finalAssessment configured, every part must be
    // settled before a verdict is written — a premature enqueue is a no-op.
    if (track.finalAssessment) {
      if (track.finalAssessment.quizConfig) {
        const settledFinalQuiz = await this.attemptModel.exists({
          enrollmentId: enrollment._id,
          quizItemId: 'final-quiz',
          status: 'submitted',
        });
        if (!settledFinalQuiz) {
          this.logger.log(`Enrollment ${enrollmentId}: capstone quiz pending, skipping finalize`);
          return;
        }
      }
      for (const pid of track.finalAssessment.codingProblemIds ?? []) {
        const settled = await this.submissionModel.exists({
          enrollmentId: enrollment._id,
          problemId: pid,
          final: true,
          status: { $in: ['passed', 'failed'] },
        });
        if (!settled) {
          this.logger.log(`Enrollment ${enrollmentId}: capstone coding pending, skipping finalize`);
          return;
        }
      }
    }

    // Day items: completed progress entries mapped to their track item types.
    const typeByItemId = new Map<string, string>();
    for (const day of track.days) {
      for (const item of day.items) typeByItemId.set(item.itemId, item.type);
    }
    const items = enrollment.itemProgress
      .filter((p) => p.status === 'completed')
      .map((p) => ({ type: typeByItemId.get(p.itemId), score: p.score ?? null }))
      .filter((i): i is { type: ScoreableType; score: number | null } =>
        ['quiz', 'coding', 'exercise', 'reading'].includes(i.type ?? ''),
      );

    const attempts = await this.attemptModel
      .find({ enrollmentId: enrollment._id, status: 'submitted' })
      .lean();

    // Capstone scores: best settled final-quiz attempt + best submission per problem.
    let finalScores: ScoringInput['finalScores'];
    if (track.finalAssessment) {
      finalScores = {};
      const finalAttempts = attempts.filter(
        (a) => a.quizItemId === 'final-quiz' && a.score !== undefined,
      );
      if (finalAttempts.length > 0) {
        finalScores.quiz = Math.max(...finalAttempts.map((a) => a.score as number));
      }
      const problemIds = track.finalAssessment.codingProblemIds ?? [];
      if (problemIds.length > 0) {
        const finalSubs = await this.submissionModel
          .find({
            enrollmentId: enrollment._id,
            final: true,
            status: { $in: ['passed', 'failed'] },
          })
          .lean();
        finalScores.codingByProblem = problemIds.map((pid) => {
          const scores = finalSubs
            .filter((s) => String(s.problemId) === String(pid))
            .map((s) => s.score);
          return scores.length > 0 ? Math.max(...scores) : 0;
        });
      }
    }

    // Per-category correctness across all settled attempts.
    const questionIds = [
      ...new Set(attempts.flatMap((a) => a.questions.map((q) => String(q.questionId)))),
    ].map((id) => new Types.ObjectId(id));
    const questions = await this.questionModel
      .find({ _id: { $in: questionIds } })
      .select('categoryId')
      .lean();
    const categoryIdByQuestion = new Map(
      questions.map((q) => [String(q._id), String(q.categoryId)]),
    );
    const categories = await this.categoryModel.find().select('key').lean();
    const keyByCategoryId = new Map(categories.map((c) => [String(c._id), c.key]));

    const stats = new Map<string, { correct: number; total: number }>();
    for (const attempt of attempts) {
      for (const q of attempt.questions) {
        if (q.correct === undefined) continue;
        const key = keyByCategoryId.get(categoryIdByQuestion.get(String(q.questionId)) ?? '');
        if (!key) continue;
        const entry = stats.get(key) ?? { correct: 0, total: 0 };
        entry.total += 1;
        if (q.correct) entry.correct += 1;
        stats.set(key, entry);
      }
    }

    const result = computeAssessmentResult({
      weights: track.scoring.weights,
      passThreshold: track.scoring.passThreshold,
      categoryMinimums: track.scoring.categoryMinimums,
      items,
      finalScores,
      categoryStats: [...stats].map(([categoryKey, s]) => ({ categoryKey, ...s })),
      traitScores: attempts.filter((a) => a.traitScores).map((a) => a.traitScores!),
    });

    await this.resultModel.updateOne(
      { enrollmentId: enrollment._id },
      {
        $set: {
          breakdown: result.breakdown,
          ...(result.personalityProfile ? { personalityProfile: result.personalityProfile } : {}),
          typeScores: result.typeScores,
          weightedTotal: result.weightedTotal,
          verdict: result.verdict,
          failedMinimums: result.failedMinimums,
          generatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await this.enrollmentModel.updateOne(
      { _id: enrollment._id, status: { $in: ['active', 'completed', 'failed'] } },
      { $set: { status: result.verdict === 'pass' ? 'completed' : 'failed' } },
    );
    // A settled verdict changes the cohort dashboard — bust its cache.
    if (enrollment.cohortId) {
      await this.cache.del(cohortDashCacheKey(String(enrollment.cohortId)));
    }
    this.logger.log(`Finalized enrollment ${enrollmentId}: ${result.verdict}`);
  }
}
