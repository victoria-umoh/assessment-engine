import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { QuestionsModule } from '../questions/questions.module';
import { QuizzesModule } from '../quizzes/quizzes.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { TracksModule } from '../tracks/tracks.module';
import { AssessmentResult, AssessmentResultSchema } from './assessment-result.schema';
import { AssessmentsController } from './assessments.controller';
import { FinalizationService } from './finalization.service';

@Module({
  imports: [
    CacheModule,
    MongooseModule.forFeature([
      { name: AssessmentResult.name, schema: AssessmentResultSchema },
    ]),
    EnrollmentsModule,
    TracksModule,
    QuizzesModule,
    SubmissionsModule,
    QuestionsModule,
    CategoriesModule,
  ],
  controllers: [AssessmentsController],
  providers: [FinalizationService],
  exports: [FinalizationService, MongooseModule],
})
export class AssessmentsModule {}
