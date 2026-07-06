import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheModule } from '../cache/cache.module';
import { Lesson, LessonSchema } from './lesson.schema';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Lesson.name, schema: LessonSchema }]), CacheModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService, MongooseModule],
})
export class LessonsModule {}
