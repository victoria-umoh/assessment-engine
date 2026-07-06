import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

// Spec §4 auditLogs. `diff` records the sanitized mutation payload (request
// body minus password fields) rather than a computed before/after delta —
// documented deviation in ARCHITECTURE.md.
@Schema({ timestamps: { createdAt: 'at', updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ required: true })
  action: string; // '<METHOD> <route path>'

  @Prop({ required: true, index: true })
  entity: string; // first path segment after /admin/

  @Prop()
  entityId?: string;

  @Prop({ type: SchemaTypes.Mixed })
  diff?: unknown;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Viewer reads are newest-first cursors filtered by entity/actorId; compound
// {filter, _id:-1} indexes cover filter + sort together.
AuditLogSchema.index({ entity: 1, _id: -1 });
AuditLogSchema.index({ actorId: 1, _id: -1 });
