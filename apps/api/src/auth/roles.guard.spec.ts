import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@lms/shared';
import { RolesGuard } from './roles.guard';

function mockContext(user?: { userId: string; role: Role }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('allows access when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({ userId: 'u1', role: Role.Candidate }))).toBe(true);
  });

  it('allows a user whose role matches', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    expect(guard.canActivate(mockContext({ userId: 'u1', role: Role.Admin }))).toBe(true);
  });

  it('denies a user whose role does not match', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    expect(guard.canActivate(mockContext({ userId: 'u1', role: Role.Candidate }))).toBe(false);
  });

  it('throws Unauthorized when roles are required but no user is attached', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    // No user means JwtAuthGuard never ran: report 401, not a misleading 403.
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(UnauthorizedException);
  });
});
