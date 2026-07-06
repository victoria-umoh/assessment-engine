import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AssessmentResult } from '../assessments/assessment-result.schema';
import { CacheService } from '../cache/cache.service';
import { Cohort } from '../cohorts/cohort.schema';
import { Enrollment } from '../enrollments/enrollment.schema';
import { Question } from '../questions/question.schema';
import { QuizAttempt } from '../quizzes/quiz-attempt.schema';
import { Submission } from '../submissions/submission.schema';
import { Track } from '../tracks/track.schema';
import { User } from '../users/user.schema';

// On-demand aggregations (spec §6). The cohort dashboard is Redis-cached
// (30s TTL + invalidation on finalization) in lieu of a worker-maintained
// pre-aggregated collection — documented deviation in ARCHITECTURE.md.
export const cohortDashCacheKey = (cohortId: string) => `cohort:dash:${cohortId}`;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Track.name) private trackModel: Model<Track>,
    @InjectModel(Cohort.name) private cohortModel: Model<Cohort>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    @InjectModel(QuizAttempt.name) private attemptModel: Model<QuizAttempt>,
    @InjectModel(Submission.name) private submissionModel: Model<Submission>,
    @InjectModel(AssessmentResult.name) private resultModel: Model<AssessmentResult>,
    private cache: CacheService,
    @InjectModel(Question.name) private questionModel: Model<Question>,
  ) {}

  // Readable count batch beats one mega-$facet at this cardinality.
  async overview() {
    const [
      admins,
      candidates,
      disabled,
      published,
      draft,
      scheduled,
      activeCohorts,
      activeEnrollments,
      completed,
      failed,
      queued,
      running,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: 'admin' }),
      this.userModel.countDocuments({ role: 'candidate' }),
      this.userModel.countDocuments({ status: 'disabled' }),
      this.trackModel.countDocuments({ status: 'published' }),
      this.trackModel.countDocuments({ status: 'draft' }),
      this.cohortModel.countDocuments({ status: 'scheduled' }),
      this.cohortModel.countDocuments({ status: 'active' }),
      this.enrollmentModel.countDocuments({ status: 'active' }),
      this.enrollmentModel.countDocuments({ status: 'completed' }),
      this.enrollmentModel.countDocuments({ status: 'failed' }),
      this.submissionModel.countDocuments({ status: 'queued' }),
      this.submissionModel.countDocuments({ status: 'running' }),
    ]);
    return {
      users: { total: admins + candidates, admins, candidates, disabled },
      tracks: { published, draft },
      cohorts: { scheduled, active: activeCohorts },
      enrollments: { active: activeEnrollments, completed, failed },
      submissions: { queued, running },
    };
  }

  cohortDashboard(cohortId: string) {
    return this.cache.wrap(cohortDashCacheKey(cohortId), 30, () =>
      this.computeCohortDashboard(cohortId),
    );
  }

  private async computeCohortDashboard(cohortId: string) {
    const cohort = Types.ObjectId.isValid(cohortId)
      ? await this.cohortModel.findById(cohortId).lean()
      : null;
    if (!cohort) throw new NotFoundException('Cohort not found');
    const track = await this.trackModel.findById(cohort.trackId).lean();

    // Required day items (config.required !== false) — completion denominator.
    const requiredIds = new Set<string>();
    for (const day of track?.days ?? []) {
      for (const item of day.items ?? []) {
        const config = item.config as Record<string, unknown> | undefined;
        if (config?.required !== false) requiredIds.add(item.itemId);
      }
    }

    interface Row {
      _id: Types.ObjectId;
      userId: Types.ObjectId;
      status: string;
      unlockedDay: number;
      itemProgress?: { itemId: string; status: string }[];
      user?: { email: string; name: string };
      result?: { weightedTotal: number; verdict: 'pass' | 'fail' };
    }
    const rows = await this.enrollmentModel.aggregate<Row>([
      { $match: { cohortId: new Types.ObjectId(cohortId) } },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      {
        $lookup: {
          from: 'assessmentresults',
          localField: '_id',
          foreignField: 'enrollmentId',
          as: 'result',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$result', preserveNullAndEmptyArrays: true } },
    ]);

    const settled = rows.filter((r) => r.result);
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    return {
      cohort: {
        _id: cohort._id,
        name: cohort.name,
        trackId: cohort.trackId,
        trackTitle: track?.title,
        startDate: cohort.startDate,
        status: cohort.status,
        capacity: cohort.capacity,
        inviteCode: cohort.inviteCode,
      },
      stats: {
        enrolled: rows.length,
        byStatus,
        verdicts: {
          pass: settled.filter((r) => r.result!.verdict === 'pass').length,
          fail: settled.filter((r) => r.result!.verdict === 'fail').length,
          pending: rows.length - settled.length,
        },
        avgWeightedTotal: settled.length
          ? settled.reduce((sum, r) => sum + r.result!.weightedTotal, 0) / settled.length
          : null,
      },
      candidates: rows.map((r) => ({
        enrollmentId: String(r._id),
        userId: String(r.userId),
        email: r.user?.email,
        name: r.user?.name,
        status: r.status,
        unlockedDay: r.unlockedDay,
        requiredComplete: (r.itemProgress ?? []).filter(
          (p) => requiredIds.has(p.itemId) && p.status === 'completed',
        ).length,
        requiredTotal: requiredIds.size,
        ...(r.result ? { weightedTotal: r.result.weightedTotal, verdict: r.result.verdict } : {}),
      })),
    };
  }

  async enrollmentDetail(enrollmentId: string) {
    const enrollment = Types.ObjectId.isValid(enrollmentId)
      ? await this.enrollmentModel.findById(enrollmentId).lean()
      : null;
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const [user, track, attempts, submissions, result] = await Promise.all([
      this.userModel.findById(enrollment.userId).select('email name').lean(),
      this.trackModel.findById(enrollment.trackId).select('title durationDays').lean(),
      // No `questions` projection: sampled questions carry correct answers.
      this.attemptModel
        .find({ enrollmentId: enrollment._id })
        .select('quizItemId status score traitScores startedAt submittedAt')
        .sort({ _id: 1 })
        .lean(),
      // No sourceCode/testResults: heavy and candidate-private.
      this.submissionModel
        .find({ enrollmentId: enrollment._id })
        .select('problemId itemId final status score createdAt')
        .sort({ _id: 1 })
        .lean(),
      this.resultModel.findOne({ enrollmentId: enrollment._id }).lean(),
    ]);

    return { enrollment, user, track, attempts, submissions, result: result ?? null };
  }

  // Per-question stats over answered attempt questions ($unwind + $group),
  // spec §5 'per-question stats'. categoryId filters via the joined question.
  async questionStats(filter: { categoryId?: string; limit?: number }) {
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    interface Stat {
      _id: Types.ObjectId;
      served: number;
      correctCount: number;
      question?: { prompt: string; categoryId: Types.ObjectId };
    }
    const rows = await this.attemptModel.aggregate<Stat>([
      { $unwind: '$questions' },
      { $match: { 'questions.correct': { $exists: true } } },
      {
        $group: {
          _id: '$questions.questionId',
          served: { $sum: 1 },
          correctCount: { $sum: { $cond: ['$questions.correct', 1, 0] } },
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: '_id',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: { path: '$question', preserveNullAndEmptyArrays: true } },
      // Category filter must run BEFORE the top-N cut, or a low-traffic
      // category is silently masked by the global leaders.
      ...(filter.categoryId && Types.ObjectId.isValid(filter.categoryId)
        ? [{ $match: { 'question.categoryId': new Types.ObjectId(filter.categoryId) } }]
        : []),
      { $sort: { served: -1 } },
      { $limit: limit },
    ]);
    return rows.map((r) => ({
      questionId: String(r._id),
      prompt: r.question?.prompt,
      served: r.served,
      correctRate: r.served ? r.correctCount / r.served : 0,
    }));
  }
}
