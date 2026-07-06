import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AssessmentsModule } from './assessments/assessments.module';
import { validateEnv } from './config/env';
import { FinalizationProcessor } from './queues/processors/finalization.processor';
import { GradingProcessor } from './queues/processors/grading.processor';
import { QueuesModule } from './queues/queues.module';
import { SubmissionsModule } from './submissions/submissions.module';

// BullMQ consumer host — booted by worker.main.ts as a standalone application
// context (no HTTP). Processors register here (Tasks 4/6), never in AppModule,
// so the API process never consumes queues.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // SubmissionsModule's controller references ThrottlerGuard — the guard's
    // options must resolve in THIS module graph too (worker.module.spec pin).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: config.get<number>('THROTTLE_TTL_MS')!, limit: config.get<number>('THROTTLE_LIMIT')! },
      ],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('MONGO_URI') }),
    }),
    QueuesModule,
    SubmissionsModule,
    AssessmentsModule,
  ],
  providers: [GradingProcessor, FinalizationProcessor],
})
export class WorkerModule {}
