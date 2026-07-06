import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { AssessmentsModule } from './assessments/assessments.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CodingModule } from './coding/coding.module';
import { CohortsModule } from './cohorts/cohorts.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { HealthController } from './health/health.controller';
import { LessonsModule } from './lessons/lessons.module';
import { MaterialsModule } from './materials/materials.module';
import { QuestionsModule } from './questions/questions.module';
import { QueuesModule } from './queues/queues.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { SeedModule } from './seed/seed.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { TracksModule } from './tracks/tracks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Guard is applied per-controller (auth, submissions) — not a global APP_GUARD.
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
    UsersModule,
    AuthModule,
    CategoriesModule,
    QuestionsModule,
    CodingModule,
    LessonsModule,
    MaterialsModule,
    SeedModule,
    QueuesModule,
    TracksModule,
    CohortsModule,
    EnrollmentsModule,
    QuizzesModule,
    SubmissionsModule,
    AssessmentsModule,
    AuditModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
