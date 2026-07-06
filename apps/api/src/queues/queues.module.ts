import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { ASSESSMENT_FINALIZATION, SUBMISSION_GRADING } from './queue.names';
import { QueuesService } from './queues.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL')!);
        // A connection we OWN so it carries an 'error' listener. bullmq's
        // internal RedisConnection re-emits ioredis close/errors; without a
        // listener Node escalates them to an unhandled exception (a Redis blip
        // must never crash the API — in tests it kills the jest worker on
        // teardown). ioredis is pinned to bullmq's exact version so this
        // single instance is type- and instanceof-compatible.
        const connection = new IORedis({
          host: url.hostname,
          port: Number(url.port || 6379),
          // Lazy: producers only connect on first add(). e2e suites stub
          // QueuesService, so app boots (and closes) without Redis.
          lazyConnect: true,
          maxRetriesPerRequest: null,
        });
        connection.on('error', () => undefined);
        return { connection };
      },
    }),
    BullModule.registerQueue({ name: SUBMISSION_GRADING }, { name: ASSESSMENT_FINALIZATION }),
  ],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
