import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { QuestionsModule } from '../questions/questions.module';
import { QueuesModule } from '../queues/queues.module';
import { QuizAttempt, QuizAttemptSchema } from './quiz-attempt.schema';
import { QuizSampler } from './quiz.sampler';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: QuizAttempt.name, schema: QuizAttemptSchema }]),
    QuestionsModule,
    EnrollmentsModule,
    QueuesModule,
  ],
  controllers: [QuizzesController],
  providers: [QuizzesService, QuizSampler],
  exports: [QuizzesService, MongooseModule],
})
export class QuizzesModule {}
