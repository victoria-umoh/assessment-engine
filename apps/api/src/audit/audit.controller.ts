import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@lms/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      entity: z.string().optional(),
      actorId: z.string().optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    const r = listQuery.safeParse(query);
    if (!r.success) throw new BadRequestException(r.error.flatten());
    return this.audit.list(r.data);
  }
}
