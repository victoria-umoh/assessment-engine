# Deployment

The platform is five services: **web** (Next.js), **api** (NestJS), **worker** (BullMQ
consumer — same image as api), **mongo**, **redis**, plus **judge0** (+ its own db/redis) for
code execution. Dev runs the app from source (`pnpm dev`); production runs containers.

## Environment variables

All API/worker config is validated at boot (`apps/api/src/config/env.ts`) — a missing or
malformed var fails fast.

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `NODE_ENV` | no | `development` | set `production` in prod |
| `PORT` | no | `4000` | api HTTP port |
| `MONGO_URI` | **yes** | — | e.g. `mongodb://mongo:27017/lms` |
| `REDIS_URL` | **yes** | — | BullMQ + cache; e.g. `redis://redis:6379` |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥16 chars; **generate per environment**, never commit |
| `JWT_REFRESH_SECRET` | **yes** | — | ≥16 chars; distinct from access |
| `JUDGE0_URL` | **yes** | — | e.g. `http://judge0:2358` |
| `ANTHROPIC_API_KEY` | no | — | enables AI material generation; 503 without it |
| `WEB_ORIGIN` | no | `http://localhost:3000` | comma-separated CORS allowlist |
| `THROTTLE_TTL_MS` | no | `60000` | rate-limit window (auth + submissions) |
| `THROTTLE_LIMIT` | no | `10` | requests per window per IP |

Web build-time: `NEXT_PUBLIC_API_URL` is **inlined at build** (Next.js) — set it as a build
arg (`--build-arg NEXT_PUBLIC_API_URL=…`), not a runtime env. The compose `web` service
passes it through `build.args`.

## Dev

```bash
docker compose -f infra/docker-compose.yml up -d          # mongo, redis, judge0
pnpm dev                                                   # api + worker + web from source
```

## Production (containerized)

```bash
export JWT_ACCESS_SECRET=$(openssl rand -hex 24)
export JWT_REFRESH_SECRET=$(openssl rand -hex 24)
pnpm --filter web build   # or let the image build it; ensures NEXT_PUBLIC_API_URL is baked
docker compose -f infra/docker-compose.yml --profile app up -d --build
```

`--profile app` adds `api` / `worker` / `web` on top of the always-on infra services. The api
and worker share one image (`apps/api/Dockerfile`); the worker overrides the command to
`node dist/worker.main.js`. Images are `node:22-slim` (glibc — argon2's native addon needs it);
the api image prunes to production deps via `pnpm deploy --legacy`, the web image ships Next's
standalone bundle (self-hosted Monaco rides in `public/monaco`, no CDN).

Images build and run clean locally (verified: `docker build` both Dockerfiles → api `/health`
returns `{"status":"ok"}` against Docker mongo/redis, web serves `/login` 200).

Any orchestrator works (ECS/k8s/VM) — the containers are stateless; point them at managed
Mongo/Redis and a Judge0 deployment. Next.js can alternatively run on Vercel (build with
`NEXT_PUBLIC_API_URL` set to the public API origin).

## Prod checklist

- [ ] **Secrets**: `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` generated per environment (never the
  compose placeholders); rotate on suspected compromise (rotating invalidates all sessions).
- [ ] **Judge0 on x86_64**: isolate cannot execute under amd64 emulation on Apple Silicon — every
  run returns status 13 (verified out-of-stack in the P4 gate). **Before trusting code grading in
  prod, run the execution verification on a real x86_64 host** (command in `docs/SETUP.md` §Verify
  Judge0). The full transport/queue/retry/error pipeline is otherwise covered.
- [ ] **Rate limiting is per-instance** (in-memory `THROTTLER`). Behind a load balancer, either pin
  a shared limiter (e.g. Redis-backed throttler storage) or accept per-instance limits and set them
  proportionally; a sticky LB also works for the auth/submission endpoints.
- [ ] **Dead-letter queue**: failed grading jobs are retained (`removeOnFail: false`) rather than
  alerted. Inspect with a BullMQ UI (e.g. bull-board) or a one-off:
  `node -e "const {Queue}=require('bullmq'); new Queue('submission-grading',{connection:{url:process.env.REDIS_URL}}).getFailed().then(j=>{console.log(j.length,'failed'); process.exit(0)})"`.
  Wire alerting on that count before high traffic.
- [ ] **Mongo indexes** build on boot from the schemas (spec §6 hot-path compound indexes are
  declared in code); no manual migration needed. Confirm they exist after first deploy.
- [ ] **Uploads**: materials are stored on local disk in dev (volume-mounted). Prod should use
  S3-compatible object storage — this is a documented future rider (the storage abstraction isn't
  built yet; mount a persistent volume in the interim).
- [ ] **Backups**: Mongo backup/restore tooling lives in `backups/` (6-hourly cron documented in
  `docs/SETUP.md`). Verify the schedule runs against the prod database.
- [ ] **Cache**: Redis caching is fail-open (an outage degrades to cache-miss, never an error).
  No action needed for correctness; monitor Redis for the latency benefit.
