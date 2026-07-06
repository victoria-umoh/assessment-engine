import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { CodingProblem, CodingProblemSchema } from './coding-problem.schema';
import { CodingController } from './coding.controller';
import { CodingService } from './coding.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CodingProblem.name, schema: CodingProblemSchema }]),
    CategoriesModule,
  ],
  controllers: [CodingController],
  providers: [CodingService],
  exports: [CodingService, MongooseModule],
})
export class CodingModule {}
