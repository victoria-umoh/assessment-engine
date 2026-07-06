import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { enrollSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EnrollmentsService } from './enrollments.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class EnrollmentsController {
  constructor(private enrollments: EnrollmentsService) {}

  @Post('enrollments')
  @UseGuards(JwtAuthGuard)
  enroll(@Req() req: { user: AuthUser }, @Body() body: unknown) {
    return this.enrollments.enroll(req.user.userId, parse(enrollSchema, body));
  }

  @Get('enrollments/me')
  @UseGuards(JwtAuthGuard)
  findOwn(@Req() req: { user: AuthUser }) {
    return this.enrollments.findOwn(req.user.userId);
  }

  @Get('enrollments/:id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.enrollments.findByIdFor(req.user, id);
  }

  @Get('enrollments/:id/unlock-state')
  @UseGuards(JwtAuthGuard)
  unlockState(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.enrollments.getUnlockState(req.user, id);
  }

  @Post('enrollments/:id/items/:itemId/complete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  completeItem(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.enrollments.completeItem(req.user, id, itemId);
  }

  @Get('admin/enrollments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      cohortId: z.string().optional(),
      trackId: z.string().optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    return this.enrollments.list(parse(listQuery, query));
  }
}
