import { Schema } from 'mongoose';
import { QuestionSchema } from '../questions/question.schema';
import { CodingProblemSchema } from '../coding/coding-problem.schema';
import { CohortSchema } from '../cohorts/cohort.schema';
import { EnrollmentSchema } from '../enrollments/enrollment.schema';
import { QuizAttemptSchema } from '../quizzes/quiz-attempt.schema';
import { AssessmentResultSchema } from '../assessments/assessment-result.schema';
import { SubmissionSchema } from '../submissions/submission.schema';
import { MaterialSchema } from '../materials/material.schema';
import { AuditLogSchema } from '../audit/audit-log.schema';

describe('ObjectId reference props', () => {
  // @Prop({ type: Types.ObjectId }) (the bson class) compiles to a Mixed path,
  // which stores strings verbatim and breaks filtering against seeded ObjectIds.
  // Every reference prop must be a real casting ObjectId path.
  it('compile to casting ObjectId paths, not Mixed', () => {
    expect(QuestionSchema.path('categoryId').instance).toBe('ObjectId');
    expect(QuestionSchema.path('materialId').instance).toBe('ObjectId');
    expect(CodingProblemSchema.path('categoryId').instance).toBe('ObjectId');
    const linked = MaterialSchema.path('linkedQuestionIds') as Schema.Types.Array;
    expect(linked.caster?.instance).toBe('ObjectId');
    expect(CohortSchema.path('trackId').instance).toBe('ObjectId');
    expect(EnrollmentSchema.path('userId').instance).toBe('ObjectId');
    expect(EnrollmentSchema.path('trackId').instance).toBe('ObjectId');
    expect(EnrollmentSchema.path('cohortId').instance).toBe('ObjectId');
    expect(QuizAttemptSchema.path('enrollmentId').instance).toBe('ObjectId');
    expect(QuizAttemptSchema.path('materialId').instance).toBe('ObjectId');
    expect(QuizAttemptSchema.path('questions.questionId').instance).toBe('ObjectId');
    expect(SubmissionSchema.path('enrollmentId').instance).toBe('ObjectId');
    expect(SubmissionSchema.path('problemId').instance).toBe('ObjectId');
    expect(AssessmentResultSchema.path('enrollmentId').instance).toBe('ObjectId');
    expect(AuditLogSchema.path('actorId').instance).toBe('ObjectId');
  });
});
