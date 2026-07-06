import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createUserSchema, updateUserSchema, Role } from '@lms/shared';
import { z } from 'zod';
import { AuthUser } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { toAdminUserView } from './user.views';
import { UsersService } from './users.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException(r.error.flatten());
  return r.data;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class UsersController {
  constructor(private users: UsersService) {}

  @Post()
  async create(@Body() body: unknown) {
    return toAdminUserView(await this.users.create(parse(createUserSchema, body)));
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return toAdminUserView(
      await this.users.adminUpdate(req.user.userId, id, parse(updateUserSchema, body)),
    );
  }

  @Get()
  async list(@Query() query: Record<string, string>) {
    const listQuery = z.object({
      role: z.enum(['admin', 'candidate']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
      q: z.string().max(100).optional(),
      after: z.string().optional(),
      limit: z.coerce.number().int().optional(),
    });
    const page = await this.users.listAdmin(parse(listQuery, query));
    return { items: page.items.map(toAdminUserView), nextCursor: page.nextCursor };
  }
}
