import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTrackDto, UpdateTrackDto } from '@lms/shared';
import { CacheService } from '../cache/cache.service';
import { CodingProblem } from '../coding/coding-problem.schema';
import { Lesson } from '../lessons/lesson.schema';
import { Material } from '../materials/material.schema';
import { Track, TrackDocument } from './track.schema';

export const TRACKS_LIST_CACHE_KEY = 'track:pub:list';
export const trackCacheKey = (id: string) => `track:pub:${id}`;

@Injectable()
export class TracksService {
  constructor(
    @InjectModel(Track.name) private trackModel: Model<Track>,
    @InjectModel(Lesson.name) private lessonModel: Model<Lesson>,
    @InjectModel(Material.name) private materialModel: Model<Material>,
    @InjectModel(CodingProblem.name) private codingModel: Model<CodingProblem>,
    private cache: CacheService,
  ) {}

  create(dto: CreateTrackDto): Promise<TrackDocument> {
    return this.trackModel.create({ ...dto, days: this.withItemIds(dto.days ?? []) });
  }

  async update(id: string, dto: UpdateTrackDto): Promise<TrackDocument> {
    const track = await this.findById(id);
    if (track.status !== 'draft') {
      throw new ConflictException('Only draft tracks can be edited');
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.days) patch.days = this.withItemIds(dto.days);
    if (dto.finalAssessment === null) {
      delete patch.finalAssessment;
      track.set('finalAssessment', undefined);
    }
    Object.assign(track, patch);
    const saved = await track.save();
    await this.invalidate(id);
    return saved;
  }

  async publish(id: string): Promise<TrackDocument> {
    const track = await this.findById(id);
    if (track.status !== 'draft') {
      throw new ConflictException('Only draft tracks can be published');
    }
    const problems: string[] = [];
    if (track.days.length === 0) problems.push('track must have at least one day');
    if (track.days.length > 0 && track.days.length !== track.durationDays) {
      problems.push(`track has ${track.days.length} days but durationDays is ${track.durationDays}`);
    }
    track.days.forEach((day, i) => {
      if (day.dayNumber !== i + 1) problems.push(`dayNumbers must be contiguous 1..N (got ${day.dayNumber} at position ${i + 1})`);
      if (day.items.length === 0) problems.push(`day ${day.dayNumber} has no items`);
    });
    for (const day of track.days) {
      for (const item of day.items) {
        if (!['lesson', 'reading', 'coding'].includes(item.type)) continue;
        const ok = await this.refExists(item.type as 'lesson' | 'reading' | 'coding', item.refId);
        if (!ok) problems.push(`day ${day.dayNumber}: ${item.type} refId ${item.refId ?? '(missing)'} does not resolve`);
      }
    }
    if (problems.length) throw new BadRequestException(problems);
    track.status = 'published';
    const saved = await track.save();
    await this.invalidate(id);
    return saved;
  }

  async archive(id: string): Promise<TrackDocument> {
    const track = await this.findById(id);
    track.status = 'archived';
    const saved = await track.save();
    await this.invalidate(id);
    return saved;
  }

  private invalidate(id: string): Promise<void> {
    return this.cache.del(TRACKS_LIST_CACHE_KEY, trackCacheKey(id));
  }

  async findById(id: string): Promise<TrackDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.trackModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Track not found');
    return doc;
  }

  async list(filter: { status?: string; after?: string; limit?: number }): Promise<{ items: Track[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.trackModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  // Candidate-facing reads exclude finalAssessment (exam integrity — problem
  // ids and quiz config must not reach candidates before Phase 4 serves them).
  listPublished(): Promise<Track[]> {
    return this.cache.wrap(TRACKS_LIST_CACHE_KEY, 300, () =>
      this.trackModel
        .find({ status: 'published' })
        .select('-finalAssessment')
        .sort({ _id: 1 })
        .lean()
        .exec(),
    );
  }

  findPublishedById(id: string): Promise<Track> {
    // 404s throw inside the wrap fn and are never cached.
    return this.cache.wrap(trackCacheKey(id), 300, async () => {
      const doc = Types.ObjectId.isValid(id)
        ? await this.trackModel
            .findOne({ _id: id, status: 'published' })
            .select('-finalAssessment')
            .lean()
            .exec()
        : null;
      if (!doc) throw new NotFoundException('Track not found');
      return doc;
    });
  }

  private withItemIds(days: Array<{ dayNumber: number; items: Array<{ type: string; refId?: string; config: Record<string, unknown> }> }>) {
    return days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item, itemId: new Types.ObjectId().toString() })),
    }));
  }

  private async refExists(type: 'lesson' | 'reading' | 'coding', refId?: string): Promise<boolean> {
    if (!refId || !Types.ObjectId.isValid(refId)) return false;
    const model =
      type === 'lesson' ? this.lessonModel : type === 'reading' ? this.materialModel : this.codingModel;
    return (await model.exists({ _id: refId })) !== null;
  }
}
