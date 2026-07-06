import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true, enum: ['correctness', 'profile'] })
  scoringMode: 'correctness' | 'profile';

  @Prop({ type: [String], default: undefined })
  traitDimensions?: string[];

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
