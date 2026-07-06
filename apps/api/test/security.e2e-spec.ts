import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';

describe('Security hardening (e2e)', () => {
  let app: INestApplication;
  let stop: () => Promise<void>;
  let candidate: { Authorization: string };

  beforeAll(async () => {
    // Opt back into the real (production-default) throttle limit for this suite;
    // app.factory defaults tests to a high limit so auth.helper logins never trip it.
    process.env.THROTTLE_LIMIT = '10';
    ({ app, stop } = await createTestApp());
    // Mint the candidate via register (throttled separately from login — the
    // login test needs its full 10-request budget untouched).
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'candidate@test.local', password: 'password123', name: 'Candidate' })
      .expect(201);
    candidate = { Authorization: `Bearer ${reg.body.accessToken}` };
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'victim@test.local', password: 'password123', name: 'Victim' })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    delete process.env.THROTTLE_LIMIT;
    await stop();
  });

  it('throttles login after 10 attempts in a minute', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'victim@test.local', password: 'wrong-pass-123' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'victim@test.local', password: 'wrong-pass-123' })
      .expect(429);
  });

  it('throttles submission creation after 10 attempts in a minute', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/submissions')
        .set(candidate)
        .send({ nonsense: true })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/submissions')
      .set(candidate)
      .send({ nonsense: true })
      .expect(429);
  });
});
