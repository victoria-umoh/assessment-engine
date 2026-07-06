# Admin Guide

How to author content, build tracks, run cohorts, and monitor candidates. Everything here
is done through the admin panel at `/admin` (Phase 6) or the corresponding `/admin/*` API
routes. All admin routes require an `admin`-role account; candidates get 403.

## Prerequisites

1. **Seed the content bank** (12 categories + 311 questions, idempotent):

   ```bash
   pnpm --filter api seed
   ```

   Re-running updates seed content in place; admin-archived seed items stay archived.
   See `docs/SEED-BANK.md` for the bank's structure.

2. **Create the first admin.** `POST /auth/register` always creates a `candidate`, and an
   admin cannot change their *own* role — so the very first admin must be promoted directly
   in Mongo:

   ```bash
   mongosh lms --eval 'db.users.updateOne({email: "you@example.com"}, {$set: {role: "admin"}})'
   ```

   Every admin after that can be created in the UI (**Users → Create user**, role `admin`)
   or via `POST /admin/users` — that route accepts a `role` and verifies the password by
   running it through the normal login path.

   > Heads-up (macOS): a Homebrew `mongod` on `127.0.0.1:27017` shadows Docker's mongo for
   > localhost connections — see `docs/SETUP.md` if your update seems to have no effect.

## Categories

Categories partition the question pool and drive per-category scoring. The seed provides 12
(11 correctness-scored reasoning/aptitude categories + `personality`, which is
profile-scored across five trait dimensions: openness, conscientiousness, extraversion,
agreeableness, emotional-stability).

- Create: `POST /admin/categories` (key, name, scoring mode).
- Archive: `DELETE /admin/categories/:id` — hides it from listings; existing questions keep
  their `categoryId`.
- Candidates never see categories directly; they only matter for quiz sampling and scoring.

## Authoring questions

**Admin → Questions** (`/admin/questions`): filter by category/type/difficulty/status,
create, edit, archive, and view per-question stats.

Common fields: `prompt` (markdown), `categoryId`, `difficulty` (1–5), optional
`explanation` (shown to candidates in review — never before grading), `tags`, optional
`media` (`svg` or `imageUrl` + value) for visual questions (abstract/spatial reasoning).

Per type:

| Type | Fields | Grading |
|---|---|---|
| `mcq` | `options` (≥2), `correct` = **one** option index | exact match |
| `multi` | `options` (≥2), `correct` = array of option indexes | exact set match (no partial credit) |
| `text` | `correct` = array of accepted answer strings | case-insensitive match against any accepted answer |
| `likert` | `traitMapping` = `{ dimension, direction: 1 \| -1 }`, no `correct` | not right/wrong — feeds the personality profile; `direction: -1` reverse-scores the item |

Notes:

- **`type` and `materialId` are immutable after creation** — to change them, archive and
  recreate.
- Options are shuffled per attempt server-side; answer keys, explanations, and trait
  mappings never reach the candidate's browser.
- Archiving removes a question from the sampling pool; past attempts are unaffected.
- Questions with a `materialId` belong to a material's comprehension set and are sampled by
  **reading** items, not quiz items (author them from the material's page — see Materials).

**Question stats** (on the Questions page, also `GET /admin/analytics/questions`): how
often each question was served and its correct rate — use it to spot too-easy/too-hard or
ambiguous questions.

## Lessons

**Admin → Lessons** (`/admin/lessons`): title, estimated minutes, tags, and an ordered list
of content blocks:

- `markdown` — GFM markdown (raw HTML is not rendered).
- `video` — URL + optional caption (rendered in an iframe).
- `image` — URL + optional caption.

At least one block is required. Archive hides a lesson from candidates (their viewer 404s),
but a **published track that references it keeps working for existing enrollments** — swap
the reference in a new track version instead of archiving mid-cohort.

## Coding problems

**Admin → Coding** (`/admin/coding`): title, statement (markdown), category, difficulty.

- **Languages** — pick from the Judge0 map: `c` (50), `cpp` (54), `java` (62),
  `javascript` (63), `python` (71), `typescript` (74). Candidates can only submit in the
  languages you enable, and you can supply per-language `starterCode`.
- **Test cases** (≥1): `input` (stdin), `expectedOutput` (exact stdout match),
  `hidden` (default false), `weight` (default 1). Score = passed weight / total weight.
  Hidden cases are **never** sent to candidates — not the case, and not its stdout in
  results (they see pass/fail status only).
- **Limits** (defaults): `cpuTimeSec` 2, `wallTimeSec` 5, `memoryKb` 128000.

A failed *sandbox* (Judge0 internal error) marks the submission `error` and does **not**
consume the candidate's attempt; only real wrong answers count.

## Materials (reading)

**Admin → Materials** (`/admin/materials`). Three ways to create one:

- **Upload** — PDF, DOCX, Markdown, or plain text, ≤10 MB (`POST /admin/materials/upload`,
  multipart). Text is extracted into `extractedText`.
- **Generate** — give a topic, category, and question count (1–20) and Claude drafts the
  material plus comprehension questions (`POST /admin/materials/generate`). Requires
  `ANTHROPIC_API_KEY` on the API; returns 503 when unconfigured. **Always review generated
  content before using it in a track.**
- **Author** — write `content` directly in the editor.

Statuses: `processing` → `ready` (usable in tracks) or `failed` (see the failure banner).
The candidate-facing body is `content` when set, otherwise `extractedText` — editing
`content` supersedes the raw extraction.

**Comprehension questions:** from the material's detail page, link/unlink questions
(`linkedQuestionIds`) or create new ones with the `materialId` prefilled. A track
**reading** item shows the material, then runs a quiz sampled from exactly these linked
questions — a reading item with no linked questions has nothing to grade, so link at least
as many questions as the item's `count` before publishing.

Archive (`DELETE /admin/materials/:id`) hides the material from candidates (404).

## Building a track

**Admin → Tracks** (`/admin/tracks`): create a draft, then open the builder.

A track = `title`, `description`, `durationDays`, per-day item lists, scoring config, and
an optional capstone. **Drafts are freely editable; published tracks are content-frozen
(edits 409).** Item ids are server-generated on every draft save — never meaningful to you.

### Day items

Each day holds ordered items. Every item has `config.required` (default **true**) —
required items are what gates day unlocking and finalization; optional items never block.

| Type | Reference | Config keys |
|---|---|---|
| `lesson` | `refId` = lesson id (required) | `required` |
| `reading` | `refId` = material id (required) | `required` + the quiz config below (samples from the material's linked questions) |
| `quiz` | no ref — samples from the pool | `count` (1–50, default 10), `categoryIds` (pool filter), `difficulty` `{min,max}`, `timeLimitSec` (30–7200, default 900), `maxAttempts` (unlimited if unset), `required` |
| `coding` | `refId` = coding problem id (required) | `required` |
| `exercise` | none — self-reported | `instructions` (markdown shown to the candidate), `required` |

Quiz sampling avoids re-serving questions the candidate has already seen when the pool is
large enough — keep each sampled pool comfortably bigger than `count` for retakes to stay
fresh (see `docs/SEED-BANK.md` for per-category minimums).

### Scoring

- `weights` — exactly five keys: `quiz`, `coding`, `exercise`, `reading`,
  `finalAssessment`; **must sum to 1.0**. If a track has no items of some type, that
  type's weight is proportionally renormalized over the types that exist.
- `passThreshold` — 0–1; the weighted total at or above it is a pass (boundary passes).
- `categoryMinimums` (optional) — e.g. `{ "logical-reasoning": 0.6 }`; a candidate below
  any minimum **fails regardless of weighted total**, and the failed categories are listed
  on their result.

Personality items never affect pass/fail — they produce a 0–100 trait profile shown
alongside the verdict.

### Capstone (final assessment)

Optional `finalAssessment` = `quizConfig` (same keys as a quiz item's config) and/or
`codingProblemIds`. It unlocks only after **all required day items** are complete, and the
final verdict is computed once the final quiz is settled and every capstone problem is
graded. Its score enters via the `finalAssessment` weight.

### Publish

Publish validates and reports **all** problems in one 400:

- at least one day; days numbered contiguously 1..N; every day has ≥1 item;
- every `lesson`/`reading`/`coding` `refId` resolves to an existing document;
- weights sum to 1.

Once published, the track appears to candidates (without its capstone definition) and can
host cohorts. Archive retires it from candidate listings.

## Cohorts vs self-paced

Candidates can enroll two ways:

- **Self-paced** — enroll directly in a published track. The unlock clock anchors to their
  own enrollment date.
- **Cohort** — **Admin → Cohorts** (`/admin/cohorts`): pick a published track, name,
  `startDate` (future = `scheduled`, past/now = `active`), optional `endDate`, optional
  `capacity` (enforced race-safely at join — full cohort 409s). Each cohort gets a unique
  8-character invite code (copy it from the list) that candidates redeem on their
  dashboard. The unlock clock anchors to the cohort's `startDate`.

**Pacing** (`pacingOverrides.unlockMode`, default `hybrid`):

| Mode | Day N unlocks when… |
|---|---|
| `hybrid` (default) | previous day's required items are complete **and** the date gate is open |
| `progress-only` | previous day's required items are complete (no calendar) |
| `day-only` | the date gate is open (calendar only, progress ignored) |

The date gate for day N opens at anchor + (N−1) days. Day 1 is always open. Days never
skip: everything past the first locked day stays locked.

## Monitoring

- **Overview** (`/admin`): platform counts — users (total/admins/candidates/disabled),
  tracks (published/draft), cohorts (scheduled/active), enrollments
  (active/completed/failed), submissions in flight (queued/running).
- **Cohort dashboard** (`/admin/cohorts/[id]`): invite code, capacity, verdict tallies,
  and one row per candidate — name/email, enrollment status, unlocked day, required-item
  completion (`requiredComplete/requiredTotal`), weighted total and verdict once settled
  (blank while pending). Rows link to the candidate detail.
- **Candidate detail** (`/admin/enrollments/[id]` drill-down): item progress, every quiz
  attempt (scores only — answer keys stay server-side; trait-only attempts show
  `profile`), every submission (status/score, no source code in the projection), and the
  settled result card. "No result yet" until finalization runs.
- **Question stats** (Questions page): served count + correct rate per question,
  filterable by category.

Analytics aggregate on demand — at larger cohort sizes expect the dashboard to be the
slowest admin page (pre-aggregation is a Phase 7 item).

## User management

**Admin → Users** (`/admin/users`): search (email/name), filter by role/status, create
users, and change `role` / `status` inline.

- Roles: `admin`, `candidate`. Status: `active`, `disabled`.
- **You cannot change your own role or status** (400) — name edits on yourself are fine.
  This is why the first admin comes from mongosh.
- **Disable semantics:** disabling a user clears all their refresh sessions and blocks
  login, so they cannot get new tokens. An already-issued access token keeps working for
  its remaining lifetime — **up to a 15-minute tail** — after which every request 401s.
  Re-enabling restores login; they must sign in again.

## Audit log

**Admin → Audit** (`/admin/audit`): newest-first, filterable by entity, with cursor
paging (`GET /admin/audit-logs` supports `entity` and `actorId` filters).

- **Recorded:** every *successful* mutating request (`POST`/`PATCH`/`PUT`/`DELETE`) to any
  `/admin/*` route. Reads, candidate traffic, and auth traffic are not recorded.
- **Entry:** `action` (`METHOD /route/path`), `entity` (path segment, e.g. `users`),
  `actorId`, `entityId` (when the route targets one), `at`, and `diff`.
- **`diff` is the sanitized request payload** (passwords/tokens stripped), *not* a
  before/after delta — it shows what was submitted, not what changed.
- Audit writes never block the underlying mutation; a failed write is logged server-side.
