import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AssessmentResult {
  @Prop({ type: SchemaTypes.ObjectId, required: true, unique: true })
  enrollmentId: Types.ObjectId;

  @Prop({ type: Object, required: true }) breakdown: Record<string, number>;

  @Prop({ type: Object, default: undefined })
  personalityProfile?: Record<string, number>;

  @Prop({ type: Object, required: true }) typeScores: Record<string, number>;

  @Prop({ required: true }) weightedTotal: number;

  @Prop({ required: true, enum: ['pass', 'fail'] }) verdict: 'pass' | 'fail';

  @Prop({ type: [String], default: [] }) failedMinimums: string[];

  @Prop({ required: true }) generatedAt: Date;
}

export type AssessmentResultDocument = HydratedDocument<AssessmentResult>;
export const AssessmentResultSchema = SchemaFactory.createForClass(AssessmentResult);
