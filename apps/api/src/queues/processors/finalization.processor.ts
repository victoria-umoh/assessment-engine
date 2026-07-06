import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FinalizationService } from '../../assessments/finalization.service';
import { ASSESSMENT_FINALIZATION } from '../queue.names';

// Thin BullMQ wrapper — finalize() is idempotent, so redeliveries and retries
// are safe. Registered only in WorkerModule.
@Processor(ASSESSMENT_FINALIZATION)
export class FinalizationProcessor extends WorkerHost {
  constructor(private finalization: FinalizationService) {
    super();
  }

  async process(job: Job<{ enrollmentId: string }>): Promise<void> {
    await this.finalization.finalize(job.data.enrollmentId);
  }
}
