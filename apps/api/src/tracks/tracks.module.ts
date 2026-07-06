import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '../cache/cache.module';
import { CodingModule } from '../coding/coding.module';
import { LessonsModule } from '../lessons/lessons.module';
import { MaterialsModule } from '../materials/materials.module';
import { Track, TrackSchema } from './track.schema';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Track.name, schema: TrackSchema }]),
    LessonsModule,
    MaterialsModule,
    CodingModule,
    CacheModule,
  ],
  controllers: [TracksController],
  providers: [TracksService],
  exports: [TracksService, MongooseModule],
})
export class TracksModule {}
