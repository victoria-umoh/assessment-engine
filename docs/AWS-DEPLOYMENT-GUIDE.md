# The Big Friendly Guide — What We Built & How To Put It On AWS

> This guide explains everything like you're five: short words, small steps, no magic.
> When something is genuinely grown-up (secrets, money, servers), it says so loudly.

---

## Part 1 — What is this thing?

Imagine a school inside a computer.

- **Teachers (admins)** write lessons, quizzes, and coding puzzles, and bundle them
  into a multi-day course called a **track**.
- **Students (candidates)** join a track with an invite code, read the lessons, take
  the quizzes, and solve the coding puzzles in a real code editor.
- The computer **grades everything by itself** — quizzes instantly, code by actually
  *running* the student's program in a locked sandbox.
- At the end, the computer adds up all the scores with weights the teacher chose and
  says **PASS** or **FAIL**, plus a personality profile.

That's the whole product. Everything below is the machinery that makes it true.

## Part 2 — What was built, step by step

The system was built in seven stages. Each stage was finished, tested, and merged
before the next began.

1. **Foundation** — The skeleton. A monorepo (one big folder holding several apps),
   Docker containers for the databases, and the API server with login/logout.
   Passwords are scrambled with argon2 (a very strong scrambler). Login gives you two
   tickets: a short-lived **access token** and a longer **refresh token** that can be
   traded for a new pair exactly once (if a stolen ticket is reused, all sessions are
   killed).
2. **Content** — The library. Categories (12 of them), a bank of 311 seeded questions,
   coding problems with hidden test cases, lessons, and uploadable reading materials
   (PDF/DOCX text is extracted automatically; an optional feature can draft
   comprehension questions from a topic using the Anthropic API).
3. **Tracks, cohorts & enrollment** — The timetable. Admins build multi-day tracks,
   group students into cohorts with invite codes, and a small "unlock engine" decides
   which day each student may open (by date, by finishing the previous day, or both).
4. **Assessment engine** — The grader. Quizzes are sampled randomly per student and
   graded on the server (answer keys never leave it). Code submissions go into a
   **queue** (BullMQ on Redis) and a separate **worker** program sends them to
   **Judge0**, the code-execution sandbox. A pure scoring engine mixes everything
   into the final weighted verdict.
5. **Candidate app** — The student's screen. Next.js web app: dashboard, day-by-day
   track view, lesson reader, quiz runner with a countdown, a Monaco code editor
   (the same editor VS Code uses, self-hosted so exams don't depend on a CDN), and
   the results page.
6. **Admin panel** — The teacher's screen. Question/lesson/problem/material editors,
   a track builder, cohort management, user management, an audit log of every admin
   change, and analytics dashboards (cohort progress, per-candidate drill-down,
   per-question stats).
7. **Hardening** — The armor. Rate limiting on login and submissions, Redis caching
   with automatic invalidation, dozens of edge-case fixes, end-to-end browser tests
   (Playwright), production Dockerfiles for api/worker/web, and the deployment docs.

Final state: **232 API tests + 104 web tests + 3 end-to-end journeys, all green**,
and both production images build and run.

## Part 3 — Technologies used (and what each one is)

| Piece | Technology | Five-year-old version |
|---|---|---|
| Web app | **Next.js 15 + React 19 + Tailwind 4** | The pretty screens |
| Code editor | **Monaco** (self-hosted) | VS Code's editor inside the browser |
| API server | **NestJS 11 (Node 22, TypeScript)** | The brain that answers every request |
| Background worker | **BullMQ** consumer (same codebase as the API) | A helper who does slow chores from a to-do list |
| Job queue + cache | **Redis** | The to-do list AND a scratchpad for answers we look up often |
| Database | **MongoDB 7 (Mongoose)** | The filing cabinet where everything is kept |
| Code sandbox | **Judge0** | A padded room where student code runs safely |
| Shared types | **Zod schemas** in `packages/shared` | One rulebook both the screens and the brain obey |
| Auth | **JWT access+refresh, argon2** | Tickets and a password scrambler |
| Tests | **Jest, Vitest, Playwright** | Robots that re-check everything works |
| Packaging | **pnpm workspaces + Turbo, Docker** | Boxes that ship the same everywhere |

Repo layout: `apps/web` (screens), `apps/api` (brain + worker entrypoint),
`packages/shared` (rulebook), `apps/e2e` (browser robot), `infra/` (docker-compose),
`docs/` (you are here).

## Part 4 — Credentials you will need (READ THIS SLOWLY)

**There are no real secrets in this repository.** That is on purpose. Secrets are
like toothbrushes: everyone makes their own, and you never share or commit them.
Below is the *shopping list* — the names of secrets you must create yourself, and
where each one goes.

| Secret name | What it is | How you get one | Where it lives |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | Signs login tickets | Run `openssl rand -hex 24` | AWS SSM Parameter Store (SecureString) |
| `JWT_REFRESH_SECRET` | Signs refresh tickets (must differ from access) | `openssl rand -hex 24` again | AWS SSM Parameter Store |
| `MONGO_URI` | Address + password of your database | From MongoDB Atlas (Part 6, step 2) | AWS SSM Parameter Store |
| `REDIS_URL` | Address of Redis | From ElastiCache (Part 6, step 3) | AWS SSM Parameter Store |
| `ANTHROPIC_API_KEY` | *(optional)* enables the question-drafting feature | console.anthropic.com → API keys | AWS SSM Parameter Store |
| `AWS_DEPLOY_ROLE_ARN` | Lets GitHub Actions talk to AWS **without** long-lived keys | Created in Part 6, step 4 (OIDC role) | GitHub → repo → Settings → Secrets and variables → Actions |

Rules, always:

1. **Never** paste a secret into a file that gets committed, a chat, a screenshot, or a doc (including this one).
2. Generate **different** secrets for staging and production.
3. If a secret might have leaked, rotate it. Rotating the JWT secrets logs every user out — that's the point.

## Part 5 — How the pieces talk (the map)

```
Browser ──HTTPS──▶ ALB ──▶ web (Next.js, port 3000)
Browser ──HTTPS──▶ ALB ──▶ api (NestJS, port 4000) ──▶ MongoDB Atlas
                                    │                └▶ Redis (cache)
                                    └──puts jobs on──▶ Redis (queue)
                     worker (same image as api) ◀──takes jobs from Redis
                     worker ──▶ Judge0 (EC2, x86_64, port 2358) — runs student code
```

Important quirk: **Judge0 must run on a real x86_64 machine.** Its sandbox does not
work under ARM emulation (this was proven during development — every run returns
"Internal Error" on Apple Silicon). An `t3.medium` EC2 box is perfect, and using one
also satisfies the "verify Judge0 on x86_64 before production" checklist item in
`DEPLOYMENT.md`.

## Part 6 — Ship to AWS with GitHub Actions, step by step

We'll use: **ECR** (photo album for Docker images), **ECS Fargate** (runs containers
without you managing servers) for web/api/worker, **MongoDB Atlas** (managed Mongo —
preferred over DocumentDB because the app uses real MongoDB 7 features like
`$sample`), **ElastiCache** (managed Redis), one small **EC2** for Judge0, and an
**ALB** (front door).

### Step 0 — Things you need first
- An AWS account and the `aws` CLI logged in as an admin (`aws configure`).
- The GitHub repository (this one) with the code pushed.
- A MongoDB Atlas account (free to start): https://cloud.mongodb.com

### Step 1 — Make the photo albums (ECR repositories)
```bash
aws ecr create-repository --repository-name lms/api
aws ecr create-repository --repository-name lms/web
```

### Step 2 — Make the database (MongoDB Atlas)
1. Atlas → Create cluster → AWS → same region as everything else (e.g. `us-east-1`) → M10.
2. Database Access → add a user `lms-app` with a generated password → role `readWriteAnyDatabase`.
3. Network Access → allow your VPC (VPC peering / private endpoint) — or, to start simply, the NAT gateway's IP.
4. Copy the connection string. It looks like
   `mongodb+srv://lms-app:<password>@cluster0.xxxxx.mongodb.net/lms`.
   **This whole string is your `MONGO_URI` secret.**

### Step 3 — Make Redis (ElastiCache)
Console → ElastiCache → Redis OSS → create a single small node (`cache.t4g.small`),
same VPC as ECS, no public access. The primary endpoint becomes
`REDIS_URL=redis://<endpoint>:6379`.

### Step 4 — Let GitHub deploy WITHOUT sharing AWS keys (OIDC)
This is the grown-up way: GitHub proves who it is with a signed token; AWS trusts
the token; nobody stores an AWS password anywhere.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```
Then create a role `github-deploy-lms` whose trust policy allows
`repo:thepremiumcoder/assessment-engine:ref:refs/heads/main`, and attach permissions
for ECR push + ECS deploy (`AmazonEC2ContainerRegistryPowerUser` + a small inline
policy with `ecs:UpdateService`, `ecs:RegisterTaskDefinition`, `ecs:Describe*`,
`iam:PassRole` on the task roles). Save the role's ARN as the GitHub secret
`AWS_DEPLOY_ROLE_ARN`.

### Step 5 — Store the app secrets in AWS
```bash
aws ssm put-parameter --type SecureString --name /lms/prod/JWT_ACCESS_SECRET  --value "$(openssl rand -hex 24)"
aws ssm put-parameter --type SecureString --name /lms/prod/JWT_REFRESH_SECRET --value "$(openssl rand -hex 24)"
aws ssm put-parameter --type SecureString --name /lms/prod/MONGO_URI  --value "mongodb+srv://…"   # from Step 2
aws ssm put-parameter --type SecureString --name /lms/prod/REDIS_URL  --value "redis://…:6379"     # from Step 3
# optional:
aws ssm put-parameter --type SecureString --name /lms/prod/ANTHROPIC_API_KEY --value "sk-ant-…"
```

### Step 6 — The Judge0 box (one EC2 machine)
1. Launch an **x86_64** `t3.medium`, Amazon Linux 2023, in the same VPC, private subnet.
2. Install Docker + compose, then run Judge0's official compose (v1.13) — the same
   services this repo's `infra/docker-compose.yml` runs locally (judge0 server,
   workers, its own postgres + redis).
3. Security group: allow port **2358 only from the ECS tasks' security group**.
   Judge0 runs untrusted code — it must never be reachable from the internet.
4. `JUDGE0_URL=http://<ec2-private-ip>:2358`.
5. **Verify it really executes code** (this closes the known checklist item):
   send a hello-world submission per `docs/SETUP.md` §Verify Judge0 and confirm
   status 3 (Accepted), not 13.

### Step 7 — ECS cluster, task definitions, services
Create a cluster `lms`. Then three task definitions (all pulling secrets from the
SSM paths above via `secrets:` in the container definition):

| Service | Image | Command | Port | Env highlights |
|---|---|---|---|---|
| `api` | `lms/api` | *(default)* `node dist/main.js` | 4000 | `NODE_ENV=production`, `WEB_ORIGIN=https://your-domain`, `JUDGE0_URL` |
| `worker` | `lms/api` (same!) | `node dist/worker.main.js` | — | same env as api |
| `web` | `lms/web` | *(default)* | 3000 | none needed at runtime (`NEXT_PUBLIC_API_URL` is baked in at build) |

Create an **ALB** with two target groups: `/` → web:3000, and an `api.` subdomain
(or `/api/*` path) → api:4000, health check path `/health` for the api and `/login`
for web. Point Route 53 (or your DNS) at the ALB, attach an ACM certificate for HTTPS.

**Uploads note:** material uploads currently write to local disk (`var/uploads/`).
Attach an **EFS volume** to the api task at that path so files survive restarts.
(S3 storage is a documented future improvement.)

### Step 8 — The GitHub Actions workflow
Create `.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write     # for OIDC
  contents: read

env:
  AWS_REGION: us-east-1

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm --filter api test
      - run: pnpm --filter web test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr
      - name: Build & push api image
        run: |
          docker build -f apps/api/Dockerfile \
            -t ${{ steps.ecr.outputs.registry }}/lms/api:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/lms/api:${{ github.sha }}
      - name: Build & push web image
        run: |
          docker build -f apps/web/Dockerfile \
            --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com \
            -t ${{ steps.ecr.outputs.registry }}/lms/web:${{ github.sha }} .
          docker push ${{ steps.ecr.outputs.registry }}/lms/web:${{ github.sha }}
      - name: Roll ECS services to the new images
        run: |
          for svc in api worker web; do
            img=lms/api; [ "$svc" = web ] && img=lms/web
            aws ecs describe-task-definition --task-definition lms-$svc \
              --query taskDefinition > td.json
            node -e "
              const td=require('./td.json');
              td.containerDefinitions[0].image='${{ steps.ecr.outputs.registry }}/'+process.argv[1]+':${{ github.sha }}';
              ['taskDefinitionArn','revision','status','requiresAttributes','compatibilities','registeredAt','registeredBy'].forEach(k=>delete td[k]);
              require('fs').writeFileSync('td-new.json', JSON.stringify(td));
            " $img
            aws ecs register-task-definition --cli-input-json file://td-new.json
            aws ecs update-service --cluster lms --service lms-$svc \
              --task-definition lms-$svc --force-new-deployment
          done
      - name: Wait until stable
        run: aws ecs wait services-stable --cluster lms --services lms-api lms-worker lms-web
```

What it does, in order: run every test → build both Docker images → push them to
ECR tagged with the commit hash → tell ECS to restart api, worker, and web on the
new images → wait until the health checks are green. If tests fail, nothing deploys.

### Step 9 — First boot (one time only)
```bash
# Seed the 12 categories + 311-question bank (idempotent — safe to re-run):
aws ecs run-task --cluster lms --task-definition lms-api \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/run-seed.js"]}]}' \
  --launch-type FARGATE --network-configuration '…same as the api service…'
```
Then register the first user through the web app and promote them to admin in Atlas:
`db.users.updateOne({email:'you@example.com'},{$set:{role:'admin'}})`.

## Part 7 — Logging, observability, monitoring

Three questions, three tools:

**"What happened?" → Logs (CloudWatch)**
- In each ECS task definition set the log driver:
  ```json
  "logConfiguration": { "logDriver": "awslogs",
    "options": { "awslogs-group": "/lms/api", "awslogs-region": "us-east-1",
                 "awslogs-stream-prefix": "ecs" } }
  ```
  One log group per service: `/lms/api`, `/lms/worker`, `/lms/web`.
- NestJS already logs boot, route mapping, queue errors, and audit-write failures;
  Next.js logs request errors. Everything the containers print lands in CloudWatch.
- Set retention (e.g. 30 days) so the bill doesn't grow forever:
  `aws logs put-retention-policy --log-group-name /lms/api --retention-in-days 30`.

**"Is it healthy right now?" → Metrics + dashboards**
- Turn on **Container Insights** on the cluster (CPU/memory per service, free-ish).
- The ALB gives you request count, latency, and 5xx rates per target group.
- Make one CloudWatch dashboard with: api p95 latency, api 5xx, web 5xx,
  api/worker CPU+memory, ElastiCache CPU + evictions, Judge0 EC2 CPU.

**"Wake me up if it breaks" → Alarms (SNS → email)**
```bash
aws sns create-topic --name lms-alerts
aws sns subscribe --topic-arn <arn> --protocol email --notification-endpoint you@example.com
```
Alarm on at least:
1. ALB `HTTPCode_Target_5XX_Count` > 5 in 5 min (api target group).
2. ECS running task count < desired count (any service — catches crash loops).
3. `/health` failing (ALB UnhealthyHostCount ≥ 1 for 5 min).
4. **Stuck grading jobs** — failed jobs are kept on purpose (a dead-letter drawer).
   Run this as a scheduled task (EventBridge, every 5 min) and publish the count as
   a custom metric; alarm when > 0:
   ```bash
   node -e "const {Queue}=require('bullmq');
     new Queue('submission-grading',{connection:{url:process.env.REDIS_URL}})
       .getFailed().then(j=>{console.log(j.length); process.exit(0)})"
   ```
5. Judge0 EC2 instance status check failed.

Nice-to-have upgrades later: OpenTelemetry tracing (Nest has first-class support),
Sentry for browser-side errors, bull-board UI for the queue.

## Part 8 — Moving what you already have (database & containers)

**The database.** Your local data lives in the Docker volume `mongo-data`, and
6-hourly backups already exist in `backups/*.archive.gz` (made by
`infra/scripts/mongo-backup.sh`). To move it to Atlas:

```bash
# 1. Take one fresh backup of local Docker mongo:
bash infra/scripts/mongo-backup.sh          # writes backups/lms-<timestamp>.archive.gz

# 2. Restore that archive into Atlas:
mongorestore --uri "mongodb+srv://lms-app:<password>@cluster0.xxxxx.mongodb.net" \
  --archive=backups/lms-<timestamp>.archive.gz --gzip --nsInclude 'lms.*'

# 3. Check: collections + counts should match what you had locally.
```
Indexes are declared in code and (re)built automatically when the api boots — no
manual migration scripts exist or are needed. If your local data is only seed/test
data, skip all of this and just run the seed task (Part 6, Step 9) — it rebuilds the
full question bank from scratch, idempotently.

**Redis.** Nothing to migrate. It holds only cache entries (rebuilt on demand) and
queue jobs. Just make sure no grading job is mid-flight when you switch: stop the
worker, confirm `getWaiting()`+`getActive()` are empty, then point at ElastiCache.

**The containers.** Don't copy your local images anywhere. The whole point of Part 6
is that GitHub Actions rebuilds them from source on every push — your first push to
`main` produces the production images. Local Docker images/volumes can stay as your
dev environment (`docker compose -f infra/docker-compose.yml up -d` + `pnpm dev`).

**Uploaded files.** If you uploaded real materials locally, copy `var/uploads/` onto
the EFS volume the api task mounts (Part 6, Step 7). Otherwise skip.

## Part 9 — The whole journey on one page

1. Create ECR repos, Atlas cluster, ElastiCache, Judge0 EC2 (x86_64!), ECS cluster + ALB.
2. Generate secrets → SSM Parameter Store; create the OIDC deploy role → GitHub secret.
3. Add `.github/workflows/deploy.yml` (Part 6, Step 8) and push to `main`.
4. Watch Actions: tests → images → ECS rollout → stable.
5. Seed the database (or restore your backup into Atlas), promote your admin.
6. Wire CloudWatch logs, dashboard, and the five alarms.
7. Send a real code submission end-to-end and confirm Judge0 returns **Accepted**.
8. Read the prod checklist in `DEPLOYMENT.md` one more time. Done. 🎉
