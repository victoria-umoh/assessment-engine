import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuestionsModule } from '../questions/questions.module';
import { MaterialGenerator } from './material-generator';
import { Material, MaterialSchema } from './material.schema';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Material.name, schema: MaterialSchema }]),
    QuestionsModule,
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialGenerator],
  exports: [MaterialsService, MongooseModule],
})
export class MaterialsModule {}
