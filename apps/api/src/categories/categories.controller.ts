import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { createCategorySchema, Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CategoriesService } from './categories.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get('categories')
  @UseGuards(JwtAuthGuard)
  list() {
    return this.categories.listActive();
  }

  @Post('admin/categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  create(@Body() body: unknown) {
    return this.categories.create(parse(createCategorySchema, body));
  }

  @Delete('admin/categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  archive(@Param('id') id: string) {
    return this.categories.archive(id);
  }
}
