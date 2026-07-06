import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import type { PublicUser } from '@/lib/types';

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@x.co', name: 'Ada', role: 'admin' } satisfies PublicUser,
    status: 'authed',
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

import UsersPage from '@/app/(admin)/admin/users/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('UsersPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists users and creating a duplicate surfaces the 409 verbatim', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(jsonResponse(409, { message: 'Email already registered' }));
      }
      if (url.includes('/admin/users')) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                _id: 'u2',
                email: 'cami@test.local',
                name: 'Cami',
                role: 'candidate',
                status: 'active',
              },
            ],
            nextCursor: null,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <UsersPage />
      </Providers>,
    );

    expect(await screen.findByText('cami@test.local')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /new user/i }));
    await userEvent.type(screen.getByLabelText('Email'), 'cami@test.local');
    await userEvent.type(screen.getByLabelText('Name'), 'Cami 2');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
  });
});
