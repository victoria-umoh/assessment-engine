import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCategoryDto } from '@lms/shared';
import { CacheService } from '../cache/cache.service';
import { Category, CategoryDocument } from './category.schema';

export const CATEGORIES_CACHE_KEY = 'cats:active';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    private cache: CacheService,
  ) {}

  async archive(id: string): Promise<CategoryDocument> {
    const doc = await this.categoryModel.findByIdAndUpdate(id, { status: 'archived' }, { new: true });
    if (!doc) throw new NotFoundException('Category not found');
    await this.cache.del(CATEGORIES_CACHE_KEY);
    return doc;
  }

  findById(id: string): Promise<CategoryDocument | null> {
    return this.categoryModel.findById(id).exec();
  }

  listActive(): Promise<Category[]> {
    return this.cache.wrap(CATEGORIES_CACHE_KEY, 300, () =>
      this.categoryModel.find({ status: 'active' }).sort({ key: 1 }).lean().exec(),
    );
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    try {
      const doc = await this.categoryModel.create(dto);
      await this.cache.del(CATEGORIES_CACHE_KEY);
      return doc;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Category key already exists');
      }
      throw err;
    }
  }
}
