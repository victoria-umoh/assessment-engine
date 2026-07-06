import fs from 'node:fs';
import path from 'node:path';

// Kills the processes global-setup spawned (pids persisted to .pids.json —
// setup and teardown run in the same runner process, but the file survives
// crashes and makes a wedged run recoverable by hand).
export default async function globalTeardown(): Promise<void> {
  const pidsFile = path.join(__dirname, '.pids.json');
  if (!fs.existsSync(pidsFile)) return;
  const pids = JSON.parse(fs.readFileSync(pidsFile, 'utf8')) as number[];
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  fs.unlinkSync(pidsFile);
}
