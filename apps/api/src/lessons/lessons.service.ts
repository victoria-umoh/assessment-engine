import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateLessonDto, UpdateLessonDto } from '@lms/shared';
import { CacheService } from '../cache/cache.service';
import { toCandidateLessonView } from './lesson.views';
import { Lesson, LessonDocument } from './lesson.schema';

export const lessonCacheKey = (id: string) => `lesson:cand:${id}`;

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(Lesson.name) private lessonModel: Model<Lesson>,
    private cache: CacheService,
  ) {}

  create(dto: CreateLessonDto): Promise<LessonDocument> {
    return this.lessonModel.create(dto);
  }

  async list(filter: {
    status?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: Lesson[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = { status: filter.status ?? 'active' };
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.lessonModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async update(id: string, dto: UpdateLessonDto): Promise<LessonDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.lessonModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      : null;
    if (!doc) throw new NotFoundException('Lesson not found');
    await this.cache.del(lessonCacheKey(id));
    return doc;
  }

  async archive(id: string): Promise<LessonDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.lessonModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true })
      : null;
    if (!doc) throw new NotFoundException('Lesson not found');
    await this.cache.del(lessonCacheKey(id));
    return doc;
  }

  // Candidate read path: archived lessons are indistinguishable from missing.
  async findActiveById(id: string): Promise<Lesson & { _id: Types.ObjectId }> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.lessonModel.findOne({ _id: id, status: 'active' }).lean().exec()
      : null;
    if (!doc) throw new NotFoundException('Lesson not found');
    return doc;
  }

  // Cached candidate read: the serialized VIEW is cached (projection applied
  // before caching — never the raw doc). 404s throw inside fn, never cached.
  candidateView(id: string): Promise<ReturnType<typeof toCandidateLessonView>> {
    return this.cache.wrap(lessonCacheKey(id), 300, async () =>
      toCandidateLessonView(await this.findActiveById(id)),
    );
  }
}
