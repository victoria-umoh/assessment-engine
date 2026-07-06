import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import CodingPage from '@/app/(admin)/admin/coding/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CodingPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists problems and archives a row', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/categories')) return Promise.resolve(jsonResponse([]));
      if (url.includes('/admin/coding-problems/p1') && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ _id: 'p1', status: 'archived' }));
      }
      if (url.includes('/admin/coding-problems')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'p1',
                title: 'Sum two numbers',
                statement: 'Add.',
                difficulty: 2,
                categoryId: 'cat1',
                languages: ['python', 'javascript'],
                starterCode: {},
                testCases: [{ input: '1 2', expectedOutput: '3', hidden: false, weight: 1 }],
                limits: { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
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
        <CodingPage />
      </Providers>,
    );

    expect(await screen.findByText('Sum two numbers')).toBeInTheDocument();
    expect(screen.getByText('python, javascript')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    const deleteCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/admin/coding-problems/p1') && c[1]?.method === 'DELETE',
    );
    expect(deleteCall).toBeDefined();
  });
});
