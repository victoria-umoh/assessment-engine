# API Reference

NestJS REST API. **No global prefix** — paths are exact. JSON in/out except the multipart
material upload. Request bodies are validated with zod schemas from `@lms/shared` (named
below); a validation failure returns **400** with `{ statusCode, message }` where `message` is
zod's flattened error.

## Conventions

- **Auth:** `Public` (no guard), `JWT` (`Authorization: Bearer <accessToken>`), or `Admin`
  (JWT + `role === 'admin'`). Missing/invalid token → **401**; wrong role → **403**.
- **Pagination:** every list endpoint is cursor-based — query `?after=<cursor>&limit=<n>`
  (limit clamped 1–100, default 20), response `{ items: [...], nextCursor: string | null }`
  (`null` = end of list).
- **HTTP codes:** POST → 201, others → 200, except the explicit 200s noted below
  (login, refresh, publish, item-complete, quiz-submit).
- **Rate limiting:** auth routes and `POST /submissions` are throttled — `THROTTLE_LIMIT`
  requests (default 10) per `THROTTLE_TTL_MS` window (default 60 000 ms) per IP; over → **429**.
- **Answer secrecy:** candidate views never expose `correct`, hidden test-case output, or
  answer keys (spec §7). Admin reads may.

## Auth

| Method | Path | Auth | Body | Success | Response / Errors |
|--------|------|------|------|---------|-------------------|
| POST | `/auth/register` | Public · throttled | `registerSchema` `{ email, password, name }` | 201 | `{ user, accessToken, refreshToken }`; 409 `'Email already registered'` |
| POST | `/auth/login` | Public · throttled | `loginSchema` `{ email, password }` | **200** | `{ user, accessToken, refreshToken }`; 401 `'Invalid credentials'` (unknown email pays a dummy argon2 verify — no timing oracle) |
| POST | `/auth/refresh` | Public · throttled | `{ refreshToken }` | **200** | rotated `{ user, accessToken, refreshToken }`; 401 on reuse/expiry (rotation + reuse detection) |
| GET | `/auth/me` | JWT | — | 200 | `{ id, email, name, role, status }` |

## Users (admin)

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| GET | `/admin/users` | Admin | `?role=&status=&q=&after=&limit=` (`q` ≤100 chars, escaped-regex on email/name) | 200 | cursor page; `passwordHash`/`sessions` never serialized |
| POST | `/admin/users` | Admin | `createUserSchema` | 201 | admin user view; 409 `'Email already registered'` verbatim |
| PATCH | `/admin/users/:id` | Admin | `updateUserSchema` (`name`/`role`/`status`) | 200 | admin user view; 400 `'Cannot change your own role or status'` (self-guard); disabling clears sessions |

## Categories

| Method | Path | Auth | Body | Success | Response / Errors |
|--------|------|------|------|---------|-------------------|
| GET | `/categories` | JWT | — | 200 | active categories (Redis-cached 300s) |
| POST | `/admin/categories` | Admin | `createCategorySchema` | 201 | category; 409 `'Category key already exists'` |
| DELETE | `/admin/categories/:id` | Admin | — | 200 | archived category; 404 `'Category not found'` |

## Questions (admin)

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/admin/questions` | Admin | `createQuestionSchema` (type-refined: mcq/multi/text/likert) | 201 | question; 400 `'Unknown category'` |
| GET | `/admin/questions` | Admin | `?categoryId=&difficulty=&type=&status=&materialId=&after=&limit=` | 200 | cursor page |
| GET | `/admin/questions/:id` | Admin | — | 200 | question; 404 |
| PATCH | `/admin/questions/:id` | Admin | `updateQuestionSchema` (merge-and-revalidate; `type`/`materialId` immutable) | 200 | question |
| DELETE | `/admin/questions/:id` | Admin | — | 200 | archived (candidates 404 on archived) |

## Coding problems

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/admin/coding-problems` | Admin | `createCodingProblemSchema` (`testCases` ≥1) | 201 | problem; 400 `'Unknown category'` |
| GET | `/admin/coding-problems` | Admin | `?status=&after=&limit=` | 200 | cursor page |
| GET | `/admin/coding-problems/:id` | Admin | — | 200 | full problem (hidden cases included) |
| PATCH | `/admin/coding-problems/:id` | Admin | `updateCodingProblemSchema` | 200 | problem |
| DELETE | `/admin/coding-problems/:id` | Admin | — | 200 | archived |
| GET | `/coding-problems/:id` | JWT | — | 200 | candidate view (hidden test cases stripped); 404 on archived/missing |

## Lessons

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/admin/lessons` | Admin | `createLessonSchema` | 201 | lesson |
| GET | `/admin/lessons` | Admin | `?status=&after=&limit=` | 200 | cursor page |
| PATCH | `/admin/lessons/:id` | Admin | `updateLessonSchema` | 200 | lesson (busts `lesson:cand:<id>` cache) |
| DELETE | `/admin/lessons/:id` | Admin | — | 200 | archived |
| GET | `/lessons/:id` | JWT | — | 200 | candidate lesson view (Redis-cached 300s); 404 on archived/missing |

## Materials

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/admin/materials/upload` | Admin | multipart `file` + `title` | 201 | material; 400 `'file is required'` / `'title is required'` |
| POST | `/admin/materials/generate` | Admin | `{ topic, numQuestions, categoryId }` | 201 | material; **503** when `ANTHROPIC_API_KEY` unset |
| GET | `/admin/materials` | Admin | `?status=&archived=&after=&limit=` | 200 | cursor page (light rows; no content/storageKey) |
| GET | `/admin/materials/:id` | Admin | — | 200 | full admin view; 404 `'Material not found'` |
| PATCH | `/admin/materials/:id` | Admin | `updateMaterialSchema` (`linkedQuestionIds` validated) | 200 | material; 400 `'Unknown question'` |
| DELETE | `/admin/materials/:id` | Admin | — | 200 | archived |
| GET | `/materials/:id` | JWT | — | 200 | candidate view (ready + non-archived only); 404 |

## Tracks

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| GET | `/tracks` | JWT | — | 200 | published only, `finalAssessment` projected out (Redis-cached 300s) |
| GET | `/tracks/:id` | JWT | — | 200 | published only; 404 |
| POST | `/admin/tracks` | Admin | `createTrackSchema` | 201 | draft track (server mints item ids) |
| GET | `/admin/tracks` | Admin | `?status=&after=&limit=` | 200 | cursor page |
| GET | `/admin/tracks/:id` | Admin | — | 200 | full track |
| PATCH | `/admin/tracks/:id` | Admin | `updateTrackSchema` (draft only; `finalAssessment: null` unsets) | 200 | track; 409 `'Only draft tracks can be edited'` |
| POST | `/admin/tracks/:id/publish` | Admin | — | **200** | published; 400 lists problems: `'track must have at least one day'`, `'track has N days but durationDays is M'`, `'day N has no items'`, dangling refId |
| DELETE | `/admin/tracks/:id` | Admin | — | 200 | archived |

## Cohorts (admin)

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/admin/cohorts` | Admin | `createCohortSchema` (`endDate ≥ startDate`) | 201 | cohort w/ `inviteCode`; 400 `'Track must be published'` |
| GET | `/admin/cohorts` | Admin | `?trackId=&status=&after=&limit=` | 200 | cursor page |
| GET | `/admin/cohorts/:id` | Admin | — | 200 | cohort; 404 `'Cohort not found'` |
| PATCH | `/admin/cohorts/:id` | Admin | `updateCohortSchema` | 200 | cohort (moving `startDate` re-derives scheduled/active) |
| DELETE | `/admin/cohorts/:id` | Admin | — | 200 | archived |

## Enrollments

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/enrollments` | JWT | `enrollSchema` (`trackId` or `inviteCode`/`cohortId`) | 201 | enrollment; 400 `'Track must be published'`; 409 `'Cohort is full'` / `'Already enrolled'` |
| GET | `/enrollments/me` | JWT | — | 200 | caller's enrollments |
| GET | `/enrollments/:id` | JWT | — | 200 | enrollment w/ `itemProgress`; 403 non-owner (admin allowed); 404 |
| GET | `/enrollments/:id/unlock-state` | JWT | — | 200 | per-day unlock state (owner/admin; Redis-cached 30s, authz precedes cache) |
| POST | `/enrollments/:id/items/:itemId/complete` | JWT | — | **200** | updated unlock state; lesson/exercise only else 422; 409 `'Day is locked'`; idempotent; owner-only |
| GET | `/admin/enrollments` | Admin | `?cohortId=&trackId=&after=&limit=` | 200 | cursor page |

## Quizzes

| Method | Path | Auth | Body | Success | Response / Errors |
|--------|------|------|------|---------|-------------------|
| POST | `/enrollments/:id/items/:itemId/quiz-attempts` | JWT | — | 201 | `{ _id, quizItemId, status, startedAt, timeLimitSec, serverNow, questions[] }` — sampled/shuffled, no answer keys; resumes an in-progress attempt; 409 `maxAttempts`; 422 empty pool / misconfigured |
| GET | `/quiz-attempts/:id` | JWT | — | 200 | candidate view + `serverNow`; **settled** adds per-question `correct` and the candidate's `answer` (never the key); owner/admin |
| POST | `/quiz-attempts/:id/submit` | JWT | `submitQuizSchema` | **200** | `{ score, correctCount, total, traitScores?, unlockState, attemptId }`; 400 `'Unknown question in answers'`; 409 settled / time-limit exceeded (+5s grace) |

`serverNow` (ISO8601, stamped at serialization) lets the client anchor its countdown to the
server clock rather than a possibly-skewed local clock.

## Submissions

| Method | Path | Auth | Body / Query | Success | Response / Errors |
|--------|------|------|--------------|---------|-------------------|
| POST | `/submissions` | JWT · throttled | `createSubmissionSchema` (regular or `final:true`) | 201 | queued submission; graded async via BullMQ + Judge0; 400 language/item guards; 409 `'Submission already in progress'`; **429** over limit |
| GET | `/submissions/:id` | JWT | — | 200 | submission; `testResults[]` rows carry explicit `hidden` — hidden rows are `{ caseIndex, status, hidden: true }` (no stdout), visible rows include `stdout`/`time`; owner/admin |
| GET | `/enrollments/:id/submissions` | JWT | `?problemId=&after=&limit=` | 200 | cursor page filtered server-side by `problemId` (invalid id → empty); owner/admin |
| GET | `/admin/submissions` | Admin | `?enrollmentId=&problemId=&after=&limit=` | 200 | cursor page |

## Assessments

| Method | Path | Auth | Success | Response / Errors |
|--------|------|------|---------|-------------------|
| GET | `/enrollments/:id/final-assessment` | JWT | 200 | capstone status surface (final quiz + coding); owner/admin; 404 |
| GET | `/enrollments/:id/result` | JWT | 200 | `{ weightedTotal, verdict, breakdown, personalityProfile?, failedMinimums }`; **404 `'Result not ready'`** until the worker finalizes (client polls); owner/admin |

## Audit (admin)

| Method | Path | Auth | Query | Success | Response |
|--------|------|------|-------|---------|----------|
| GET | `/admin/audit-logs` | Admin | `?entity=&actorId=&after=&limit=` | 200 | **newest-first** cursor page; each entry `{ actorId, action, entity, entityId, diff, at }`; `diff` is the sanitized request payload (password/token stripped), or `{ truncated, bytes }` when >10KB |

Every successful admin mutation (`POST/PATCH/PUT/DELETE` under `/admin/*`) is recorded by a
global interceptor.

## Analytics (admin)

| Method | Path | Auth | Query | Success | Response |
|--------|------|------|-------|---------|----------|
| GET | `/admin/analytics/overview` | Admin | — | 200 | user/track/cohort/enrollment/submission count batch |
| GET | `/admin/cohorts/:id/dashboard` | Admin | — | 200 | cohort stats + candidate rows w/ verdicts (Redis-cached 30s, busted on finalization); 404 |
| GET | `/admin/enrollments/:id/detail` | Admin | — | 200 | candidate drill-down — attempts (no questions/keys), submissions (no sourceCode), result |
| GET | `/admin/analytics/questions` | Admin | `?categoryId=&limit=` | 200 | per-question served/correctRate (top-N) |

## Health

| Method | Path | Auth | Success | Response |
|--------|------|------|---------|----------|
| GET | `/health` | Public | 200 | `{ status: 'ok' }` |
