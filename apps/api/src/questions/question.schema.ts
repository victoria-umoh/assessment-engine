import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class QuestionMedia {
  @Prop({ required: true, enum: ['svg', 'imageUrl'] }) kind: 'svg' | 'imageUrl';
  @Prop({ required: true }) value: string;
}
const QuestionMediaSchema = SchemaFactory.createForClass(QuestionMedia);

@Schema({ _id: false })
export class TraitMapping {
  @Prop({ required: true }) dimension: string;
  @Prop({ required: true, enum: [1, -1] }) direction: 1 | -1;
}
const TraitMappingSchema = SchemaFactory.createForClass(TraitMapping);

@Schema({ timestamps: true })
export class Question {
  @Prop({ required: true, enum: ['mcq', 'multi', 'text', 'likert'] })
  type: 'mcq' | 'multi' | 'text' | 'likert';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  difficulty: number;

  @Prop({ required: true })
  prompt: string;

  @Prop({ type: [QuestionMediaSchema], default: undefined })
  media?: QuestionMedia[];

  @Prop({ type: [String], default: undefined })
  options?: string[];

  // mcq/multi: option indexes; text: acceptable answers. Never serialized to candidates.
  @Prop({ type: [{}], default: undefined })
  correct?: number[] | string[];

  @Prop({ type: TraitMappingSchema, default: undefined })
  traitMapping?: TraitMapping;

  @Prop()
  explanation?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Material', default: undefined })
  materialId?: Types.ObjectId;

  @Prop({ required: true, enum: ['seed', 'admin', 'generated'], default: 'admin' })
  source: 'seed' | 'admin' | 'generated';

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';

  @Prop({ unique: true, sparse: true })
  seedId?: string;
}

export type QuestionDocument = HydratedDocument<Question>;
export const QuestionSchema = SchemaFactory.createForClass(Question);
QuestionSchema.index({ categoryId: 1, difficulty: 1, status: 1 });
