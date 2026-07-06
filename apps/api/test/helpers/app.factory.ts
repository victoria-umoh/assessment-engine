import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestAppOptions {
  overrides?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<{ app: INestApplication; stop: () => Promise<void> }> {
  // 30s launch timeout: parallel suites each boot a mongod; the 10s default
  // flakes on loaded machines. Retry: the free-port probe races under parallel
  // boots ('Port NNN already in use' — the P3–P6 suite-level boot flake).
  let mongod: MongoMemoryServer | undefined;
  for (let attempt = 1; !mongod; attempt++) {
    try {
      mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 30000 } });
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`[createTestApp] mongod boot attempt ${attempt} failed, retrying:`, err);
    }
  }
  process.env.NODE_ENV = 'test';
  // Parallel suites + ts-jest cold compile can push the first connect past the
  // driver's 10s defaults (P3–P6 intermittent ETIMEDOUT flake) — give it 30s.
  const uri = mongod.getUri();
  process.env.MONGO_URI = `${uri}${uri.includes('?') ? '&' : '?'}connectTimeoutMS=30000&serverSelectionTimeoutMS=30000`;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-16chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16chars';
  process.env.JUDGE0_URL = 'http://localhost:2358';
  // auth.helper logs in once per minted user — the production-default 10/min
  // throttle would trip mid-suite. Suites that test throttling set their own
  // value BEFORE calling createTestApp (??= keeps it).
  process.env.THROTTLE_LIMIT ??= '10000';

  try {
    // Env must be set BEFORE AppModule is imported: ConfigModule.forRoot
    // validates process.env at import time, not at module init.
    const { AppModule } = await import('../../src/app.module');

    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (options.overrides) builder = options.overrides(builder);
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return {
      app,
      stop: async () => {
        await app.close();
        await mongod.stop();
      },
    };
  } catch (err) {
    // Boot failed after mongod started: stop it or jest hangs on the open handle.
    // Log loudly — jest renders beforeAll failures from here as blank blocks.
    console.error('[createTestApp] boot failure:', err);
    await mongod.stop();
    throw err;
  }
}
