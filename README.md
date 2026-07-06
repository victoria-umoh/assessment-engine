# Learning Trials — LMS & Assessment Platform

Enterprise LMS + assessment platform: admin-defined tracks (cohort or self-paced),
randomized quizzes across 12 assessment categories, LeetCode-style coding challenges
executed in Judge0, progressive unlocking, weighted pass/fail verdicts.

- **Architecture:** `docs/ARCHITECTURE.md`
- **Dev setup:** `docs/SETUP.md`
- **Deployment (AWS + CI/CD):** `docs/AWS-DEPLOYMENT-GUIDE.md`, `docs/DEPLOYMENT.md`

## Layout
- `apps/web` — Next.js 15 candidate + admin app
- `apps/api` — NestJS REST API
- `apps/worker` — BullMQ grading/finalization worker
- `packages/shared` — shared types + zod schemas
- `infra/` — docker-compose (mongo, redis, judge0)
