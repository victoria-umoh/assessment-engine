import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCohortDto, UpdateCohortDto } from '@lms/shared';
import { cohortDashCacheKey } from '../analytics/analytics.service';
import { CacheService } from '../cache/cache.service';
import { TracksService } from '../tracks/tracks.service';
import { Cohort, CohortDocument } from './cohort.schema';

// RFC 4648 base32 alphabet; 256 % 32 === 0 so byte-modulo stays uniform.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class CohortsService {
  constructor(
    @InjectModel(Cohort.name) private cohortModel: Model<Cohort>,
    private tracks: TracksService,
    private cache: CacheService,
  ) {}

  async create(dto: CreateCohortDto): Promise<CohortDocument> {
    const track = await this.tracks.findById(dto.trackId).catch(() => null);
    if (!track || track.status !== 'published') {
      throw new BadRequestException('Track must be published');
    }
    return this.cohortModel.create({
      ...dto,
      inviteCode: this.generateInviteCode(),
      status: dto.startDate.getTime() > Date.now() ? 'scheduled' : 'active',
    });
  }

  async update(id: string, dto: UpdateCohortDto): Promise<CohortDocument> {
    const cohort = await this.findById(id);
    Object.assign(cohort, dto);
    // A moved startDate re-derives scheduled/active (archived stays archived).
    if (dto.startDate && cohort.status !== 'archived') {
      cohort.status = dto.startDate.getTime() > Date.now() ? 'scheduled' : 'active';
    }
    const saved = await cohort.save();
    // The dashboard reads cohort status/startDate; bust its cache. (Per-
    // enrollment unlock caches age out on their own 30s TTL — a moved
    // startDate is visible within that bound; documented in ARCHITECTURE.)
    await this.cache.del(cohortDashCacheKey(id));
    return saved;
  }

  async archive(id: string): Promise<CohortDocument> {
    const cohort = await this.findById(id);
    cohort.status = 'archived';
    return cohort.save();
  }

  async findById(id: string): Promise<CohortDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.cohortModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Cohort not found');
    return doc;
  }

  async findByInviteCode(code: string): Promise<CohortDocument> {
    const doc = await this.cohortModel.findOne({ inviteCode: code });
    if (!doc) throw new NotFoundException('Cohort not found');
    return doc;
  }

  async list(filter: {
    trackId?: string;
    status?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: Cohort[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.trackId && Types.ObjectId.isValid(filter.trackId)) {
      query.trackId = new Types.ObjectId(filter.trackId);
    }
    if (filter.status) query.status = filter.status;
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.cohortModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  private generateInviteCode(): string {
    return Array.from(randomBytes(8), (b) => BASE32[b % 32]).join('');
  }
}
