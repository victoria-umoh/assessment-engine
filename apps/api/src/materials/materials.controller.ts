import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, updateMaterialSchema } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { toAdminMaterialListRow, toAdminMaterialView, toCandidateMaterialView } from './material.views';
import { MaterialsService, UploadedFileLike } from './materials.service';

@Controller()
export class MaterialsController {
  constructor(private materials: MaterialsService) {}

  @Post('admin/materials/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileLike | undefined, @Body('title') title: string) {
    return this.materials.upload(file, title);
  }

  @Post('admin/materials/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  generate(@Body() body: unknown) {
    const schema = z.object({
      topic: z.string().min(1),
      numQuestions: z.number().int().min(1).max(20).default(5),
      categoryId: z.string().min(1),
    });
    const r = schema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.materials.generateMaterial(r.data);
  }

  @Get('admin/materials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      status: z.enum(['processing', 'ready', 'failed']).optional(),
      archived: z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    const r = listQuery.safeParse(query);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    const page = await this.materials.listAdmin(r.data);
    return { items: page.items.map(toAdminMaterialListRow), nextCursor: page.nextCursor };
  }

  @Get('admin/materials/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async findOneAdmin(@Param('id') id: string) {
    return toAdminMaterialView((await this.materials.findById(id)).toObject());
  }

  @Patch('admin/materials/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async update(@Param('id') id: string, @Body() body: unknown) {
    const r = updateMaterialSchema.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return toAdminMaterialView((await this.materials.update(id, r.data)).toObject());
  }

  @Delete('admin/materials/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  async archive(@Param('id') id: string) {
    return toAdminMaterialView((await this.materials.archive(id)).toObject());
  }

  @Get('materials/:id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return toCandidateMaterialView(await this.materials.findReadyById(id));
  }
}
