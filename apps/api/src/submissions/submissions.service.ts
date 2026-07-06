import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateSubmissionDto, JUDGE0_LANGUAGE_IDS, Role } from '@lms/shared';
import { AuthUser } from '../auth/jwt.strategy';
import { CodingProblem } from '../coding/coding-problem.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { QueuesService } from '../queues/queues.service';
import { Submission, SubmissionDocument } from './submission.schema';
import { SubmissionLike, toCandidateSubmissionView } from './submission.views';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name) private submissionModel: Model<Submission>,
    @InjectModel(CodingProblem.name) private problemModel: Model<CodingProblem>,
    private enrollments: EnrollmentsService,
    private queues: QueuesService,
  ) {}

  async create(user: AuthUser, dto: CreateSubmissionDto) {
    if (dto.itemId) {
      const { item } = await this.enrollments.assertItemActionable(
        user,
        dto.enrollmentId,
        dto.itemId,
      );
      if (item.type !== 'coding') throw new BadRequestException('Item is not a coding item');
      if (item.refId !== dto.problemId) {
        throw new BadRequestException('problemId does not match the item');
      }
    } else {
      // Capstone submission: days must be complete (409 otherwise) and the
      // problem must belong to the track's final assessment.
      const { track } = await this.enrollments.assertCapstoneActionable(user, dto.enrollmentId);
      const allowed = track.finalAssessment?.codingProblemIds ?? [];
      if (!allowed.some((pid) => String(pid) === dto.problemId)) {
        throw new BadRequestException('Problem is not part of the final assessment');
      }
    }

    const problem = Types.ObjectId.isValid(dto.problemId)
      ? await this.problemModel.findById(dto.problemId).lean()
      : null;
    if (!problem) throw new NotFoundException('Problem not found');
    if (!(dto.language in JUDGE0_LANGUAGE_IDS) || !problem.languages.includes(dto.language)) {
      throw new BadRequestException('Language not supported for this problem');
    }

    const inFlight = await this.submissionModel.exists({
      enrollmentId: new Types.ObjectId(dto.enrollmentId),
      problemId: problem._id,
      status: { $in: ['queued', 'running'] },
    });
    if (inFlight) throw new ConflictException('Submission already in progress');

    let submission: SubmissionDocument;
    try {
      submission = await this.submissionModel.create({
        enrollmentId: new Types.ObjectId(dto.enrollmentId),
        ...(dto.itemId ? { itemId: dto.itemId } : {}),
        problemId: problem._id,
        final: dto.final,
        language: dto.language,
        sourceCode: dto.sourceCode,
        status: 'queued',
      });
    } catch (err) {
      // Lost the in-flight race — the partial unique index is the arbiter.
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Submission already in progress');
      }
      throw err;
    }
    await this.queues.enqueueGrading(String(submission._id));
    return submission;
  }

  // Owner-or-admin list of an enrollment's submissions (candidate view).
  async listForEnrollment(
    user: AuthUser,
    enrollmentId: string,
    filter: { problemId?: string; after?: string; limit?: number },
  ) {
    await this.enrollments.findByIdFor(user, enrollmentId); // owner or admin, else 403
    const { items, nextCursor } = await this.list({ enrollmentId, ...filter });
    if (user.role === Role.Admin) return { items, nextCursor };
    const views = [];
    for (const s of items) {
      const problem = await this.problemModel.findById(s.problemId).lean();
      views.push(
        toCandidateSubmissionView(
          s as unknown as SubmissionLike,
          (problem?.testCases ?? []).map((tc) => tc.hidden),
        ),
      );
    }
    return { items: views, nextCursor };
  }

  async list(filter: {
    enrollmentId?: string;
    problemId?: string;
    after?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.enrollmentId && Types.ObjectId.isValid(filter.enrollmentId)) {
      query.enrollmentId = new Types.ObjectId(filter.enrollmentId);
    }
    if (filter.problemId) {
      // An invalid id matches nothing — never "drop the filter and return all".
      query.problemId = Types.ObjectId.isValid(filter.problemId)
        ? new Types.ObjectId(filter.problemId)
        : { $in: [] };
    }
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.submissionModel
      .find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async findByIdFor(user: AuthUser, id: string) {
    const submission = Types.ObjectId.isValid(id)
      ? await this.submissionModel.findById(id)
      : null;
    if (!submission) throw new NotFoundException('Submission not found');
    // Ownership through the enrollment (owner or admin).
    await this.enrollments.findByIdFor(user, String(submission.enrollmentId));
    if (user.role === Role.Admin) return submission;
    const problem = await this.problemModel.findById(submission.problemId).lean();
    const hiddenByIndex = (problem?.testCases ?? []).map((tc) => tc.hidden);
    return toCandidateSubmissionView(
      submission.toObject({ virtuals: false }) as unknown as SubmissionLike,
      hiddenByIndex,
    );
  }
}
