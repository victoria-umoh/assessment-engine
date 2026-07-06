import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createTestApp } from './helpers/app.factory';
import { Category } from '../src/categories/category.schema';
import { Question } from '../src/questions/question.schema';
import { SeedService } from '../src/seed/seed.service';

const CATEGORY_KEYS = [
  'logical-reasoning',
  'verbal-reasoning',
  'numerical-reasoning',
  'abstract-reasoning',
  'spatial-reasoning',
  'pattern-recognition',
  'qualitative-reasoning',
  'quantitative-reasoning',
  'computational-thinking',
  'aptitude',
  'cognitive-ability',
  'personality',
];

describe('Seed', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let categoryModel: Model<Category>;
  let questionModel: Model<Question>;

  beforeAll(async () => {
    ctx = await createTestApp();
    categoryModel = ctx.app.get(getModelToken(Category.name));
    questionModel = ctx.app.get(getModelToken(Question.name));
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('seeds 12 categories and 300+ questions (>=25 active per category) on an empty DB', async () => {
    const result = await ctx.app.get(SeedService).run();
    expect(result.categories).toBe(12);
    expect(result.questions).toBeGreaterThanOrEqual(300);

    expect(await categoryModel.countDocuments()).toBe(12);
    expect(await questionModel.countDocuments()).toBeGreaterThanOrEqual(300);

    for (const key of CATEGORY_KEYS) {
      const category = await categoryModel.findOne({ key });
      expect(category).not.toBeNull();
      const active = await questionModel.countDocuments({
        categoryId: category!._id,
        status: 'active',
        source: 'seed',
      });
      expect(active).toBeGreaterThanOrEqual(25);
    }
  });

  it('is idempotent: a second run leaves the same totals', async () => {
    const before = {
      categories: await categoryModel.countDocuments(),
      questions: await questionModel.countDocuments(),
    };
    const result = await ctx.app.get(SeedService).run();
    expect(result.categories).toBe(12);
    expect(result.questions).toBe(before.questions);
    expect(await categoryModel.countDocuments()).toBe(before.categories);
    expect(await questionModel.countDocuments()).toBe(before.questions);
  });
});
