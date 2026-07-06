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
  UseGuards,
} from '@nestjs/common';
import { createCohortSchema, Role, updateCohortSchema } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CohortsService } from './cohorts.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller('admin/cohorts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class CohortsController {
  constructor(private cohorts: CohortsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.cohorts.create(parse(createCohortSchema, body));
  }

  @Get()
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      trackId: z.string().optional(),
      status: z.enum(['scheduled', 'active', 'completed', 'archived']).optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.cohorts.list(parse(listQuery, query));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cohorts.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.cohorts.update(id, parse(updateCohortSchema, body));
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.cohorts.archive(id);
  }
}
