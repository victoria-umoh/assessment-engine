import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Judge0Run {
  languageId: number;
  sourceCode: string;
  stdin: string;
  expectedOutput: string;
  cpuTimeLimit?: number;
  memoryLimit?: number;
  wallTimeLimit?: number;
}

export interface Judge0BatchResult {
  token: string;
  statusId: number;
  statusDescription: string;
  stdout: string | null;
  time: string | null;
  memory: number | null;
}

const JUDGE0_MAX_BATCH = 20;

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string | null) => (s === null ? null : Buffer.from(s, 'base64').toString('utf8'));

// Thin HTTP client for Judge0 CE. e2e suites replace this via DI override;
// only the phase-gate smoke exercises it against the compose container.
@Injectable()
export class Judge0Client {
  private baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('JUDGE0_URL')!.replace(/\/$/, '');
  }

  // Judge0's default MAX_SUBMISSION_BATCH_SIZE is 20 — larger problems must
  // be split or the whole batch 400s.
  async createBatch(runs: Judge0Run[]): Promise<string[]> {
    const tokens: string[] = [];
    for (let i = 0; i < runs.length; i += JUDGE0_MAX_BATCH) {
      tokens.push(...(await this.createBatchChunk(runs.slice(i, i + JUDGE0_MAX_BATCH))));
    }
    return tokens;
  }

  private async createBatchChunk(runs: Judge0Run[]): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/submissions/batch?base64_encoded=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        submissions: runs.map((r) => ({
          language_id: r.languageId,
          source_code: b64(r.sourceCode),
          stdin: b64(r.stdin),
          expected_output: b64(r.expectedOutput),
          ...(r.cpuTimeLimit ? { cpu_time_limit: r.cpuTimeLimit } : {}),
          ...(r.memoryLimit ? { memory_limit: r.memoryLimit } : {}),
          ...(r.wallTimeLimit ? { wall_time_limit: r.wallTimeLimit } : {}),
        })),
      }),
    });
    if (!res.ok) throw new Error(`Judge0 createBatch failed: ${res.status}`);
    const body = (await res.json()) as Array<{ token: string }>;
    return body.map((t) => t.token);
  }

  // Polls until every run reaches a terminal status (id >= 3); 60s budget,
  // then throws so the BullMQ job retries with backoff. Chunked ≤20 per GET —
  // Judge0 caps the batch GET at MAX_SUBMISSION_BATCH_SIZE exactly like the POST.
  async getBatch(tokens: string[]): Promise<Judge0BatchResult[]> {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const results: Judge0BatchResult[] = [];
      for (let i = 0; i < tokens.length; i += JUDGE0_MAX_BATCH) {
        results.push(...(await this.getBatchChunk(tokens.slice(i, i + JUDGE0_MAX_BATCH))));
      }
      if (results.every((r) => r.statusId >= 3)) return results;
      if (Date.now() > deadline) throw new Error('Judge0 polling timed out');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async getBatchChunk(tokens: string[]): Promise<Judge0BatchResult[]> {
    const fields = 'token,status_id,status,stdout,time,memory';
    const res = await fetch(
      `${this.baseUrl}/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=${fields}`,
    );
    if (!res.ok) throw new Error(`Judge0 getBatch failed: ${res.status}`);
    const body = (await res.json()) as {
      submissions: Array<{
        token: string;
        status_id: number;
        status?: { id: number; description: string };
        stdout: string | null;
        time: string | null;
        memory: number | null;
      }>;
    };
    return body.submissions.map((s) => ({
      token: s.token,
      statusId: s.status_id ?? s.status?.id ?? 0,
      statusDescription: s.status?.description ?? String(s.status_id ?? ''),
      stdout: unb64(s.stdout),
      time: s.time,
      memory: s.memory,
    }));
  }
}
