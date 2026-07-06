import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '../cache/cache.module';
import { CohortsModule } from '../cohorts/cohorts.module';
import { QueuesModule } from '../queues/queues.module';
import { TracksModule } from '../tracks/tracks.module';
import { Enrollment, EnrollmentSchema } from './enrollment.schema';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Enrollment.name, schema: EnrollmentSchema }]),
    TracksModule,
    CohortsModule,
    QueuesModule,
    CacheModule,
  ],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService, MongooseModule],
})
export class EnrollmentsModule {}
