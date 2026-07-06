import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '../cache/cache.module';
import { TracksModule } from '../tracks/tracks.module';
import { Cohort, CohortSchema } from './cohort.schema';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cohort.name, schema: CohortSchema }]),
    TracksModule,
    CacheModule,
  ],
  controllers: [CohortsController],
  providers: [CohortsService],
  exports: [CohortsService, MongooseModule],
})
export class CohortsModule {}
