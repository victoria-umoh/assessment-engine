import { Test } from '@nestjs/testing';

describe('WorkerModule', () => {
  // The worker runs the SAME feature modules as the API (SubmissionsModule et
  // al). Anything those controllers reference (ThrottlerGuard!) must resolve
  // in the worker's module graph too — caught live by the Playwright harness
  // when the worker died on boot with a THROTTLER:MODULE_OPTIONS DI error.
  it('compiles: every controller dependency resolves without the HTTP AppModule', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/worker-module-spec';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars';
    process.env.JUDGE0_URL = 'http://localhost:2358';

    const { WorkerModule } = await import('./worker.module');
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
