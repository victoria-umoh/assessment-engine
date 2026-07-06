import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'e1' }),
}));

import ResultPage from '@/app/(candidate)/enrollments/[id]/result/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ResultPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('shows the finalizing state on 404 and the verdict once the result exists', async () => {
    let ready = false;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/enrollments/e1/result')) {
        return Promise.resolve(
          ready
            ? jsonResponse(200, {
                enrollmentId: 'e1',
                breakdown: { logical: 88 },
                weightedTotal: 88,
                verdict: 'pass',
                generatedAt: '2026-07-04T12:00:00.000Z',
              })
            : jsonResponse(404, { message: 'Result not ready' }),
        );
      }
      if (url.endsWith('/enrollments/e1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'e1',
            userId: 'u1',
            trackId: 't1',
            startDate: '2026-07-01T00:00:00.000Z',
            unlockedDay: 1,
            itemProgress: [],
            status: 'completed',
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
            days: [],
            scoring: { weights: {}, passThreshold: 0.7 },
            status: 'published',
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <Providers>
        <ResultPage />
      </Providers>,
    );

    expect(await screen.findByText(/finalizing your assessment/i)).toBeInTheDocument();

    ready = true;
    // The pending state polls every 5s; the verdict appears on the next poll.
    expect(await screen.findByText('PASS', {}, { timeout: 7000 })).toBeInTheDocument();
    expect(screen.getByText('logical')).toBeInTheDocument();
  }, 12000);
});
