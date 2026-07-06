# Architecture

## Runtime topology

Next.js web (apps/web) → NestJS API (apps/api, :4000) → MongoDB (:27017) + Redis (:6379).
Slow work (code grading, material extraction, finalization) is queued to BullMQ and executed
by apps/worker, which calls Judge0 (:2358) for sandboxed code execution.
On Apple Silicon, Judge0 runs under amd64 emulation (see `docs/SETUP.md`).

## Web app (apps/web, Phase 5)

Next.js 15 App Router (React 19, Tailwind v4 + shadcn/ui, TanStack Query v5, Monaco).
**Fully client-rendered behind the auth wall:** the API authenticates via
`Authorization: Bearer`, tokens live in `localStorage` (`lms.accessToken` /
`lms.refreshToken`), so every candidate page is a client component that fetches on
mount — no SSR data fetching or cookies. XSS posture: no third-party scripts, markdown
renders through `react-markdown` without `rehype-raw` (raw HTML stays text), access
tokens are 15-minute.

- `lib/tokens.ts` is the only module touching localStorage; `lib/api.ts` wraps fetch
  (base URL, bearer header, `ApiError` with the server's message verbatim) and handles
  401 with a **single-flight** refresh + one replay — parallel refreshes would trip the
  API's exactly-one-winner rotation and log the user out.
- Routes: `/login`, `/register` (public); `/dashboard`, `/enrollments/[id]`
  (unlock-aware day list), `/enrollments/[id]/items/[itemId]` (one dynamic route
  switching on item type → LessonViewer / ReadingViewer / QuizRunner /
  CodingWorkspace / ExercisePanel), `/enrollments/[id]/final` (capstone hub),
  `/enrollments/[id]/result` (verdict; polls while 404 'Result not ready').
- The client renders only what the API says: unlock state comes from
  `GET /enrollments/:id/unlock-state`, quiz views/coding views are the server's
  candidate projections (no answer keys or hidden cases ever reach the browser).
- Candidate content reads added in Phase 5: `GET /lessons/:id`, `GET /materials/:id`,
  `GET /coding-problems/:id` (allowlist views; archived/processing content 404s).
  **Deliberate posture:** these reads are auth-only, NOT enrollment/unlock-gated —
  a candidate who extracts refIds from `GET /tracks/:id` can pre-read future days'
  lesson/material text and coding statements. Graded surfaces (quiz attempts,
  submissions, hidden cases, answer keys) remain fully gated server-side; content
  pre-reading does not affect scoring integrity. Revisit if tracks ever carry
  content that must stay sealed until its day. CORS is a `WEB_ORIGIN` allowlist.
- Tests: vitest + jsdom + Testing Library; Monaco is
  module-mocked in jsdom. Playwright E2E is the Phase 7 pass.

### Admin panel (Phase 6)

The `(admin)` route group shares the candidate app's auth/query plumbing but is gated by
role in its layout: `admin` renders the nav (aria-current active link), `candidate` is
redirected to `/dashboard`, anonymous to `/login` — content stays hidden pre-redirect.
Candidates never see an Admin link; admins get one in the candidate header.

- Routes: `/admin` (overview stat cards), `/admin/questions` (filters, create/edit,
  archive, per-question stats), `/admin/lessons`, `/admin/coding`, `/admin/materials`
  (+ `[id]` detail: upload/generate/author, editor, comprehension-question linking),
  `/admin/tracks` (+ `[id]` builder: days/items, scoring, capstone, publish),
  `/admin/cohorts` (+ `[id]` dashboard) , `/admin/users`, `/admin/audit`.
- `CursorList` is the shared list primitive (TanStack `useInfiniteQuery` over the API's
  cursor pagination; filters preserved across load-more).
- Uploads go through `apiFetch`'s FormData passthrough (no JSON content-type so the
  multipart boundary survives).
- The track builder never invents item ids: the server regenerates ALL `itemId`s on every
  draft save, so the client strips them before PATCH and re-reads the saved track.
- Forms use native selects (radix Select needs real pointer events jsdom can't provide);
  the vendored shadcn Select is reserved for non-form display.

## Auth

- Register/login issue an access JWT (15 min, payload `{ sub, role }`) and a refresh JWT
  (7 days, payload `{ sub, jti }`).
- Refresh tokens are stored sha256-hashed in `user.sessions` (max 5, expired pruned) and
  **rotated** on every refresh; reusing a rotated token 401s. Concurrent reuse of the same
  token has exactly one winner (pinned by e2e test).
- Protected routes: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.Admin)`.
  RolesGuard throws 401 (not 403) if no user is attached — a misconfigured route that skips
  JwtAuthGuard reports the true failure.
- Passwords hashed with argon2. Login/refresh errors are generic (no user enumeration).

## Module map (apps/api)

| Module | Responsibility |
|---|---|
| config | zod-validated env (fails fast at boot) |
| health | liveness endpoint (`GET /health`) |
| users | user persistence, argon2 hashing, session storage, atomic refresh-session claim |
| auth | token issuance/rotation, guards, RBAC |
| categories | 12 managed assessment categories, admin CRUD, archive-hides-from-list |
| questions | question pool CRUD, per-type zod refinements, cursor pagination, candidate-safe views (`toCandidateQuestionView` strips correct/explanation/traitMapping) |
| coding | coding problems; hidden test cases fully absent from candidate view |
| lessons | lessons with typed content blocks (markdown/video/image) |
| materials | upload (PDF/DOCX/MD/TXT ≤10 MB → `var/uploads/`), sync text extraction (Phase 4 moves it to the worker queue), optional Claude generation (503 when `ANTHROPIC_API_KEY` unset) |
| seed | idempotent seed of 12 categories + 311-question bank (`pnpm --filter api seed`); see `docs/SEED-BANK.md` |
| tracks | track builder: embedded days/items (server-assigned `itemId`), scoring weights (sum-to-1 zod gate), draft→published→archived lifecycle — content edits draft-only (409 otherwise), publish validates structure + refId resolution (all problems collected into one 400), candidate routes list/serve published only |
| cohorts | cohorts on published tracks: 8-char base32 `inviteCode` (unique sparse), status derived from `startDate` (scheduled/active), `pacingOverrides.unlockMode`, `{trackId,status}` index, admin CRUD |
| enrollments | enroll by trackId/cohortId/inviteCode (one per user+track — unique index + pre-check), cohort capacity (409 full), owner-or-admin reads; `unlock.engine.ts` is the pure hybrid gate (`computeUnlockState`: progress AND date, per-mode relaxation, gap rule) — controllers only relay it; `POST …/items/:itemId/complete` (lesson/exercise only, others 422 until Phase 4) uses optimistic `version` concurrency (reload-retry once, then 409) and persists `unlockedDay` opportunistically |
| queues | BullMQ producers (`QueuesService`, jobId-deduped, 3× exponential backoff, failed jobs retained as the DLQ surface); queue names per spec: `submission-grading`, `assessment-finalization`. Consumers live ONLY in the worker |
| quizzes | quiz attempts: `$match`+`$sample` pool sampling (served-question exclusion when the pool allows), per-attempt question+option shuffling, candidate views that never leak `correct`/`explanation`/`traitMapping`/shuffle order; server-side grading (mcq/multi/text/likert w/ trait normalization 0–100), server-enforced time limits (+5s grace), `maxAttempts`, highest-retake-wins item progress; reading items sample by `materialId`; the capstone quiz uses the reserved `quizItemId` `'final-quiz'` |
| submissions | Monaco→Judge0 pipeline: `POST /submissions` validates (item/capstone gates, language ∈ map ∩ problem.languages, in-flight dedupe) and enqueues; `GradingService` (worker) batches base64 runs to Judge0, weighted per-case scoring, idempotent by submission id, retries → `error` without consuming an attempt; hidden-case results redacted for candidates |
| assessments | pure `scoring.engine.ts` (type-score means, proportional weight renormalization, categoryMinimums, personalityProfile) + `FinalizationService` (triggered when all required day items complete AND capstone parts settled; idempotent upsert of `assessmentResults`; enrollment → completed/failed) + `GET /enrollments/:id/result` and `/final-assessment` |
| worker | second entrypoint `src/worker.main.ts` (`pnpm --filter api worker` after build) hosting the BullMQ processors — the API process never consumes queues (pinned by processor specs) |
| audit | global `APP_INTERCEPTOR` records every **successful** mutating request (`POST`/`PATCH`/`PUT`/`DELETE`) under `/admin/*` — `action` = `METHOD route-path`, `entity` = path segment, `diff` = recursively password/token-stripped **request payload** (spec §4 deviation: not a before/after delta — the payload is what's cheaply available at the interceptor layer; revisit if forensic diffs are ever needed). Write failures are `Logger.warn`'d, never surfaced to the mutating request. `GET /admin/audit-logs` is a newest-first cursor (`_id: $lt`, sort `-1`) with `entity`/`actorId` filters |
| analytics | admin read-model, aggregated on demand: `overview` (Promise.all count batch — readable beats a mega-`$facet` at this size), `cohorts/:id/dashboard` (`$lookup` users + assessmentResults, required-item completion computed against track config in JS; **Redis-cached 30s**, see Caching), `enrollments/:id/detail` (attempts projected **without** questions — answer keys stay server-side; submissions without sourceCode/testResults), `analytics/questions` (`$unwind`+`$group` served/correctRate) |
| cache | `CacheService` (ioredis): fail-open wrapper — any Redis error degrades to a cache miss, `lazyConnect` so Redis-less boots work; **disabled under `NODE_ENV=test` unless `CACHE_TEST=1`** (a dev machine's live Redis must never leak state across jest suites). Imported per consumer module (not `@Global`) so isolated module tests compile |

Phase 6 also extended existing modules with admin surfaces: questions/lessons/coding/materials
gained list+update+archive admin routes (update schemas in `@lms/shared`; `type`/`materialId`
immutable on question edit; archived content 404s for candidates), and users gained
`GET/POST/PATCH /admin/users` (escaped-regex search, role/status filters, self-guard — an admin
cannot change their own role/status; disable clears sessions so only the ≤15-min access-token
tail survives). Every admin route is pinned by a candidate-403 e2e test.

## Caching (spec §6, Phase 7)

Redis read-through cache via `CacheService.wrap(key, ttlSec, fn)`; 404s throw inside `fn` and are
never cached. Lesson reads cache the **serialized candidate view** (projection applied before
caching), never raw docs.

| Key | TTL | Read path | Invalidated by |
|-----|-----|-----------|----------------|
| `cats:active` | 300s | `GET /categories` | category create/archive (seed CLI relies on TTL) |
| `track:pub:list` | 300s | `GET /tracks` | track update/publish/archive |
| `track:pub:<id>` | 300s | `GET /tracks/:id` | track update/publish/archive |
| `lesson:cand:<id>` | 300s | `GET /lessons/:id` | lesson update/archive |
| `unlock:<enrollmentId>` | 30s | `GET /enrollments/:id/unlock-state` | completeItem, recordItemResult |
| `cohort:dash:<id>` | 30s | `GET /admin/cohorts/:id/dashboard` | finalization result upsert |

**Spec §6 deviation:** cohort dashboards are Redis-cached (30s + invalidation on finalization)
instead of a worker-maintained pre-aggregated collection — same read-cost outcome at this
cardinality with far less machinery. Authorization always runs **before** the cache
(unlock-state checks owner/admin, then hits a per-enrollment key).

## Testing

- Unit + e2e via jest; e2e specs boot the real AppModule against mongodb-memory-server
  via `test/helpers/app.factory.ts` — no Docker needed for tests.
- **Gotcha:** `ConfigModule.forRoot({ validate })` validates `process.env` at *import time*.
  Test bootstrap must set env vars, then dynamically `await import()` the AppModule
  (the factory does this; follow the same pattern in new suites).
