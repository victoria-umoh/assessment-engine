import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@lms/shared';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser } from './jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    // No user attached means JwtAuthGuard never ran: 401, not a misleading 403.
    if (!user) throw new UnauthorizedException();
    return required.includes(user.role);
  }
}
