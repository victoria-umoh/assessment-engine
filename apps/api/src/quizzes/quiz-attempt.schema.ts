import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class AttemptQuestion {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) questionId: Types.ObjectId;

  @Prop({ required: true }) presentedOrder: number;

  // Permutation of canonical option indices; presented[i] = options[order[i]].
  // Never serialized to candidates (quiz.views.ts).
  @Prop({ type: [Number], default: undefined }) shuffledOptionOrder?: number[];

  @Prop({ type: SchemaTypes.Mixed, default: undefined }) answer?: unknown;

  @Prop() correct?: boolean;
}
const AttemptQuestionSchema = SchemaFactory.createForClass(AttemptQuestion);

@Schema({ timestamps: true })
export class QuizAttempt {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) enrollmentId: Types.ObjectId;

  // Track day item id, or the reserved 'final-quiz' for the capstone.
  @Prop({ required: true }) quizItemId: string;

  // Set for reading items — the comprehension pool source.
  @Prop({ type: SchemaTypes.ObjectId, default: undefined }) materialId?: Types.ObjectId;

  @Prop({ type: [AttemptQuestionSchema], default: [] }) questions: AttemptQuestion[];

  @Prop() score?: number;

  // Normalized 0–100 per trait dimension; present only when likert items graded.
  @Prop({ type: Object, default: undefined }) traitScores?: Record<string, number>;

  @Prop({ enum: ['in-progress', 'submitted', 'expired'], default: 'in-progress' })
  status: 'in-progress' | 'submitted' | 'expired';

  @Prop({ required: true }) startedAt: Date;
  @Prop() submittedAt?: Date;
  @Prop({ required: true }) timeLimitSec: number;
}

export type QuizAttemptDocument = HydratedDocument<QuizAttempt>;
export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);
QuizAttemptSchema.index({ enrollmentId: 1, quizItemId: 1 });
// Single-in-progress invariant: concurrent starts race the find-then-create;
// the unique partial index makes the database the arbiter (loser resumes).
QuizAttemptSchema.index(
  { enrollmentId: 1, quizItemId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in-progress' } },
);
