import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class TrackItem {
  // Server-generated stable key for enrollment itemProgress.
  @Prop({ required: true }) itemId: string;

  @Prop({ required: true, enum: ['lesson', 'reading', 'quiz', 'coding', 'exercise'] })
  type: 'lesson' | 'reading' | 'quiz' | 'coding' | 'exercise';

  // Resolved per item type (lesson/material/coding problem), so a plain string
  // rather than a single-collection ObjectId ref. Existence checked at publish.
  @Prop() refId?: string;

  @Prop({ type: Object, default: {} }) config: Record<string, unknown>;
}
const TrackItemSchema = SchemaFactory.createForClass(TrackItem);

@Schema({ _id: false })
export class TrackDay {
  @Prop({ required: true, min: 1 }) dayNumber: number;
  @Prop({ type: [TrackItemSchema], default: [] }) items: TrackItem[];
}
const TrackDaySchema = SchemaFactory.createForClass(TrackDay);

@Schema({ _id: false })
export class TrackScoring {
  @Prop({ type: Object, required: true })
  weights: { quiz: number; coding: number; exercise: number; reading: number; finalAssessment: number };

  @Prop({ required: true }) passThreshold: number;

  @Prop({ type: Object, default: undefined })
  categoryMinimums?: Record<string, number>;
}
const TrackScoringSchema = SchemaFactory.createForClass(TrackScoring);

@Schema({ timestamps: true })
export class Track {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true, min: 1 }) durationDays: number;

  @Prop({ type: [TrackDaySchema], default: [] }) days: TrackDay[];

  @Prop({ type: TrackScoringSchema, required: true }) scoring: TrackScoring;

  @Prop({ type: Object, default: undefined })
  finalAssessment?: { quizConfig?: Record<string, unknown>; codingProblemIds?: string[] };

  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft', index: true })
  status: 'draft' | 'published' | 'archived';
}

export type TrackDocument = HydratedDocument<Track>;
export const TrackSchema = SchemaFactory.createForClass(Track);
