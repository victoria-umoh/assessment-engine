import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class TestCase {
  @Prop({ required: true }) input: string;
  @Prop({ required: true }) expectedOutput: string;
  @Prop({ default: false }) hidden: boolean;
  @Prop({ default: 1, min: 1 }) weight: number;
}
const TestCaseSchema = SchemaFactory.createForClass(TestCase);

@Schema({ _id: false })
export class ResourceLimits {
  @Prop({ default: 2 }) cpuTimeSec: number;
  @Prop({ default: 128000 }) memoryKb: number;
  @Prop({ default: 5 }) wallTimeSec: number;
}
const ResourceLimitsSchema = SchemaFactory.createForClass(ResourceLimits);

@Schema({ timestamps: true })
export class CodingProblem {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  statement: string;

  @Prop({ required: true, min: 1, max: 5 })
  difficulty: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ type: [String], required: true })
  languages: string[];

  @Prop({ type: Object, default: {} })
  starterCode: Record<string, string>;

  // Hidden cases and weights are never serialized to candidates (coding.views.ts).
  @Prop({ type: [TestCaseSchema], required: true })
  testCases: TestCase[];

  @Prop({ type: ResourceLimitsSchema, default: () => ({}) })
  limits: ResourceLimits;

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';
}

export type CodingProblemDocument = HydratedDocument<CodingProblem>;
export const CodingProblemSchema = SchemaFactory.createForClass(CodingProblem);
