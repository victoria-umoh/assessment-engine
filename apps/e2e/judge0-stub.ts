import http from 'node:http';
import { randomUUID } from 'node:crypto';

// Deterministic Judge0 CE stand-in for e2e: every run "passes" by echoing its
// own expected_output as stdout with status 3 (Accepted). Mirrors exactly the
// two endpoints apps/api/src/submissions/judge0.client.ts calls. The REAL
// Judge0 transport was live-verified in the P4/P5 gates; e2e needs the
// deterministic pass path (isolate cannot execute on this Apple Silicon host).

interface StoredRun {
  expectedOutputB64: string;
}

export function startJudge0Stub(port: number): Promise<() => Promise<void>> {
  const runs = new Map<string, StoredRun>();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

    if (req.method === 'POST' && url.pathname === '/submissions/batch') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body) as {
          submissions: Array<{ expected_output: string }>;
        };
        const tokens = parsed.submissions.map((s) => {
          const token = randomUUID();
          runs.set(token, { expectedOutputB64: s.expected_output });
          return { token };
        });
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(tokens));
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/submissions/batch') {
      const tokens = (url.searchParams.get('tokens') ?? '').split(',').filter(Boolean);
      const submissions = tokens.map((token) => ({
        token,
        status_id: 3,
        status: { id: 3, description: 'Accepted' },
        stdout: runs.get(token)?.expectedOutputB64 ?? null, // already base64 (client sent it b64)
        time: '0.01',
        memory: 1024,
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ submissions }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve(
        () =>
          new Promise<void>((res2) => {
            server.close(() => res2());
          }),
      );
    });
  });
}
