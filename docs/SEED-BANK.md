# Seed Question Bank

The platform ships with a versioned bank of **311 questions across 12 assessment categories**,
committed as JSON under `apps/api/src/seed/data/` and loaded idempotently by the seed CLI.

## Running the seed

```bash
# requires MONGO_URI (and the rest of the API env) — see docs/SETUP.md
pnpm --filter api seed
```

The seed is **idempotent**: categories upsert by `key`, questions by `seedId`
(sparse-unique index on the `questions` collection). Re-running never duplicates.
Content edits to the JSON are applied in place on the next run; an admin-archived
seed question or category is *not* resurrected (status is only set on first insert).

## Per-category counts

| Category key | Questions | Item families |
|---|---|---|
| `logical-reasoning` | 26 | syllogisms, ordering puzzles, modus tollens |
| `verbal-reasoning` | 26 | analogies, synonyms, antonyms |
| `numerical-reasoning` | 26 | arithmetic series, percentages, ratios |
| `abstract-reasoning` | 26 | rotation sequences, symbol arithmetic, odd-one-out |
| `spatial-reasoning` | 26 | compass rotation, dice faces, grid coordinates |
| `pattern-recognition` | 26 | number/letter sequences, SVG dot matrices |
| `qualitative-reasoning` | 26 | qualitative comparisons, modus ponens, category claims |
| `quantitative-reasoning` | 26 | rates, fraction comparison, unit pricing |
| `computational-thinking` | 26 | loop traces, doubling traces, modulo traces |
| `aptitude` | 26 | mixed: series, percentages, ordering, doubling |
| `cognitive-ability` | 26 | attention (letter counts), digit recall, arithmetic chains |
| `personality` | 25 | Big Five Likert items (5 per dimension, direction-balanced) |
| **Total** | **311** | |

All correctness categories are `type: 'mcq'` with a single correct option.
`personality` items are `type: 'likert'` on a 5-point agree scale with a
`traitMapping` (`{ dimension, direction: 1 | -1 }`) instead of a correct answer —
each Big Five dimension has 3 positively keyed and 2 reverse-keyed statements.

## JSON entry shape

Each `questions.<category-key>.json` file is an array of entries:

```jsonc
{
  "seedId": "numerical-reasoning-001",   // stable upsert key: <category-key>-NNN
  "categoryKey": "numerical-reasoning",  // resolved to categoryId at seed time
  "type": "mcq",                          // or "likert" (personality only)
  "difficulty": 1,                        // integer 1–5
  "prompt": "What is the next number in the series: 12, 18, 24, 30, ... ?",
  "options": ["40", "41", "36", "34"],
  "correct": [2],                         // option indexes (never serialized to candidates)
  "explanation": "Each term increases by 6 …",
  "tags": ["series"],
  "media": [{ "kind": "svg", "value": "<svg …>" }]  // optional (pattern matrices)
}
```

This is the `createQuestionSchema` input (see `packages/shared/src/content.schemas.ts`)
plus `seedId` and `categoryKey`. `media` is carried outside the zod schema and validated
by the mongoose `Question` schema. The 12 categories themselves live in
`data/categories.json` (the exact keys are mandated by the spec — do not rename them).

## Regenerating / extending the bank

The committed JSON is the **source of truth**. A deterministic generator exists to
(re)produce it:

```bash
pnpm --filter api exec ts-node src/seed/generate-bank.ts
```

- Deterministic: seeded PRNG (`seedrandom`, seed `lms-seed-bank:<category-key>:v1`) —
  re-running emits byte-identical files.
- Every emitted item is self-validated against `createQuestionSchema`; the run fails
  if any category drops below 25 items or the total drops below 300.

**To add questions:**

1. *Hand-authored:* append entries to the relevant JSON file with fresh, never-reused
   `seedId`s (continue the `-NNN` numbering). Keep `correct` indexes in range and options
   unique. Re-run the seed.
2. *Generated:* extend the category builder in `generate-bank.ts` (or add a new template
   family), bump the PRNG seed version suffix (`:v1` → `:v2`) **only if** you intend to
   reshuffle existing items — otherwise existing `seedId`s keep their content stable —
   then re-run the generator and commit the diff.

Never delete or renumber existing `seedId`s: they are upsert keys, and attempts/quizzes
in later phases may reference the underlying questions.

## Randomization at assessment time

Per spec §5, quiz item *selection* (sampling by category/difficulty) and option *shuffling*
happen in the assessment engine at attempt time (Phase 4) — the bank stores canonical
option order, and `correct` indexes refer to that canonical order. Candidate-facing
serializations strip `correct`, `explanation`, and `traitMapping` via
`toCandidateQuestionView` (`apps/api/src/questions/question.views.ts`).
