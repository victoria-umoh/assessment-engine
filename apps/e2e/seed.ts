import { MongoClient, ObjectId } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

// Seeds the isolated lms-e2e database through the RUNNING api (same surface an
// admin uses), after inserting the first admin directly (role promotion has no
// API by design — matches the documented mongosh bootstrap in ADMIN-GUIDE.md).

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
const MONGO_URI = process.env.E2E_MONGO_URI ?? 'mongodb://127.0.0.1:27017/lms-e2e';

export const ADMIN = { email: 'admin@e2e.local', password: 'admin-password-1' };

interface Fixtures {
  inviteCode: string;
  trackId: string;
  cohortId: string;
  categoryId: string;
  lessonId: string;
  materialId: string;
  problemId: string;
}

async function api<T>(
  pathName: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${API}${pathName}`, {
    ...rest,
    headers: {
      ...(rest.body && !(rest.body instanceof FormData)
        ? { 'content-type': 'application/json' }
        : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathName} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function seed(): Promise<Fixtures> {
  // 1. Clean slate + first admin (argon2 via the api package — same hasher).
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  await client.db().dropDatabase();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const argon2 = require(path.join(__dirname, '../api/node_modules/argon2'));
  await client.db().collection('users').insertOne({
    email: ADMIN.email,
    passwordHash: await argon2.hash(ADMIN.password),
    name: 'E2E Admin',
    role: 'admin',
    status: 'active',
    sessions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await client.close();

  const login = await api<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  const token = login.accessToken;

  // 2. Content: category + mcq pool.
  const category = await api<{ _id: string }>('/admin/categories', {
    method: 'POST',
    token,
    body: JSON.stringify({ key: 'e2e-logic', name: 'E2E Logic', scoringMode: 'correctness' }),
  });
  for (let i = 0; i < 4; i++) {
    await api('/admin/questions', {
      method: 'POST',
      token,
      body: JSON.stringify({
        type: 'mcq',
        categoryId: category._id,
        difficulty: 2,
        prompt: `E2E question ${i + 1}: pick Alpha`,
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        correct: [0],
        explanation: 'Alpha is always right in e2e.',
      }),
    });
  }

  // 3. Lesson.
  const lesson = await api<{ _id: string }>('/admin/lessons', {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: 'E2E Lesson',
      contentBlocks: [{ type: 'markdown', markdown: '# Welcome\n\nRead me, then continue.' }],
      estMinutes: 1,
    }),
  });

  // 4. Reading material: upload txt, then link two fresh comprehension
  // questions. These get their OWN category so the quiz's category-scoped
  // sampler never serves them (the quiz pulls only from e2e-logic).
  const readingCategory = await api<{ _id: string }>('/admin/categories', {
    method: 'POST',
    token,
    body: JSON.stringify({ key: 'e2e-reading', name: 'E2E Reading', scoringMode: 'correctness' }),
  });
  const form = new FormData();
  form.set('title', 'E2E Reading');
  form.set(
    'file',
    new File(['The sky in e2e-land is green. Remember: green.'], 'reading.txt', {
      type: 'text/plain',
    }),
  );
  const material = await api<{ _id: string }>('/admin/materials/upload', {
    method: 'POST',
    token,
    body: form,
  });
  const readingQs: string[] = [];
  for (let i = 0; i < 2; i++) {
    const q = await api<{ _id: string }>('/admin/questions', {
      method: 'POST',
      token,
      body: JSON.stringify({
        type: 'mcq',
        categoryId: readingCategory._id,
        materialId: material._id,
        difficulty: 1,
        prompt: `Reading check ${i + 1}: what color is the e2e sky?`,
        options: ['Green', 'Blue', 'Red', 'Gray'],
        correct: [0],
      }),
    });
    readingQs.push(q._id);
  }
  await api(`/admin/materials/${material._id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ linkedQuestionIds: readingQs }),
  });

  // 5. Coding problem (javascript; stub judge0 passes anything).
  const problem = await api<{ _id: string }>('/admin/coding-problems', {
    method: 'POST',
    token,
    body: JSON.stringify({
      title: 'E2E Echo',
      statement: 'Print exactly: hello',
      difficulty: 1,
      categoryId: category._id,
      languages: ['javascript'],
      starterCode: { javascript: "console.log('hello')" },
      // input must be non-empty: mongoose required:true rejects '' (schema wart)
      testCases: [{ input: 'go', expectedOutput: 'hello\n', hidden: false, weight: 1 }],
    }),
  });

  // 6. Published 1-day track: lesson → reading → quiz → coding, all required.
  const track = await api<{ _id: string; days: Array<{ items: Array<{ itemId: string }> }> }>(
    '/admin/tracks',
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        title: 'E2E Journey Track',
        description: 'One day, four items.',
        durationDays: 1,
        days: [
          {
            dayNumber: 1,
            items: [
              { type: 'lesson', refId: lesson._id },
              // reading items pool linked questions via refId = materialId
              { type: 'reading', refId: material._id },
              {
                type: 'quiz',
                config: { count: 2, categoryIds: [category._id], timeLimitSec: 300 },
              },
              { type: 'coding', refId: problem._id },
            ],
          },
        ],
        scoring: {
          weights: { quiz: 0.4, coding: 0.3, exercise: 0, reading: 0.3, finalAssessment: 0 },
          passThreshold: 0.6,
        },
      }),
    },
  );
  await api(`/admin/tracks/${track._id}/publish`, { method: 'POST', token });

  // 7. Cohort started yesterday → day 1 open, invite code ready.
  const cohort = await api<{ _id: string; inviteCode: string }>('/admin/cohorts', {
    method: 'POST',
    token,
    body: JSON.stringify({
      trackId: track._id,
      name: 'E2E Cohort',
      startDate: new Date(Date.now() - 86_400_000).toISOString(),
    }),
  });

  const fixtures: Fixtures = {
    inviteCode: cohort.inviteCode,
    trackId: track._id,
    cohortId: cohort._id,
    categoryId: category._id,
    lessonId: lesson._id,
    materialId: material._id,
    problemId: problem._id,
  };
  fs.writeFileSync(path.join(__dirname, '.fixtures.json'), JSON.stringify(fixtures, null, 2));
  return fixtures;
}

// ObjectId import kept for future fixture needs (and to fail fast if the
// mongodb driver is missing from devDependencies).
void ObjectId;
