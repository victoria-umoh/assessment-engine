import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class LessonBlock {
  @Prop({ required: true, enum: ['markdown', 'video', 'image'] })
  type: 'markdown' | 'video' | 'image';

  @Prop() markdown?: string;
  @Prop() url?: string;
  @Prop() caption?: string;
}
const LessonBlockSchema = SchemaFactory.createForClass(LessonBlock);

@Schema({ timestamps: true })
export class Lesson {
  @Prop({ required: true })
  title: string;

  @Prop({ type: [LessonBlockSchema], required: true })
  contentBlocks: LessonBlock[];

  @Prop({ required: true, min: 1 })
  estMinutes: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';
}

export type LessonDocument = HydratedDocument<Lesson>;
export const LessonSchema = SchemaFactory.createForClass(Lesson);
