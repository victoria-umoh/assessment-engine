import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Cohort {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) trackId: Types.ObjectId;

  @Prop({ required: true }) name: string;

  @Prop({ required: true }) startDate: Date;
  @Prop() endDate?: Date;

  @Prop({ min: 1 }) capacity?: number;

  // Server-generated 8-char base32 join code.
  @Prop({ unique: true, sparse: true }) inviteCode?: string;

  @Prop({ type: Object, default: undefined })
  pacingOverrides?: { unlockMode?: 'hybrid' | 'progress-only' | 'day-only' };

  @Prop({ enum: ['scheduled', 'active', 'completed', 'archived'], default: 'scheduled' })
  status: 'scheduled' | 'active' | 'completed' | 'archived';
}

export type CohortDocument = HydratedDocument<Cohort>;
export const CohortSchema = SchemaFactory.createForClass(Cohort);
CohortSchema.index({ trackId: 1, status: 1 });
