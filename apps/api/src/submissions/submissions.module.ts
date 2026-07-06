import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CodingModule } from '../coding/coding.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { QueuesModule } from '../queues/queues.module';
import { GradingService } from './grading.service';
import { Judge0Client } from './judge0.client';
import { Submission, SubmissionSchema } from './submission.schema';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Submission.name, schema: SubmissionSchema }]),
    CodingModule,
    EnrollmentsModule,
    QueuesModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, GradingService, Judge0Client],
  exports: [SubmissionsService, GradingService, MongooseModule],
})
export class SubmissionsModule {}
