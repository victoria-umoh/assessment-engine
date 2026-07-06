import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('admin/analytics/overview')
  overview() {
    return this.analytics.overview();
  }

  @Get('admin/cohorts/:id/dashboard')
  cohortDashboard(@Param('id') id: string) {
    return this.analytics.cohortDashboard(id);
  }

  @Get('admin/enrollments/:id/detail')
  enrollmentDetail(@Param('id') id: string) {
    return this.analytics.enrollmentDetail(id);
  }

  @Get('admin/analytics/questions')
  questionStats(@Query() query: Record<string, string>) {
    const schema = z.object({
      categoryId: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    const r = schema.safeParse(query);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.analytics.questionStats(r.data);
  }
}
