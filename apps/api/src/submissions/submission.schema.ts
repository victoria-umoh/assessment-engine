import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class TestResult {
  @Prop({ required: true }) caseIndex: number;

  @Prop({ required: true, enum: ['passed', 'failed', 'error'] })
  status: 'passed' | 'failed' | 'error';

  @Prop() statusDescription?: string;
  @Prop() stdout?: string;
  @Prop() time?: number;
  @Prop() memory?: number;
}
const TestResultSchema = SchemaFactory.createForClass(TestResult);

@Schema({ timestamps: true })
export class Submission {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) enrollmentId: Types.ObjectId;

  // Track day item id; absent for capstone submissions (final: true).
  @Prop() itemId?: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true }) problemId: Types.ObjectId;

  @Prop({ default: false }) final: boolean;

  @Prop({ required: true }) language: string;
  @Prop({ required: true }) sourceCode: string;

  @Prop({
    enum: ['queued', 'running', 'passed', 'failed', 'error'],
    default: 'queued',
  })
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';

  @Prop({ type: [TestResultSchema], default: [] }) testResults: TestResult[];

  @Prop({ default: 0 }) score: number;

  @Prop({ type: [String], default: [] }) judge0Tokens: string[];
}

export type SubmissionDocument = HydratedDocument<Submission>;
export const SubmissionSchema = SchemaFactory.createForClass(Submission);
SubmissionSchema.index({ enrollmentId: 1, createdAt: 1 });
// One in-flight submission per enrollment+problem: the service pre-check is
// racy across processes; the partial unique index is the real arbiter.
SubmissionSchema.index(
  { enrollmentId: 1, problemId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['queued', 'running'] } } },
);
