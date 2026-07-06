import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { UsersService } from '../src/users/users.service';

describe('App bootstrap', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('GET /health returns ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('wires Mongo and provides UsersService via AppModule', async () => {
    const users = ctx.app.get(UsersService);
    const created = await users.create({ email: 'boot@check.co', password: 'password123', name: 'Boot' });
    expect(created.id).toBeDefined();
  });
});
