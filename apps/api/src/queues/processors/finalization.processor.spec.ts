import { Job } from 'bullmq';
import { FinalizationProcessor } from './finalization.processor';

describe('FinalizationProcessor', () => {
  it('delegates jobs to FinalizationService.finalize', async () => {
    const finalization = { finalize: jest.fn() };
    const processor = new FinalizationProcessor(finalization as never);
    await processor.process({ data: { enrollmentId: 'enr-1' } } as Job<{ enrollmentId: string }>);
    expect(finalization.finalize).toHaveBeenCalledWith('enr-1');
  });

  it('is registered in WorkerModule', async () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/unused';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars';
    process.env.JUDGE0_URL = 'http://localhost:2358';
    const { WorkerModule } = await import('../../worker.module');
    const providers: unknown[] = Reflect.getMetadata('providers', WorkerModule) ?? [];
    expect(providers).toContain(FinalizationProcessor);
  });
});
