import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateMaterialDto } from '@lms/shared';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { QuestionsService } from '../questions/questions.service';
import { MaterialGenerator } from './material-generator';
import { Material, MaterialDocument } from './material.schema';
import { extractText } from './text-extractor';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_DIR = join(process.cwd(), 'var', 'uploads');

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name) private materialModel: Model<Material>,
    private generator: MaterialGenerator,
    private questions: QuestionsService,
  ) {}

  // Candidate read path: only ready, non-archived materials exist to candidates.
  async findReadyById(id: string): Promise<Material & { _id: Types.ObjectId }> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.materialModel
          .findOne({ _id: id, status: 'ready', archived: { $ne: true } })
          .lean()
          .exec()
      : null;
    if (!doc) throw new NotFoundException('Material not found');
    return doc;
  }

  async findById(id: string): Promise<MaterialDocument> {
    const doc = Types.ObjectId.isValid(id) ? await this.materialModel.findById(id) : null;
    if (!doc) throw new NotFoundException('Material not found');
    return doc;
  }

  async update(id: string, dto: UpdateMaterialDto): Promise<MaterialDocument> {
    if (dto.linkedQuestionIds !== undefined) {
      for (const questionId of dto.linkedQuestionIds) {
        await this.questions.findById(questionId).catch(() => {
          throw new BadRequestException('Unknown question');
        });
      }
    }
    const doc = Types.ObjectId.isValid(id)
      ? await this.materialModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true })
      : null;
    if (!doc) throw new NotFoundException('Material not found');
    if (dto.linkedQuestionIds !== undefined) {
      await this.questions.syncMaterialLinks(doc._id, dto.linkedQuestionIds);
    }
    return doc;
  }

  async archive(id: string): Promise<MaterialDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.materialModel.findByIdAndUpdate(id, { archived: true }, { new: true })
      : null;
    if (!doc) throw new NotFoundException('Material not found');
    return doc;
  }

  async listAdmin(filter: {
    status?: string;
    archived?: boolean;
    after?: string;
    limit?: number;
  }): Promise<{ items: (Material & { _id: Types.ObjectId })[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = { archived: filter.archived ?? false };
    if (filter.status) query.status = filter.status;
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $gt: new Types.ObjectId(filter.after) };
    }
    const items = await this.materialModel.find(query).sort({ _id: 1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }

  async generateMaterial(input: {
    topic: string;
    numQuestions: number;
    categoryId: string;
  }): Promise<MaterialDocument> {
    if (!this.generator.isConfigured()) {
      throw new ServiceUnavailableException('Material generation not configured');
    }
    const generated = await this.generator.generate(input.topic, input.numQuestions);

    const material = await this.materialModel.create({
      title: generated.title,
      source: 'generated',
      content: generated.content,
      generationMeta: { prompt: input.topic, model: 'claude-sonnet-4-6', generatedAt: new Date() },
      status: 'ready',
    });

    for (const q of generated.questions) {
      const created = await this.questions.create(
        {
          type: q.type,
          categoryId: input.categoryId,
          difficulty: 2,
          prompt: q.prompt,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
          tags: ['comprehension'],
          materialId: material.id,
        },
        'generated',
      );
      material.linkedQuestionIds.push(created._id);
    }
    await material.save();
    return material;
  }

  async upload(file: UploadedFileLike | undefined, title: string): Promise<MaterialDocument> {
    if (!file) throw new BadRequestException('file is required');
    if (!title?.trim()) throw new BadRequestException('title is required');
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('Max upload size is 10 MB');

    // extractText throws 415 for unsupported mime types BEFORE anything is stored.
    const extractedText = await extractText(file.buffer, file.mimetype);

    const storageKey = `${randomUUID()}${extname(file.originalname)}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, storageKey), file.buffer);

    return this.materialModel.create({
      title: title.trim(),
      source: 'upload',
      file: {
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
      extractedText,
      status: 'ready',
    });
  }
}
