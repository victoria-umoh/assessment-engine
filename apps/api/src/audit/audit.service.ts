import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog } from './audit-log.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private auditModel: Model<AuditLog>) {}

  async record(entry: {
    actorId: string;
    action: string;
    entity: string;
    entityId?: string;
    diff?: unknown;
  }): Promise<void> {
    await this.auditModel.create(entry);
  }

  // Newest-first: audit trails read backwards, so the cursor walks $lt/-1
  // (deliberate deviation from the ascending list convention elsewhere).
  async list(filter: {
    entity?: string;
    actorId?: string;
    after?: string;
    limit?: number;
  }): Promise<{ items: AuditLog[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const query: Record<string, unknown> = {};
    if (filter.entity) query.entity = filter.entity;
    if (filter.actorId && Types.ObjectId.isValid(filter.actorId)) {
      query.actorId = new Types.ObjectId(filter.actorId);
    }
    if (filter.after && Types.ObjectId.isValid(filter.after)) {
      query._id = { $lt: new Types.ObjectId(filter.after) };
    }
    const items = await this.auditModel.find(query).sort({ _id: -1 }).limit(limit).lean().exec();
    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    return { items, nextCursor };
  }
}
