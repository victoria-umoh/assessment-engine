import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createSubmissionSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SubmissionsService } from './submissions.service';

const listQuery = z.object({
  enrollmentId: z.string().optional(),
  problemId: z.string().optional(),
  after: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller()
export class SubmissionsController {
  constructor(private submissions: SubmissionsService) {}

  @Post('submissions')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  create(@Req() req: { user: AuthUser }, @Body() body: unknown) {
    return this.submissions.create(req.user, parse(createSubmissionSchema, body));
  }

  @Get('submissions/:id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.submissions.findByIdFor(req.user, id);
  }

  @Get('enrollments/:id/submissions')
  @UseGuards(JwtAuthGuard)
  listForEnrollment(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.submissions.listForEnrollment(req.user, id, parse(listQuery, query));
  }

  @Get('admin/submissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  list(@Query() query: Record<string, string>) {
    return this.submissions.list(parse(listQuery, query));
  }
}
