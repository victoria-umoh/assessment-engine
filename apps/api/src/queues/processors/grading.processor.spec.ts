import { Job } from 'bullmq';
import { GradingProcessor } from './grading.processor';

describe('GradingProcessor', () => {
  it('delegates jobs to GradingService.gradeSubmission', async () => {
    const grading = { gradeSubmission: jest.fn(), markError: jest.fn() };
    const processor = new GradingProcessor(grading as never);
    await processor.process({ data: { submissionId: 'sub-1' } } as Job<{ submissionId: string }>);
    expect(grading.gradeSubmission).toHaveBeenCalledWith('sub-1');
  });

  it('marks the submission error only when retries are exhausted', async () => {
    const grading = { gradeSubmission: jest.fn(), markError: jest.fn() };
    const processor = new GradingProcessor(grading as never);
    const job = (attemptsMade: number) =>
      ({ data: { submissionId: 'sub-2' }, attemptsMade, opts: { attempts: 3 } }) as Job<{
        submissionId: string;
      }>;
    await processor.onFailed(job(1)); // retries remain
    expect(grading.markError).not.toHaveBeenCalled();
    await processor.onFailed(job(3)); // final attempt failed
    expect(grading.markError).toHaveBeenCalledWith('sub-2');
  });

  it('is registered in WorkerModule (and only there — the API must not consume queues)', async () => {
    // ConfigModule.forRoot validates process.env at import time (see
    // app.factory) — set env before dynamically importing the modules.
    process.env.MONGO_URI = 'mongodb://localhost:27017/unused';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars';
    process.env.JUDGE0_URL = 'http://localhost:2358';
    const { WorkerModule } = await import('../../worker.module');
    const { AppModule } = await import('../../app.module');
    const workerProviders: unknown[] = Reflect.getMetadata('providers', WorkerModule) ?? [];
    const apiProviders: unknown[] = Reflect.getMetadata('providers', AppModule) ?? [];
    expect(workerProviders).toContain(GradingProcessor);
    expect(apiProviders).not.toContain(GradingProcessor);
  });
});
