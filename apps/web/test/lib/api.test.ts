import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/tokens';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes the API base URL, JSON-encodes the body, and attaches the bearer token', async () => {
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiFetch<{ ok: boolean }>('/enrollments', {
      method: 'POST',
      body: { trackId: 't1' },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:4000/enrollments');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ trackId: 't1' }));
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers.Authorization).toBe('Bearer acc-1');
  });

  it('throws ApiError with status and message on non-2xx, joining NestJS array messages', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { message: 'Cohort is full' }));
    await expect(apiFetch('/enrollments', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Cohort is full',
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { message: ['title too short', 'estMinutes required'] }),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 400,
      message: 'title too short; estMinutes required',
    });
  });

  it('passes FormData bodies through untouched with no JSON content-type', async () => {
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { _id: 'm1' }));

    const form = new FormData();
    form.set('title', 'Reading');
    await apiFetch('/admin/materials/upload', { method: 'POST', body: form });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(form); // not JSON.stringify'd — browser sets the multipart boundary
    expect(init.headers['content-type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer acc-1');
  });

  it('on 401 refreshes once with the stored refresh token and replays the request', async () => {
    tokenStore.set({ accessToken: 'stale', refreshToken: 'ref-1' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: { id: 'u1' },
          accessToken: 'fresh',
          refreshToken: 'ref-2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: 42 }));

    const result = await apiFetch<{ data: number }>('/enrollments/me');

    expect(result).toEqual({ data: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(refreshUrl).toBe('http://localhost:4000/auth/refresh');
    expect(refreshInit.body).toBe(JSON.stringify({ refreshToken: 'ref-1' }));
    expect(refreshInit.headers.Authorization).toBeUndefined();
    const [, replayInit] = fetchMock.mock.calls[2];
    expect(replayInit.headers.Authorization).toBe('Bearer fresh');
    expect(tokenStore.refresh).toBe('ref-2');
  });

  it('clears tokens and fires the auth-failure handler when refresh fails', async () => {
    const { onAuthFailure } = await import('@/lib/api');
    const handler = vi.fn();
    onAuthFailure(handler);
    tokenStore.set({ accessToken: 'stale', refreshToken: 'dead' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid refresh token' }));

    await expect(apiFetch('/enrollments/me')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(tokenStore.hasSession()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // no replay after failed refresh
  });

  it('keeps the session when the refresh call fails at the NETWORK level (offline blip)', async () => {
    const { onAuthFailure } = await import('@/lib/api');
    const handler = vi.fn();
    onAuthFailure(handler);
    tokenStore.set({ accessToken: 'stale', refreshToken: 'still-valid' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch')); // refresh: network down

    await expect(apiFetch('/enrollments/me')).rejects.toBeTruthy();
    // A transient network error is NOT session death — the refresh token is
    // still valid server-side; clearing it would log a candidate out mid-exam.
    expect(tokenStore.refresh).toBe('still-valid');
    expect(handler).not.toHaveBeenCalled();
  });

  it('shares exactly one refresh call across concurrent 401s (single-flight)', async () => {
    tokenStore.set({ accessToken: 'stale', refreshToken: 'ref-1' });
    let resolveRefresh!: (r: Response) => void;
    const gated = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return gated;
      const headers = init?.headers as Record<string, string>;
      if (headers?.Authorization === 'Bearer fresh') {
        return Promise.resolve(jsonResponse(200, { ok: true }));
      }
      return Promise.resolve(jsonResponse(401, { message: 'Unauthorized' }));
    });

    const p1 = apiFetch('/a');
    const p2 = apiFetch('/b');
    await Promise.resolve();
    resolveRefresh(
      jsonResponse(200, { accessToken: 'fresh', refreshToken: 'ref-2' }),
    );
    await expect(Promise.all([p1, p2])).resolves.toEqual([{ ok: true }, { ok: true }]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
