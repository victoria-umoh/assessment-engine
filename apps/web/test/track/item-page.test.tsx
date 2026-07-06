import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ id: 'e1', itemId: 'i-quiz' }),
}));

import ItemPage from '@/app/(candidate)/enrollments/[id]/items/[itemId]/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ItemPage shell', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/enrollments/e1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'e1',
            userId: 'u1',
            trackId: 't1',
            startDate: '2026-07-01T00:00:00.000Z',
            unlockedDay: 1,
            itemProgress: [{ itemId: 'i-quiz', status: 'in-progress', attempts: 1 }],
            status: 'active',
            version: 0,
          }),
        );
      }
      if (url.endsWith('/tracks/t1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 't1',
            title: 'Track',
            durationDays: 1,
            days: [
              {
                dayNumber: 1,
                items: [{ itemId: 'i-quiz', type: 'quiz', config: { count: 5 } }],
              },
            ],
            scoring: { weights: {}, passThreshold: 0.7 },
            status: 'published',
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });
  });

  it('resolves the item across days and renders the type header with a back link', async () => {
    render(
      <Providers>
        <ItemPage />
      </Providers>,
    );
    expect(await screen.findByText(/day 1 · quiz/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to track/i })).toHaveAttribute(
      'href',
      '/enrollments/e1',
    );
  });
});
