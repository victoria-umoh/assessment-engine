import { describe, expect, it } from 'vitest';
import { tokenStore } from '@/lib/tokens';

describe('tokenStore', () => {
  it('round-trips set/get/clear against localStorage and reports hasSession', () => {
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
    expect(tokenStore.hasSession()).toBe(false);

    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    expect(tokenStore.access).toBe('acc-1');
    expect(tokenStore.refresh).toBe('ref-1');
    expect(tokenStore.hasSession()).toBe(true);
    expect(window.localStorage.getItem('lms.accessToken')).toBe('acc-1');
    expect(window.localStorage.getItem('lms.refreshToken')).toBe('ref-1');

    tokenStore.clear();
    expect(tokenStore.access).toBeNull();
    expect(tokenStore.hasSession()).toBe(false);
  });
});
