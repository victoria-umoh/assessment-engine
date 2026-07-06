import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ id: 'e1' }),
}));

import EnrollmentPage from '@/app/(candidate)/enrollments/[id]/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('EnrollmentPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders the track title and unlock-aware day list from the API', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/enrollments/e1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'e1',
            userId: 'u1',
            trackId: 't1',
            startDate: '2026-07-01T00:00:00.000Z',
            unlockedDay: 1,
            itemProgress: [],
            status: 'active',
            version: 0,
          }),
        );
      }
      if (url.endsWith('/tracks/t1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 't1',
            title: 'Frontend Bootcamp',
            durationDays: 2,
            days: [
              { dayNumber: 1, items: [{ itemId: 'i1', type: 'lesson', refId: 'l1', config: {} }] },
              { dayNumber: 2, items: [{ itemId: 'i2', type: 'quiz', config: {} }] },
            ],
            scoring: { weights: {}, passThreshold: 0.7 },
            status: 'published',
          }),
        );
      }
      if (url.endsWith('/enrollments/e1/unlock-state')) {
        return Promise.resolve(
          jsonResponse(200, {
            unlockedDay: 1,
            days: [
              { dayNumber: 1, unlocked: true, requiredComplete: 0, requiredTotal: 1, dateGateOpen: true },
              { dayNumber: 2, unlocked: false, requiredComplete: 0, requiredTotal: 1, dateGateOpen: false },
            ],
          }),
        );
      }
      if (url.endsWith('/final-assessment')) {
        return Promise.resolve(jsonResponse(404, { message: 'Track has no final assessment' }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <Providers>
        <EnrollmentPage />
      </Providers>,
    );

    expect(await screen.findByText('Frontend Bootcamp')).toBeInTheDocument();
    expect(await screen.findByText(/day 1/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lesson/i })).toHaveAttribute(
      'href',
      '/enrollments/e1/items/i1',
    );
    // no capstone → no final-assessment card
    expect(screen.queryByText(/final assessment/i)).not.toBeInTheDocument();
  });
});
