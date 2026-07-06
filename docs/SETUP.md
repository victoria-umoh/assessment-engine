# Development Setup

## Prerequisites
- Node ≥ 22 (`node -v`)
- pnpm ≥ 10 (`corepack enable && corepack prepare pnpm@10.12.1 --activate`)
- Docker Desktop (or compatible engine) with ≥ 4 GB RAM allocated

## First run
```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm --filter api dev          # API on http://localhost:4000
```

## Web app (Phase 5+)

The candidate frontend is a Next.js 15 app at `apps/web`.

```bash
cp apps/web/.env.example apps/web/.env.local   # NEXT_PUBLIC_API_URL (default http://localhost:4000)
pnpm --filter web dev                           # web on http://localhost:3000
```

The API's CORS allowlist defaults to `http://localhost:3000`; set `WEB_ORIGIN`
(comma-separated origins) in `apps/api/.env` when the web app runs elsewhere.

## Grading worker (Phase 4+)

Code grading and assessment finalization run in a separate worker process
consuming the `submission-grading` and `assessment-finalization` BullMQ queues
(Redis). Without it, submissions stay `queued` and results never finalize.

```bash
pnpm build                     # produces apps/api/dist/worker.main.js
pnpm --filter api worker       # starts the BullMQ consumers
```

## Services
| Service | URL | Notes |
|---|---|---|
| MongoDB | mongodb://localhost:27017/lms | app data |
| Redis | redis://localhost:6379 | BullMQ + cache |
| Judge0 | http://localhost:2358 | code execution; try GET /languages |

## Mongo backup / restore

```bash
./infra/scripts/mongo-backup.sh    # dump lms from Docker mongo → backups/, prune (keep 14), sync to local brew mongod
./infra/scripts/mongo-restore.sh   # restore latest archive → Docker mongo (--drop); pass [archive] [docker|local]
```

Backups run automatically every 6 hours via the user crontab (`crontab -l`, entry
tagged `# lms-mongo-backup`; logs in `backups/backup.log`). Archives live outside
Docker's VM, so they survive a Docker Desktop reset/reinstall — as does the synced
copy in the Homebrew mongod. Note: plain `cron` skips runs missed while the Mac
sleeps. `SYNC_LOCAL=0` skips the local sync; the sync self-disables when no
distinct local mongod is reachable.

> **Port-shadowing gotcha:** a natively installed MongoDB (e.g. Homebrew
> `mongodb-community`) binds `127.0.0.1:27017` and silently wins over the Docker
> container's wildcard bind — `localhost` connections (API, seed CLI) then hit the
> native mongod, not Docker's. Check with `lsof -nP -iTCP:27017 -sTCP:LISTEN`;
> if `mongod` appears alongside `com.docker`, stop it (`brew services stop
> mongodb-community`) or point `MONGO_URI` at the machine's LAN IP.

## Verify Judge0
```bash
curl -s http://localhost:2358/languages | head -c 200   # JSON array of languages
```
> Judge0 images are x86_64-only; on Apple Silicon they run under emulation
> (`platform: linux/amd64` in the compose file). First boot can take a few minutes
> while the DB migrates.

> **Known limitation on Apple Silicon:** the API responds, but the isolate
> sandbox cannot create its execution box under emulation — every run returns
> status 13 "Internal Error" (`No such file or directory @ rb_sysopen -
> /box/script.py`). The grading pipeline treats 13/14 as infrastructure errors:
> the job retries and the submission settles as `error` without consuming an
> attempt. To exercise real code execution, run Judge0 on an x86_64 host.
> Verify actual execution (not just the API) with:
> ```bash
> curl -s -X POST 'http://localhost:2358/submissions?base64_encoded=false&wait=true' \
>   -H 'content-type: application/json' \
>   -d '{"language_id":71,"source_code":"print(1+2)","expected_output":"3"}'
> # healthy sandbox → status {"id":3,"description":"Accepted"}
> ```

## Tests
```bash
pnpm test                      # all workspaces
pnpm --filter api test         # API only (uses mongodb-memory-server; Docker not required)
pnpm --filter web test         # web only (vitest + jsdom + Testing Library)
```

## Playwright e2e (Phase 7)

Boots the real stack — api (`:4000`, the standing web build inlines that URL), worker,
`next start` (`:3100`) — against local mongo + redis, with an in-process **Judge0 stub**
(`:2359`, every case passes deterministically; the real Judge0 transport was live-verified
at the P4/P5 gates and can't execute under amd64 emulation on Apple Silicon anyway).

Prereqs:
- `pnpm build` (api `dist/` + web `.next/` must exist; the api build is what the worker runs)
- MongoDB on `127.0.0.1:27017` and Redis on `127.0.0.1:6379`
  (`docker compose -f infra/docker-compose.yml up -d mongo redis`, or the brew services —
  the harness preflights both and fails with instructions)
- port 4000 free (stop the dev api)

```bash
pnpm e2e                       # playwright test (apps/e2e)
```

State: the isolated `lms-e2e` database is dropped and reseeded per run (admin
`admin@e2e.local`, a published 4-item track, a cohort with an invite code — see
`apps/e2e/seed.ts`); BullMQ uses redis **db 1** so dev queues are never touched. Process
logs land in `apps/e2e/.api.log` / `.worker.log` / `.web.log` on failure.
