import { ConfigService } from '@nestjs/config';
import { Judge0Client, Judge0Run } from './judge0.client';

describe('Judge0Client.createBatch', () => {
  const config = { get: () => 'http://judge0.test' } as unknown as ConfigService;
  const run = (i: number): Judge0Run => ({
    languageId: 63,
    sourceCode: `source-${i}`,
    stdin: '',
    expectedOutput: '',
  });

  afterEach(() => jest.restoreAllMocks());

  it('chunks more than 20 runs into sequential ≤20-run POSTs, tokens in order', async () => {
    let counter = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return {
        ok: true,
        json: async () => body.submissions.map(() => ({ token: `t${counter++}` })),
      } as unknown as Response;
    });

    const client = new Judge0Client(config);
    const tokens = await client.createBatch(Array.from({ length: 45 }, (_, i) => run(i)));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).submissions.length,
    );
    expect(sizes).toEqual([20, 20, 5]);
    expect(tokens).toHaveLength(45);
    expect(tokens[0]).toBe('t0');
    expect(tokens[44]).toBe('t44');
  });
});

describe('Judge0Client.getBatch', () => {
  const config = { get: () => 'http://judge0.test' } as unknown as ConfigService;
  afterEach(() => jest.restoreAllMocks());

  it('chunks >20 tokens into ≤20-token GETs and concatenates results in order', async () => {
    const tokens = Array.from({ length: 45 }, (_, i) => `tok-${i}`);
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const requested = new URL(String(url)).searchParams.get('tokens')!.split(',');
      return {
        ok: true,
        json: async () => ({
          submissions: requested.map((token) => ({
            token,
            status_id: 3,
            status: { id: 3, description: 'Accepted' },
            stdout: null,
            time: '0.01',
            memory: 1000,
          })),
        }),
      } as unknown as Response;
    });

    const client = new Judge0Client(config);
    const results = await client.getBatch(tokens);

    // Judge0 caps the batch GET at 20 exactly as the POST — must be 3 requests.
    const sizes = fetchMock.mock.calls.map(
      ([url]) => new URL(String(url)).searchParams.get('tokens')!.split(',').length,
    );
    expect(sizes).toEqual([20, 20, 5]);
    expect(results.map((r) => r.token)).toEqual(tokens); // order preserved
  });
});
