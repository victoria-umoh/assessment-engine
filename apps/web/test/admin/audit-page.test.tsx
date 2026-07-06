import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import AuditPage from '@/app/(admin)/admin/audit/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuditPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders entries with diff expanders and refetches on entity filter', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('entity=users')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'a2',
                actorId: 'u1',
                action: 'PATCH /admin/users/:id',
                entity: 'users',
                entityId: 'u9',
                diff: { role: 'admin' },
                at: '2026-07-05T10:00:00.000Z',
              },
            ],
            nextCursor: null,
          }),
        );
      }
      if (url.includes('/admin/audit-logs')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'a1',
                actorId: 'u1',
                action: 'POST /admin/questions',
                entity: 'questions',
                diff: { prompt: 'What is 2+2?' },
                at: '2026-07-05T09:00:00.000Z',
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
        <AuditPage />
      </Providers>,
    );

    expect(await screen.findByText('POST /admin/questions')).toBeInTheDocument();
    expect(screen.getByText(/What is 2\+2\?/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Entity'), 'users');
    expect(await screen.findByText('PATCH /admin/users/:id')).toBeInTheDocument();
  });
});
