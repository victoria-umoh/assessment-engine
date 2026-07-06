import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ASSESSMENT_FINALIZATION, SUBMISSION_GRADING } from './queue.names';

// Failed jobs are retained (removeOnFail: false) as the dead-letter surface
// per spec §8; alerting on them is a Phase 7 rider.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: false,
} as const;

@Injectable()
export class QueuesService implements OnModuleDestroy {
  constructor(
    @InjectQueue(SUBMISSION_GRADING) private gradingQueue: Queue,
    @InjectQueue(ASSESSMENT_FINALIZATION) private finalizationQueue: Queue,
  ) {
    // bullmq Queues are EventEmitters — an 'error' event with no listener
    // (a Redis close/blip) is escalated by Node to an unhandled exception that
    // crashes the process. A Redis hiccup must never take down the API; in
    // tests it otherwise kills the jest worker on teardown.
    this.gradingQueue.on('error', () => undefined);
    this.finalizationQueue.on('error', () => undefined);
  }

  // Close cleanly on shutdown so the connection doesn't emit mid-command.
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.gradingQueue.close(), this.finalizationQueue.close()]);
  }

  async enqueueGrading(submissionId: string): Promise<void> {
    await this.gradingQueue.add('grade', { submissionId }, { ...JOB_OPTIONS, jobId: submissionId });
  }

  // No jobId here: a retained completed/failed job with jobId = enrollmentId
  // makes BullMQ silently drop every later trigger (capstone verdicts would
  // never be written). finalize() is idempotent, so duplicate jobs are safe.
  async enqueueFinalization(enrollmentId: string): Promise<void> {
    await this.finalizationQueue.add('finalize', { enrollmentId }, { ...JOB_OPTIONS });
  }
}
