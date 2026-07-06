import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import LessonsPage from '@/app/(admin)/admin/lessons/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('LessonsPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists lessons and archives a row', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/admin/lessons/l1') && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ _id: 'l1', status: 'archived' }));
      }
      if (url.includes('/admin/lessons')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'l1',
                title: 'Ratios 101',
                contentBlocks: [{ type: 'markdown', markdown: '# R' }],
                estMinutes: 12,
                tags: ['math'],
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
        <LessonsPage />
      </Providers>,
    );

    expect(await screen.findByText('Ratios 101')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    const deleteCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/admin/lessons/l1') && c[1]?.method === 'DELETE',
    );
    expect(deleteCall).toBeDefined();
  });
});
