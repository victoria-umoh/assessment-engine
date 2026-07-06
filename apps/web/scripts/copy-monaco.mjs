// Copy Monaco's AMD bundle into public/ so the editor loads from OUR origin,
// not cdn.jsdelivr.net — candidates may sit behind restrictive networks and
// the exam editor must not depend on third-party availability.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = join(root, 'public', 'monaco', 'vs');

if (!existsSync(src)) {
  console.error('[copy-monaco] monaco-editor not installed?');
  process.exit(1);
}
cpSync(src, dest, { recursive: true });
console.log('[copy-monaco] public/monaco/vs ready');
