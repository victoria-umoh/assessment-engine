import request from 'supertest';
import { createTestApp } from './helpers/app.factory';

describe('Auth', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const creds = { email: 'ada@example.com', password: 'password123', name: 'Ada' };

  it('registers and returns user + token pair', async () => {
    const res = await request(ctx.app.getHttpServer()).post('/auth/register').send(creds).expect(201);
    expect(res.body.user).toMatchObject({ email: 'ada@example.com', name: 'Ada', role: 'candidate' });
    expect(res.body.user.id).toBeDefined();
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.refreshToken.split('.')).toHaveLength(3);
  });

  it('rejects invalid register payloads with 400', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' })
      .expect(400);
  });

  it('rejects duplicate registration with 409', async () => {
    await request(ctx.app.getHttpServer()).post('/auth/register').send(creds).expect(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: creds.email, password: creds.password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('401s on wrong password', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: creds.email, password: 'wrong-password' })
      .expect(401);
  });

  describe('refresh + guards', () => {
    let tokens: { accessToken: string; refreshToken: string };

    beforeAll(async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: creds.email, password: creds.password });
      tokens = res.body;
    });

    it('GET /auth/me returns the user with a valid access token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(res.body.email).toBe('ada@example.com');
    });

    it('GET /auth/me 401s without a token', async () => {
      await request(ctx.app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rotates the refresh token and rejects reuse', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      expect(res.body.refreshToken).not.toBe(tokens.refreshToken);

      // the rotated-out token must now be invalid (reuse detection)
      await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);

      tokens = res.body;
    });

    it('allows exactly one winner when the same refresh token is used concurrently', async () => {
      const login = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: creds.email, password: creds.password });
      const refreshToken = login.body.refreshToken as string;

      const [r1, r2] = await Promise.all([
        request(ctx.app.getHttpServer()).post('/auth/refresh').send({ refreshToken }),
        request(ctx.app.getHttpServer()).post('/auth/refresh').send({ refreshToken }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 401]);
    });
  });

  it('pads unknown-email login with an argon2 verify (timing oracle)', async () => {
    // Spy on the raw CJS module.exports — the service's `import * as argon2`
    // binding reads through interop getters to this object. (The ESM namespace
    // from `await import()` is non-configurable and cannot be spied on.)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const argon2 = require('argon2') as typeof import('argon2');
    const spy = jest.spyOn(argon2, 'verify');
    try {
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' })
        .expect(401);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
