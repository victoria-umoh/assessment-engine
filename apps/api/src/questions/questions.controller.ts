import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createQuestionSchema, updateQuestionSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { QuestionsService } from './questions.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller('admin/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class QuestionsController {
  constructor(private questions: QuestionsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.questions.create(parse(createQuestionSchema, body));
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      categoryId: z.string().optional(),
      difficulty: z.coerce.number().int().min(1).max(5).optional(),
      type: z.enum(['mcq', 'multi', 'text', 'likert']).optional(),
      status: z.enum(['active', 'archived']).optional(),
      materialId: z.string().optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.questions.list(parse(listQuery, query));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questions.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.questions.update(id, parse(updateQuestionSchema, body));
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.questions.archive(id);
  }
}
