import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createLessonSchema, updateLessonSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { toCandidateLessonView } from './lesson.views';
import { LessonsService } from './lessons.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class LessonsController {
  constructor(private lessons: LessonsService) {}

  @Post('admin/lessons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  create(@Body() body: unknown) {
    return this.lessons.create(parse(createLessonSchema, body));
  }

  @Get('admin/lessons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      status: z.enum(['active', 'archived']).optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.lessons.list(parse(listQuery, query));
  }

  @Patch('admin/lessons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.lessons.update(id, parse(updateLessonSchema, body));
  }

  @Delete('admin/lessons/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  archive(@Param('id') id: string) {
    return this.lessons.archive(id);
  }

  @Get('lessons/:id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.lessons.candidateView(id);
  }
}
