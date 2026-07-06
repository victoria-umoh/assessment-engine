import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JUDGE0_LANGUAGE_IDS } from '@lms/shared';
import { CodingProblem } from '../coding/coding-problem.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { QueuesService } from '../queues/queues.service';
import { computeWeightedScore, mapCaseResult } from './judge0.mapper';
import { Judge0Client } from './judge0.client';
import { Submission } from './submission.schema';

// Does the actual grading work. The worker's BullMQ processor is a thin
// wrapper around gradeSubmission; e2e suites call it inline with a stubbed
// Judge0Client. Idempotent: settled submissions are never re-graded.
@Injectable()
export class GradingService {
  private logger = new Logger(GradingService.name);

  constructor(
    @InjectModel(Submission.name) private submissionModel: Model<Submission>,
    @InjectModel(CodingProblem.name) private problemModel: Model<CodingProblem>,
    private judge0: Judge0Client,
    private enrollments: EnrollmentsService,
    private queues: QueuesService,
  ) {}

  async gradeSubmission(submissionId: string): Promise<void> {
    const submission = await this.submissionModel.findById(submissionId);
    if (!submission) return;
    if (submission.status === 'passed' || submission.status === 'failed') return; // idempotent

    const problem = await this.problemModel.findById(submission.problemId).lean();
    // No problem or no cases (DB drift — schema blocks both at the API edge):
    // fail closed as 'error', never a vacuous 'passed'. Attempt not consumed.
    if (!problem || problem.testCases.length === 0) {
      await this.submissionModel.updateOne({ _id: submission._id }, { status: 'error' });
      return;
    }

    submission.status = 'running';
    await submission.save();

    // Persist tokens before polling: a retry (poll timeout, crash) reuses the
    // already-created batch instead of re-executing every case.
    let tokens = submission.judge0Tokens?.length ? submission.judge0Tokens : undefined;
    if (!tokens) {
      tokens = await this.judge0.createBatch(
        problem.testCases.map((tc) => ({
          languageId: JUDGE0_LANGUAGE_IDS[submission.language],
          sourceCode: submission.sourceCode,
          stdin: tc.input,
          expectedOutput: tc.expectedOutput,
          cpuTimeLimit: problem.limits?.cpuTimeSec,
          memoryLimit: problem.limits?.memoryKb,
          wallTimeLimit: problem.limits?.wallTimeSec,
        })),
      );
      submission.judge0Tokens = tokens;
      await submission.save();
    }
    const results = await this.judge0.getBatch(tokens);

    const cases = results.map((r, caseIndex) => ({ caseIndex, ...mapCaseResult(r) }));
    if (cases.some((c) => c.status === 'error')) {
      throw new Error('Judge0 returned a non-terminal case status'); // job retries
    }
    const score = computeWeightedScore(
      cases.map((c, i) => ({ passed: c.status === 'passed', weight: problem.testCases[i].weight })),
    );

    submission.judge0Tokens = tokens;
    submission.testResults = cases;
    submission.score = score;
    submission.status = cases.every((c) => c.status === 'passed') ? 'passed' : 'failed';
    await submission.save();

    // Capstone submissions aren't day items; finalization reads them directly.
    if (!submission.final && submission.itemId) {
      await this.enrollments.recordItemResult(
        String(submission.enrollmentId),
        submission.itemId,
        score,
      );
    } else if (submission.final) {
      // Capstone part settled — finalization checks overall completeness.
      await this.queues.enqueueFinalization(String(submission.enrollmentId));
    }
  }

  // Called when the grading job exhausts its retries. The attempt is NOT
  // consumed: itemProgress is untouched (spec §5/§8).
  async markError(submissionId: string): Promise<void> {
    this.logger.warn(`Marking submission ${submissionId} as error after failed grading`);
    await this.submissionModel.updateOne(
      { _id: submissionId, status: { $in: ['queued', 'running'] } },
      { status: 'error' },
    );
  }
}
