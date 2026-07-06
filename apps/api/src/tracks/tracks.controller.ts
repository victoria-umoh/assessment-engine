import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createTrackSchema, Role, updateTrackSchema } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TracksService } from './tracks.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class TracksController {
  constructor(private tracks: TracksService) {}

  // --- candidate-facing (any authenticated user) ---

  @Get('tracks')
  @UseGuards(JwtAuthGuard)
  listPublished() {
    return this.tracks.listPublished();
  }

  @Get('tracks/:id')
  @UseGuards(JwtAuthGuard)
  findPublished(@Param('id') id: string) {
    return this.tracks.findPublishedById(id);
  }

  // --- admin ---

  @Post('admin/tracks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  create(@Body() body: unknown) {
    return this.tracks.create(parse(createTrackSchema, body));
  }

  @Get('admin/tracks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      status: z.enum(['draft', 'published', 'archived']).optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.tracks.list(parse(listQuery, query));
  }

  @Get('admin/tracks/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  findOne(@Param('id') id: string) {
    return this.tracks.findById(id);
  }

  @Patch('admin/tracks/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.tracks.update(id, parse(updateTrackSchema, body));
  }

  @Post('admin/tracks/:id/publish')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  publish(@Param('id') id: string) {
    return this.tracks.publish(id);
  }

  @Delete('admin/tracks/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  archive(@Param('id') id: string) {
    return this.tracks.archive(id);
  }
}
