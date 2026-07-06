import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createCodingProblemSchema, updateCodingProblemSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProblemLike, toCandidateProblemView } from './coding.views';
import { CodingService } from './coding.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class CodingController {
  constructor(private coding: CodingService) {}

  @Post('admin/coding-problems')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  create(@Body() body: unknown) {
    return this.coding.create(parse(createCodingProblemSchema, body));
  }

  @Get('admin/coding-problems')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      status: z.enum(['active', 'archived']).optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.coding.list(parse(listQuery, query));
  }

  @Get('admin/coding-problems/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  findOneAdmin(@Param('id') id: string) {
    return this.coding.findById(id);
  }

  @Patch('admin/coding-problems/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.coding.update(id, parse(updateCodingProblemSchema, body));
  }

  @Delete('admin/coding-problems/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  archive(@Param('id') id: string) {
    return this.coding.archive(id);
  }

  @Get('coding-problems/:id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    const problem = await this.coding.findActiveById(id);
    return toCandidateProblemView({
      ...problem.toObject(),
      id: problem.id,
    } as unknown as ProblemLike);
  }
}
