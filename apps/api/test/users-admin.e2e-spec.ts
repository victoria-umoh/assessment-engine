import request from 'supertest';
import { Role } from '@lms/shared';
import { createTestApp } from './helpers/app.factory';
import { authHeader } from './helpers/auth.helper';

describe('Users admin', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: { Authorization: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await authHeader(ctx, Role.Admin);
  });

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  it('admin lists users with role/q filters and no secret fields', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/users')
      .set(admin)
      .send({
        email: 'searchable.candidate@test.local',
        password: 'password123',
        name: 'Searchable Candidate',
      })
      .expect(201);
    expect(created.body.role).toBe('candidate');
    expect(created.body).not.toHaveProperty('passwordHash');
    expect(created.body).not.toHaveProperty('sessions');

    const list = await request(ctx.app.getHttpServer())
      .get('/admin/users?role=candidate&q=searchable')
      .set(admin)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    const row = list.body.items[0];
    expect(row.email).toBe('searchable.candidate@test.local');
    expect(row.status).toBe('active');
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('sessions');
    expect(list.body.nextCursor).toBeDefined();
  });

  it('rejects a q filter longer than 100 chars (regex cost cap)', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/admin/users?q=${'a'.repeat(101)}`)
      .set(admin)
      .expect(400);
    await request(ctx.app.getHttpServer())
      .get(`/admin/users?q=${'a'.repeat(100)}`)
      .set(admin)
      .expect(200);
  });

  it('created users can log in; duplicate email 409s verbatim', async () => {
    await request(ctx.app.getHttpServer())
      .post('/admin/users')
      .set(admin)
      .send({ email: 'login.me@test.local', password: 'password123', name: 'Login Me' })
      .expect(201);

    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login.me@test.local', password: 'password123' })
      .expect(200);
    expect(login.body.user.role).toBe('candidate');

    const dup = await request(ctx.app.getHttpServer())
      .post('/admin/users')
      .set(admin)
      .send({ email: 'login.me@test.local', password: 'password123', name: 'Dup' })
      .expect(409);
    expect(dup.body.message).toBe('Email already registered');
  });

  it('admin updates role/status; disabling kills sessions; self role/status guarded', async () => {
    const created = await request(ctx.app.getHttpServer())
      .post('/admin/users')
      .set(admin)
      .send({ email: 'victim@test.local', password: 'password123', name: 'Victim' })
      .expect(201);

    // Promote → demote works.
    const promoted = await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${created.body._id}`)
      .set(admin)
      .send({ role: 'admin' })
      .expect(200);
    expect(promoted.body.role).toBe('admin');

    // Victim logs in (creates a session), then gets disabled.
    const login = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'victim@test.local', password: 'password123' })
      .expect(200);

    const disabled = await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${created.body._id}`)
      .set(admin)
      .send({ status: 'disabled' })
      .expect(200);
    expect(disabled.body.status).toBe('disabled');

    // Their refresh token is dead (sessions cleared) and login is rejected.
    await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'victim@test.local', password: 'password123' })
      .expect(401);

    // Self-guard: the acting admin cannot change their own role/status…
    const me = await request(ctx.app.getHttpServer()).get('/auth/me').set(admin).expect(200);
    const self = await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${me.body.id}`)
      .set(admin)
      .send({ role: 'candidate' })
      .expect(400);
    expect(self.body.message).toBe('Cannot change your own role or status');
    await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${me.body.id}`)
      .set(admin)
      .send({ status: 'disabled' })
      .expect(400);

    // …including via a case-variant ObjectId (hex ids compare by value, not
    // by string — an uppercased id must not slip past the guard).
    await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${String(me.body.id).toUpperCase()}`)
      .set(admin)
      .send({ role: 'candidate' })
      .expect(400);

    // …but may rename themselves.
    const renamed = await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${me.body.id}`)
      .set(admin)
      .send({ name: 'Renamed Admin' })
      .expect(200);
    expect(renamed.body.name).toBe('Renamed Admin');

    // Candidates get 403 on the whole controller.
    const candidate = await authHeader(ctx, Role.Candidate);
    await request(ctx.app.getHttpServer()).get('/admin/users').set(candidate).expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/admin/users/${created.body._id}`)
      .set(candidate)
      .send({ name: 'x' })
      .expect(403);
  });
});
