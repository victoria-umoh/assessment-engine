import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GradingService } from '../../submissions/grading.service';
import { SUBMISSION_GRADING } from '../queue.names';

// Thin BullMQ wrapper — all grading logic lives in GradingService (which the
// e2e suites drive inline). Registered only in WorkerModule, never in the API.
@Processor(SUBMISSION_GRADING)
export class GradingProcessor extends WorkerHost {
  constructor(private grading: GradingService) {
    super();
  }

  async process(job: Job<{ submissionId: string }>): Promise<void> {
    await this.grading.gradeSubmission(job.data.submissionId);
  }

  // Spec §5/§8: after N retries the submission is marked error and the
  // attempt is not consumed.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ submissionId: string }> | undefined): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return; // retries remain
    new Logger(GradingProcessor.name).error(`Grading job ${job.id} exhausted retries`);
    await this.grading.markError(job.data.submissionId);
  }
}
