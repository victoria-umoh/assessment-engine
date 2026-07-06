import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class ItemProgress {
  @Prop({ required: true }) itemId: string;

  @Prop({ required: true, enum: ['not-started', 'in-progress', 'completed'] })
  status: 'not-started' | 'in-progress' | 'completed';

  @Prop() score?: number;
  @Prop({ default: 0 }) attempts: number;
  @Prop() completedAt?: Date;
}
const ItemProgressSchema = SchemaFactory.createForClass(ItemProgress);

@Schema({ timestamps: true })
export class Enrollment {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) userId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) trackId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) cohortId: Types.ObjectId | null;

  @Prop({ required: true }) startDate: Date;
  @Prop({ default: 1 }) unlockedDay: number;

  @Prop({ type: [ItemProgressSchema], default: [] }) itemProgress: ItemProgress[];

  @Prop({ enum: ['active', 'completed', 'failed', 'expired'], default: 'active' })
  status: 'active' | 'completed' | 'failed' | 'expired';

  // Optimistic concurrency token for progress writes (spec §8).
  @Prop({ default: 0 }) version: number;
}

export type EnrollmentDocument = HydratedDocument<Enrollment>;
export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
EnrollmentSchema.index({ userId: 1, trackId: 1 }, { unique: true });
