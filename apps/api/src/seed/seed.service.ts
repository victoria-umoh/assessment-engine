import { readFileSync } from 'fs';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto, createCategorySchema } from '@lms/shared';
import { Category } from '../categories/category.schema';
import { Question } from '../questions/question.schema';

interface SeedQuestionEntry {
  seedId: string;
  categoryKey: string;
  [field: string]: unknown;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);
  private readonly dataDir = join(__dirname, 'data');

  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    @InjectModel(Question.name) private questionModel: Model<Question>,
  ) {}

  /** Idempotent: categories upsert by key, questions by seedId. Never duplicates. */
  async run(): Promise<{ categories: number; questions: number }> {
    const categories = this.loadJson<CreateCategoryDto[]>('categories.json');
    const idByKey = new Map<string, Types.ObjectId>();

    for (const raw of categories) {
      const { key, ...rest } = createCategorySchema.parse(raw);
      const doc = await this.categoryModel
        .findOneAndUpdate(
          { key },
          // $set never touches status: an admin-archived category stays archived on re-seed.
          { $set: rest, $setOnInsert: { key, status: 'active' } },
          { upsert: true, new: true },
        )
        .exec();
      idByKey.set(key, doc._id);
    }

    let questions = 0;
    for (const [key, categoryId] of idByKey.entries()) {
      const items = this.loadJson<SeedQuestionEntry[]>(`questions.${key}.json`);
      const ops = items.map((item) => {
        const { seedId, categoryKey: _categoryKey, ...fields } = item;
        return {
          updateOne: {
            filter: { seedId },
            update: {
              $set: { ...fields, categoryId, source: 'seed' as const },
              // Admin-archived seed questions are not resurrected on re-seed.
              $setOnInsert: { seedId, status: 'active' as const },
            },
            upsert: true,
          },
        };
      });
      if (ops.length) await this.questionModel.bulkWrite(ops);
      questions += items.length;
      this.logger.log(`Seeded ${items.length} questions for ${key}`);
    }

    return { categories: idByKey.size, questions };
  }

  private loadJson<T>(file: string): T {
    return JSON.parse(readFileSync(join(this.dataDir, file), 'utf8')) as T;
  }
}
