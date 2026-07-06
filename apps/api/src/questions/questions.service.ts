import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createQuestionSchema, CreateQuestionDto, UpdateQuestionDto } from '@lms/shared';
import { CategoriesService } from '../categories/categories.service';
import { Question, QuestionDocument } from './question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<Question>,
    private categories: CategoriesService,
  ) {}

  async create(dto: CreateQuestionDto, source: 'admin' | 'generated' = 'admin'): Promise<QuestionDocument> {
    await this.assertCategoryExists(dto.categoryId);
    return this.questionModel.create({ ...dto, source });
  }

  async list(filter: {
    categoryId?: string;
    difficulty?: number;
    type?: string;
    status?: string;
    materialId?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: Question[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = { status: filter.status ?? 'active' };
    if (filter.categoryId) query.categoryId = filter.categoryId;
    if (filter.difficulty) query.difficulty = filter.difficulty;
    if (filter.type) query.type = filter.type;
    if (filter.materialId) query.materialId = filter.materialId;
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.questionModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async findById(id: string): Promise<QuestionDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.questionModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Question not found');
    return doc;
  }

  async update(id: string, dto: UpdateQuestionDto): Promise<QuestionDocument> {
    const doc = await this.findById(id);
    // Merge the partial edit onto the stored fields and re-run the full create
    // validation so type-dependent invariants (mcq needs options+correct, …)
    // hold after every edit. type/materialId are immutable by schema.
    const merged = createQuestionSchema.safeParse({
      type: doc.type,
      categoryId: dto.categoryId ?? String(doc.categoryId),
      difficulty: dto.difficulty ?? doc.difficulty,
      prompt: dto.prompt ?? doc.prompt,
      options: dto.options ?? doc.options,
      correct: dto.correct ?? doc.correct,
      traitMapping: dto.traitMapping ?? doc.traitMapping,
      explanation: dto.explanation ?? doc.explanation,
      tags: dto.tags ?? doc.tags,
      ...(doc.materialId ? { materialId: String(doc.materialId) } : {}),
    });
    if (!merged.success) throw new BadRequestException(merged.error.flatten());
    if (dto.categoryId !== undefined) await this.assertCategoryExists(dto.categoryId);
    doc.set(merged.data);
    return doc.save();
  }

  // Questions own materialId; the material's linkedQuestionIds list is the
  // admin-editable source of truth. Called after a material link edit so the
  // reading sampler and the roster query (both keyed on question.materialId)
  // agree with the list — otherwise unlink is a silent no-op.
  async syncMaterialLinks(materialId: Types.ObjectId, linkedQuestionIds: string[]): Promise<void> {
    const linked = linkedQuestionIds
      .filter(Types.ObjectId.isValid)
      .map((id) => new Types.ObjectId(id));
    await this.questionModel.updateMany(
      { materialId, _id: { $nin: linked } },
      { $unset: { materialId: 1 } },
    );
    if (linked.length) {
      await this.questionModel.updateMany({ _id: { $in: linked } }, { $set: { materialId } });
    }
  }

  async archive(id: string): Promise<QuestionDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.questionModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true })
      : null;
    if (!doc) throw new NotFoundException('Question not found');
    return doc;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = Types.ObjectId.isValid(categoryId) && (await this.categories.findById(categoryId));
    if (!exists) throw new BadRequestException('Unknown category');
  }
}
