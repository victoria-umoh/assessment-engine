import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import DashboardPage from '@/app/(candidate)/dashboard/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DashboardPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists my enrollments with track titles and offers unenrolled tracks', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/enrollments/me')) {
        return Promise.resolve(
          jsonResponse([
            {
              _id: 'e1',
              userId: 'u1',
              trackId: 't1',
              startDate: '2026-07-01T00:00:00.000Z',
              unlockedDay: 2,
              itemProgress: [],
              status: 'active',
              version: 0,
            },
          ]),
        );
      }
      if (url.endsWith('/tracks/t1')) {
        return Promise.resolve(
          jsonResponse({
            _id: 't1',
            title: 'Enrolled Track',
            durationDays: 7,
            days: [],
            scoring: { weights: {}, passThreshold: 0.7 },
            status: 'published',
          }),
        );
      }
      if (url.endsWith('/tracks')) {
        return Promise.resolve(
          jsonResponse([
            {
              _id: 't1',
              title: 'Enrolled Track',
              durationDays: 7,
              days: [],
              scoring: { weights: {}, passThreshold: 0.7 },
              status: 'published',
            },
            {
              _id: 't2',
              title: 'Open Track',
              durationDays: 5,
              days: [],
              scoring: { weights: {}, passThreshold: 0.7 },
              status: 'published',
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <Providers>
        <DashboardPage />
      </Providers>,
    );

    expect(await screen.findByText('Enrolled Track')).toBeInTheDocument();
    expect(await screen.findByText('Open Track')).toBeInTheDocument();
    expect(screen.getByText(/day 2 of 7/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    // t1 is enrolled → only one Enroll button (for t2)
    expect(screen.getAllByRole('button', { name: /^enroll$/i })).toHaveLength(1);
  });
});
