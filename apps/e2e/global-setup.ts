import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { startJudge0Stub } from './judge0-stub';
import { seed } from './seed';

// Boots the REAL stack for Playwright: api (:4000 — the standing web build
// inlines NEXT_PUBLIC_API_URL=http://localhost:4000), worker, next start
// (:3100), and an in-process Judge0 stub (:2359). Prereqs: `pnpm build`
// artifacts + mongo on 127.0.0.1:27017 + redis on 127.0.0.1:6379
// (infra/docker-compose or brew services — see docs/SETUP.md).

const ROOT = path.resolve(__dirname, '../..');
const API_PORT = 4000;
const WEB_PORT = 3100;
const JUDGE0_PORT = 2359;

const ENV = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(API_PORT),
  MONGO_URI: 'mongodb://127.0.0.1:27017/lms-e2e',
  REDIS_URL: 'redis://127.0.0.1:6379/1', // db 1: never share queues with dev
  JUDGE0_URL: `http://127.0.0.1:${JUDGE0_PORT}`,
  JWT_ACCESS_SECRET: 'e2e-access-secret-16chars!',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-16chars!',
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
};

const children: ChildProcess[] = [];
let stopStub: (() => Promise<void>) | null = null;

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitFor(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${label} did not become healthy at ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function launch(label: string, command: string, args: string[], cwd: string): ChildProcess {
  const child = spawn(command, args, { cwd, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(__dirname, `.${label}.log`));
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[e2e] ${label} exited with ${code} — see apps/e2e/.${label}.log`);
  });
  children.push(child);
  return child;
}

export default async function globalSetup(): Promise<void> {
  // Preflight: infra + build artifacts, with human-readable failures.
  if (!(await checkPort(27017))) {
    throw new Error(
      'MongoDB is not reachable on 127.0.0.1:27017 — start it (docker compose -f infra/docker-compose.yml up -d mongo, or brew services start mongodb-community).',
    );
  }
  if (!(await checkPort(6379))) {
    throw new Error('Redis is not reachable on 127.0.0.1:6379 — start it (docker compose -f infra/docker-compose.yml up -d redis).');
  }
  const apiMain = path.join(ROOT, 'apps/api/dist/main.js');
  const webBuild = path.join(ROOT, 'apps/web/.next');
  if (!fs.existsSync(apiMain) || !fs.existsSync(webBuild)) {
    throw new Error('Build artifacts missing — run `pnpm build` first.');
  }
  if (await checkPort(API_PORT)) {
    throw new Error(`Port ${API_PORT} is already in use — stop the dev api before running e2e.`);
  }

  stopStub = await startJudge0Stub(JUDGE0_PORT);

  launch('api', 'node', ['dist/main.js'], path.join(ROOT, 'apps/api'));
  launch('worker', 'node', ['dist/worker.main.js'], path.join(ROOT, 'apps/api'));
  launch(
    'web',
    path.join(ROOT, 'apps/web/node_modules/.bin/next'),
    ['start', '-p', String(WEB_PORT)],
    path.join(ROOT, 'apps/web'),
  );

  await waitFor(`http://127.0.0.1:${API_PORT}/health`, 'api');
  await waitFor(`http://localhost:${WEB_PORT}/login`, 'web');

  await seed();

  fs.writeFileSync(
    path.join(__dirname, '.pids.json'),
    JSON.stringify(children.map((c) => c.pid).filter(Boolean)),
  );
}

// Teardown lives in global-teardown.ts (separate module per playwright config),
// which reads .pids.json — but when setup itself fails, kill what we started.
process.on('exit', () => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  void stopStub?.();
});
