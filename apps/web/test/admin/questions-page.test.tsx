import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import QuestionsPage from '@/app/(admin)/admin/questions/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('QuestionsPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists pool questions and archives a row', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/categories')) {
        return Promise.resolve(
          jsonResponse([
            { _id: 'cat1', key: 'logical', name: 'Logical', scoringMode: 'correctness' },
          ]),
        );
      }
      if (url.includes('/admin/analytics/questions')) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes('/admin/questions/q1') && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ _id: 'q1', status: 'archived' }));
      }
      if (url.includes('/admin/questions')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'q1',
                type: 'mcq',
                categoryId: 'cat1',
                difficulty: 2,
                prompt: 'What is 15% of 200?',
                options: ['20', '30'],
                correct: [1],
                tags: [],
                source: 'admin',
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
        <QuestionsPage />
      </Providers>,
    );

    expect(await screen.findByText('What is 15% of 200?')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'mcq' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Logical' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /archive/i }));

    const deleteCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/admin/questions/q1') && c[1]?.method === 'DELETE',
    );
    expect(deleteCall).toBeDefined();
  });
});
