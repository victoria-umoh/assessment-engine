// The only module that touches localStorage. Access tokens are 15-minute;
// the refresh token is the session marker. SSR-safe: all members no-op
// without a window (pages render a static shell before hydration).

const ACCESS_KEY = 'lms.accessToken';
const REFRESH_KEY = 'lms.refreshToken';

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export const tokenStore = {
  get access(): string | null {
    return storage()?.getItem(ACCESS_KEY) ?? null;
  },
  get refresh(): string | null {
    return storage()?.getItem(REFRESH_KEY) ?? null;
  },
  set(tokens: { accessToken: string; refreshToken: string }): void {
    storage()?.setItem(ACCESS_KEY, tokens.accessToken);
    storage()?.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    storage()?.removeItem(ACCESS_KEY);
    storage()?.removeItem(REFRESH_KEY);
  },
  hasSession(): boolean {
    return this.refresh !== null;
  },
};
