import { tokenStore } from './tokens';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiInit {
  method?: string;
  body?: unknown;
}

// AuthProvider registers a redirect-to-login handler here; the client calls
// it whenever a session is unrecoverable (refresh failed or was replayed 401).
let authFailureHandler: (() => void) | null = null;
export function onAuthFailure(handler: () => void): void {
  authFailureHandler = handler;
}

async function rawFetch(path: string, init: ApiInit): Promise<Response> {
  const headers: Record<string, string> = {};
  // FormData passes through untouched: the browser sets the multipart
  // boundary itself, and a manual content-type would break it.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body !== undefined && !isForm) headers['content-type'] = 'application/json';
  const access = tokenStore.access;
  if (access) headers.Authorization = `Bearer ${access}`;
  return fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined
      ? { body: isForm ? (init.body as FormData) : JSON.stringify(init.body) }
      : {}),
  });
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const raw = (body as { message?: unknown } | undefined)?.message;
  const message = Array.isArray(raw)
    ? raw.join('; ')
    : typeof raw === 'string'
      ? raw
      : res.statusText;
  return new ApiError(res.status, message, body);
}

// Single-flight: the API rotates refresh tokens (exactly-one-winner claim),
// so concurrent 401s must share one refresh call — parallel refreshes would
// invalidate each other and log the user out.
// Outcomes are three-way: only a DEFINITIVE server rejection ('denied') kills
// the session; a network blip ('network') keeps tokens — the refresh token is
// still valid server-side and clearing it would log a candidate out mid-exam.
type RefreshOutcome = 'ok' | 'denied' | 'network';

let refreshInFlight: Promise<RefreshOutcome> | null = null;

async function doRefresh(refreshToken: string): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return 'network';
  }
  if (!res.ok) return 'denied';
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  tokenStore.set(data);
  return 'ok';
}

function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    const refreshToken = tokenStore.refresh;
    refreshInFlight = (refreshToken
      ? doRefresh(refreshToken)
      : Promise.resolve<RefreshOutcome>('denied')
    )
      .catch(() => 'network' as RefreshOutcome)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function failSession(): void {
  tokenStore.clear();
  authFailureHandler?.();
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  let res = await rawFetch(path, init);
  if (res.status === 401 && tokenStore.hasSession()) {
    const outcome = await refreshSession();
    if (outcome === 'denied') {
      failSession();
      throw await parseError(res);
    }
    if (outcome === 'network') {
      // Session intact — surface the original failure; the caller retries.
      throw await parseError(res);
    }
    res = await rawFetch(path, init);
    if (res.status === 401) failSession();
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}
