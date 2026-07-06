import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCodingProblemDto, UpdateCodingProblemDto } from '@lms/shared';
import { CategoriesService } from '../categories/categories.service';
import { CodingProblem, CodingProblemDocument } from './coding-problem.schema';

@Injectable()
export class CodingService {
  constructor(
    @InjectModel(CodingProblem.name) private problemModel: Model<CodingProblem>,
    private categories: CategoriesService,
  ) {}

  async create(dto: CreateCodingProblemDto): Promise<CodingProblemDocument> {
    const validCategory =
      Types.ObjectId.isValid(dto.categoryId) && (await this.categories.findById(dto.categoryId));
    if (!validCategory) throw new BadRequestException('Unknown category');
    return this.problemModel.create(dto);
  }

  async list(filter: {
    status?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: CodingProblem[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = { status: filter.status ?? 'active' };
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.problemModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async findById(id: string): Promise<CodingProblemDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.problemModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Coding problem not found');
    return doc;
  }

  async update(id: string, dto: UpdateCodingProblemDto): Promise<CodingProblemDocument> {
    if (dto.categoryId !== undefined) {
      const validCategory =
        Types.ObjectId.isValid(dto.categoryId) && (await this.categories.findById(dto.categoryId));
      if (!validCategory) throw new BadRequestException('Unknown category');
    }
    const doc = Types.ObjectId.isValid(id)
      ? await this.problemModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      : null;
    if (!doc) throw new NotFoundException('Coding problem not found');
    return doc;
  }

  async archive(id: string): Promise<CodingProblemDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.problemModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true })
      : null;
    if (!doc) throw new NotFoundException('Coding problem not found');
    return doc;
  }

  // Candidate read path: archived problems are indistinguishable from missing
  // (same policy as lessons/materials).
  async findActiveById(id: string): Promise<CodingProblemDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.problemModel.findOne({ _id: id, status: 'active' })
      : null;
    if (!doc) throw new NotFoundException('Coding problem not found');
    return doc;
  }
}
