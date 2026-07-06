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
import { EnrollDto, Role } from '@lms/shared';
import { AuthUser } from '../auth/jwt.strategy';
import { CacheService } from '../cache/cache.service';
import { CohortDocument } from '../cohorts/cohort.schema';
import { CohortsService } from '../cohorts/cohorts.service';
import { QueuesService } from '../queues/queues.service';
import { TrackDay, TrackDocument, TrackItem } from '../tracks/track.schema';
import { TracksService } from '../tracks/tracks.service';
import { Enrollment, EnrollmentDocument } from './enrollment.schema';
import { computeUnlockState, UnlockState } from './unlock.engine';

export const unlockCacheKey = (enrollmentId: string) => `unlock:${enrollmentId}`;

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<Enrollment>,
    private tracks: TracksService,
    private cohorts: CohortsService,
    private queues: QueuesService,
    private cache: CacheService,
  ) {}

  async enroll(userId: string, dto: EnrollDto): Promise<EnrollmentDocument> {
    let cohort: CohortDocument | null = null;
    if (dto.cohortId) {
      cohort = await this.cohorts.findById(dto.cohortId).catch(() => null);
      if (!cohort) throw new BadRequestException('Cohort not found');
    } else if (dto.inviteCode) {
      cohort = await this.cohorts.findByInviteCode(dto.inviteCode).catch(() => null);
      if (!cohort) throw new BadRequestException('Invalid invite code');
    }

    if (cohort && !['scheduled', 'active'].includes(cohort.status)) {
      throw new BadRequestException('Cohort is not open for enrollment');
    }
    if (cohort?.capacity && (await this.countByCohort(String(cohort._id))) >= cohort.capacity) {
      throw new ConflictException('Cohort is full');
    }

    const trackId = cohort ? String(cohort.trackId) : dto.trackId!;
    const track = await this.tracks.findById(trackId).catch(() => null);
    if (!track || track.status !== 'published') {
      throw new BadRequestException('Track must be published');
    }

    // Pre-check for the common case; the unique {userId,trackId} index (E11000
    // below) stays as the race-safe backstop. On a fresh database the index
    // builds in the background, so the create alone can miss a duplicate.
    const existing = await this.enrollmentModel.exists({
      userId: new Types.ObjectId(userId),
      trackId: track._id,
    });
    if (existing) throw new ConflictException('Already enrolled');

    let created: EnrollmentDocument;
    try {
      created = await this.enrollmentModel.create({
        userId: new Types.ObjectId(userId),
        trackId: track._id,
        cohortId: cohort ? cohort._id : null,
        startDate: new Date(),
        unlockedDay: 1,
        itemProgress: [],
        status: 'active',
        version: 0,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Already enrolled');
      }
      throw err;
    }

    // The pre-create count is racy under concurrency: verify admission after
    // insert. Everyone sorts by _id, so exactly the first `capacity` inserts
    // survive; later racers delete their own doc and 409.
    if (cohort?.capacity) {
      const admitted = await this.enrollmentModel
        .find({ cohortId: cohort._id })
        .sort({ _id: 1 })
        .limit(cohort.capacity)
        .select('_id')
        .lean()
        .exec();
      if (!admitted.some((d) => String(d._id) === String(created._id))) {
        await this.enrollmentModel.deleteOne({ _id: created._id });
        throw new ConflictException('Cohort is full');
      }
    }
    return created;
  }

  findOwn(userId: string): Promise<Enrollment[]> {
    return this.enrollmentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ _id: 1 })
      .lean()
      .exec();
  }

  async findByIdFor(user: AuthUser, id: string): Promise<EnrollmentDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.enrollmentModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Enrollment not found');
    if (user.role !== Role.Admin && String(doc.userId) !== user.userId) {
      throw new ForbiddenException('Not your enrollment');
    }
    return doc;
  }

  async getUnlockState(user: AuthUser, enrollmentId: string): Promise<UnlockState> {
    // Owner/admin check runs BEFORE the cache — the key is per-enrollment, not
    // per-user, so authorization must never be short-circuited by a hit.
    const enrollment = await this.findByIdFor(user, enrollmentId);
    return this.cache.wrap(unlockCacheKey(enrollmentId), 30, () =>
      this.computeStateFor(enrollment),
    );
  }

  // Shared gate for anything that acts on a track day item (completion, quiz
  // attempts, coding submissions): owner-only, item must exist, and — unless
  // the item is already completed (idempotent paths) — its day must be unlocked.
  async assertItemActionable(
    user: AuthUser,
    enrollmentId: string,
    itemId: string,
  ): Promise<{
    enrollment: EnrollmentDocument;
    track: TrackDocument;
    item: TrackItem;
    itemDay: TrackDay;
  }> {
    const enrollment = await this.findByIdFor(user, enrollmentId);
    if (String(enrollment.userId) !== user.userId) {
      throw new ForbiddenException('Not your enrollment');
    }
    // Finalized (completed/failed/expired) enrollments are read-only — no
    // grinding a verdict after the fact.
    if (enrollment.status !== 'active') {
      throw new ConflictException('Enrollment is not active');
    }
    const track = await this.tracks.findById(String(enrollment.trackId));
    const itemDay = track.days.find((d) => d.items.some((i) => i.itemId === itemId));
    const item = itemDay?.items.find((i) => i.itemId === itemId);
    if (!itemDay || !item) throw new NotFoundException('Item not found in track');

    const alreadyCompleted = enrollment.itemProgress.some(
      (p) => p.itemId === itemId && p.status === 'completed',
    );
    if (!alreadyCompleted) {
      const preState = await this.computeStateFor(enrollment);
      const dayState = preState.days.find((d) => d.dayNumber === itemDay.dayNumber);
      if (!dayState?.unlocked) throw new ConflictException('Day is locked');
    }
    return { enrollment, track, item, itemDay };
  }

  // Capstone gate: the final assessment opens only when every required day
  // item is complete. Throws 404 when the track has no capstone.
  async assertCapstoneActionable(
    user: AuthUser,
    enrollmentId: string,
  ): Promise<{ enrollment: EnrollmentDocument; track: TrackDocument }> {
    const enrollment = await this.findByIdFor(user, enrollmentId);
    if (String(enrollment.userId) !== user.userId) {
      throw new ForbiddenException('Not your enrollment');
    }
    if (enrollment.status !== 'active') {
      throw new ConflictException('Enrollment is not active');
    }
    const track = await this.tracks.findById(String(enrollment.trackId));
    if (!track.finalAssessment) throw new NotFoundException('Track has no final assessment');
    const state = await this.computeStateFor(enrollment);
    const allDone = state.days.every((d) => d.requiredComplete === d.requiredTotal);
    if (!allDone) throw new ConflictException('Complete all days first');
    return { enrollment, track };
  }

  async completeItem(user: AuthUser, enrollmentId: string, itemId: string): Promise<UnlockState> {
    const gate = await this.assertItemActionable(user, enrollmentId, itemId);
    let enrollment = gate.enrollment;
    const { item } = gate;
    if (item.type !== 'lesson' && item.type !== 'exercise') {
      throw new UnprocessableEntityException('Item type is graded in a later phase');
    }

    // Optimistic concurrency (spec §8): guard writes on `version`; one retry
    // after reload, second miss → 409.
    for (let attempt = 0; ; attempt++) {
      const existing = enrollment.itemProgress.find((p) => p.itemId === itemId);
      if (existing?.status === 'completed') break; // idempotent

      const now = new Date();
      const score = item.type === 'exercise' ? 100 : undefined;
      const updated = existing
        ? await this.enrollmentModel.findOneAndUpdate(
            { _id: enrollment._id, version: enrollment.version },
            {
              $set: {
                'itemProgress.$[el].status': 'completed',
                'itemProgress.$[el].completedAt': now,
                'itemProgress.$[el].attempts': existing.attempts + 1,
                ...(score !== undefined ? { 'itemProgress.$[el].score': score } : {}),
              },
              $inc: { version: 1 },
            },
            { arrayFilters: [{ 'el.itemId': itemId }], new: true },
          )
        : await this.enrollmentModel.findOneAndUpdate(
            { _id: enrollment._id, version: enrollment.version },
            {
              $push: {
                itemProgress: { itemId, status: 'completed', attempts: 1, completedAt: now, score },
              },
              $inc: { version: 1 },
            },
            { new: true },
          );
      if (updated) {
        enrollment = updated;
        break;
      }
      if (attempt >= 1) throw new ConflictException('Concurrent update, retry');
      enrollment = await this.findByIdFor(user, enrollmentId);
    }

    const state = await this.computeStateFor(enrollment);
    if (enrollment.unlockedDay !== state.unlockedDay) {
      await this.enrollmentModel.updateOne(
        { _id: enrollment._id },
        { $set: { unlockedDay: state.unlockedDay } },
      );
    }
    await this.cache.del(unlockCacheKey(enrollmentId));
    // Same finalization trigger as recordItemResult — a lesson/exercise can be
    // the last required item of the track.
    if (
      enrollment.status === 'active' &&
      state.days.every((d) => d.requiredComplete === d.requiredTotal)
    ) {
      await this.queues.enqueueFinalization(String(enrollment._id));
    }
    return state;
  }

  // Post-grading progress write (quiz/coding items): every settled attempt
  // increments `attempts`, the highest score wins ($max — atomic), profile
  // quizzes pass score null (item completes without a numeric score).
  async recordItemResult(enrollmentId: string, itemId: string, score: number | null): Promise<void> {
    const updateExisting = () =>
      this.enrollmentModel.findOneAndUpdate(
        { _id: enrollmentId, 'itemProgress.itemId': itemId },
        {
          $set: { 'itemProgress.$.status': 'completed', 'itemProgress.$.completedAt': new Date() },
          ...(score !== null ? { $max: { 'itemProgress.$.score': score } } : {}),
          $inc: { 'itemProgress.$.attempts': 1, version: 1 },
        },
        { new: true },
      );

    let enrollment = await updateExisting();
    if (!enrollment) {
      // No progress entry yet — race-safe insert ($ne guards duplicates).
      enrollment = await this.enrollmentModel.findOneAndUpdate(
        { _id: enrollmentId, 'itemProgress.itemId': { $ne: itemId } },
        {
          $push: {
            itemProgress: {
              itemId,
              status: 'completed',
              attempts: 1,
              completedAt: new Date(),
              ...(score !== null ? { score } : {}),
            },
          },
          $inc: { version: 1 },
        },
        { new: true },
      );
      // Lost the insert race to a concurrent grader — the entry exists now.
      if (!enrollment) enrollment = await updateExisting();
    }
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const state = await this.computeStateFor(enrollment);
    await this.enrollmentModel.updateOne(
      { _id: enrollment._id },
      { $max: { unlockedDay: state.unlockedDay } },
    );
    await this.cache.del(unlockCacheKey(enrollmentId));

    // Finalization trigger (the /result endpoint 404s as 'Result not ready'
    // until this enqueues): once every required day item is complete, hand the
    // enrollment to the finalization queue. Capstone completeness is checked
    // by FinalizationService itself, keeping this cycle-free.
    if (enrollment.status === 'active') {
      const allDone = state.days.every((d) => d.requiredComplete === d.requiredTotal);
      if (allDone) await this.queues.enqueueFinalization(String(enrollment._id));
    }
  }

  private async computeStateFor(enrollment: EnrollmentDocument): Promise<UnlockState> {
    const track = await this.tracks.findById(String(enrollment.trackId));
    const cohort = enrollment.cohortId
      ? await this.cohorts.findById(String(enrollment.cohortId))
      : null;
    return computeUnlockState({
      days: track.days.map((d) => ({
        dayNumber: d.dayNumber,
        items: d.items.map((i) => ({
          itemId: i.itemId,
          required: i.config?.required !== false,
        })),
      })),
      itemProgress: enrollment.itemProgress.map((p) => ({ itemId: p.itemId, status: p.status })),
      anchorDate: cohort ? cohort.startDate : enrollment.startDate,
      unlockMode: cohort?.pacingOverrides?.unlockMode ?? 'hybrid',
      now: new Date(),
    });
  }

  countByCohort(cohortId: string): Promise<number> {
    return this.enrollmentModel
      .countDocuments({ cohortId: new Types.ObjectId(cohortId) })
      .exec();
  }

  async list(filter: {
    cohortId?: string;
    trackId?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: Enrollment[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.cohortId && Types.ObjectId.isValid(filter.cohortId)) {
      query.cohortId = new Types.ObjectId(filter.cohortId);
    }
    if (filter.trackId && Types.ObjectId.isValid(filter.trackId)) {
      query.trackId = new Types.ObjectId(filter.trackId);
    }
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.enrollmentModel
      .find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }
}
