import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Role } from '@lms/shared';
import { UsersService } from '../../src/users/users.service';

let counter = 0;

export async function authHeader(
  ctx: { app: INestApplication },
  role: Role,
): Promise<{ Authorization: string }> {
  const email = `${role}-${Date.now()}-${counter++}@test.local`;
  const password = 'password123';
  await ctx.app.get(UsersService).create({ email, password, name: `${role} user`, role });
  const res = await request(ctx.app.getHttpServer()).post('/auth/login').send({ email, password });
  return { Authorization: `Bearer ${res.body.accessToken}` };
}
