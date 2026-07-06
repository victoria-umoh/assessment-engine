import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';
import { tokenStore } from '@/lib/tokens';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

function Probe() {
  const { user, status } = useAuth();
  return (
    <p>
      {status}:{user?.email ?? 'none'}
    </p>
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuthProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    push.mockReset();
  });

  it('hydrates the user from /auth/me when a session exists', async () => {
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { id: 'u1', email: 'c@test.local', name: 'C', role: 'candidate' }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('authed:c@test.local')).toBeInTheDocument();
  });

  it('is anon without a session (no fetch) and anon when /auth/me fails unrecoverably', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('anon:none')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    tokenStore.set({ accessToken: 'stale', refreshToken: 'dead' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid refresh token' }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('anon:none')).toBeInTheDocument();
    expect(tokenStore.hasSession()).toBe(false);
  });
});
