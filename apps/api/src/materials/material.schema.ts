import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class MaterialFile {
  @Prop({ required: true }) storageKey: string;
  @Prop({ required: true }) originalName: string;
  @Prop({ required: true }) mimeType: string;
  @Prop({ required: true }) size: number;
}
const MaterialFileSchema = SchemaFactory.createForClass(MaterialFile);

@Schema({ _id: false })
export class GenerationMeta {
  @Prop({ required: true }) prompt: string;
  @Prop({ required: true }) model: string;
  @Prop({ required: true }) generatedAt: Date;
}
const GenerationMetaSchema = SchemaFactory.createForClass(GenerationMeta);

@Schema({ timestamps: true })
export class Material {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: ['upload', 'generated', 'authored'] })
  source: 'upload' | 'generated' | 'authored';

  @Prop({ type: MaterialFileSchema, default: undefined })
  file?: MaterialFile;

  @Prop()
  content?: string;

  @Prop()
  extractedText?: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Question', default: [] })
  linkedQuestionIds: Types.ObjectId[];

  @Prop({ type: GenerationMetaSchema, default: undefined })
  generationMeta?: GenerationMeta;

  @Prop({ required: true, enum: ['processing', 'ready', 'failed'], default: 'processing', index: true })
  status: 'processing' | 'ready' | 'failed';

  @Prop()
  failureReason?: string;

  @Prop({ default: false })
  archived: boolean;
}

export type MaterialDocument = HydratedDocument<Material>;
export const MaterialSchema = SchemaFactory.createForClass(Material);
