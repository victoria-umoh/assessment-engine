import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { QuestionsModule } from '../questions/questions.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { TracksModule } from '../tracks/tracks.module';
import { UsersModule } from '../users/users.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    CacheModule,
    UsersModule,
    TracksModule,
    CohortsModule,
    EnrollmentsModule,
    QuizzesModule,
    SubmissionsModule,
    AssessmentsModule,
    QuestionsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
