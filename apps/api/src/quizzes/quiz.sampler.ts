import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Question, QuestionDocument } from '../questions/question.schema';

export interface SampleOptions {
  count: number;
  categoryIds?: string[];
  difficulty?: { min: number; max: number };
  materialId?: string;
  excludeIds: Types.ObjectId[];
}

@Injectable()
export class QuizSampler {
  constructor(@InjectModel(Question.name) private questionModel: Model<Question>) {}

  // Spec §5: $match + $sample aggregation; previously-served questions are
  // excluded only when the pool is large enough to still fill the sample.
  async sample(opts: SampleOptions): Promise<QuestionDocument[]> {
    const match: Record<string, unknown> = { status: 'active' };
    if (opts.materialId && Types.ObjectId.isValid(opts.materialId)) {
      match.materialId = new Types.ObjectId(opts.materialId);
    }
    if (opts.categoryIds?.length) {
      match.categoryId = {
        $in: opts.categoryIds.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id)),
      };
    }
    if (opts.difficulty) {
      match.difficulty = { $gte: opts.difficulty.min, $lte: opts.difficulty.max };
    }

    const poolCount = await this.questionModel.countDocuments(match).exec();
    if (poolCount === 0) throw new UnprocessableEntityException('Question pool is empty for this quiz');

    const excluded =
      opts.excludeIds.length > 0 && poolCount - opts.excludeIds.length >= opts.count
        ? { ...match, _id: { $nin: opts.excludeIds } }
        : match;

    return this.questionModel
      .aggregate([{ $match: excluded }, { $sample: { size: opts.count } }])
      .exec();
  }

  findByIds(ids: Types.ObjectId[]): Promise<QuestionDocument[]> {
    return this.questionModel.find({ _id: { $in: ids } }).lean().exec() as Promise<
      QuestionDocument[]
    >;
  }
}
