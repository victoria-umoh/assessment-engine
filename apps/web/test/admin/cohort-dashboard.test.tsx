import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'c1' }),
}));

import CohortDashboardPage from '@/app/(admin)/admin/cohorts/[id]/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CohortDashboardPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders cohort stats and candidate rows with progress and verdicts', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        cohort: {
          _id: 'c1',
          name: 'July cohort',
          trackId: 't1',
          trackTitle: 'Onboarding',
          startDate: '2026-07-10T00:00:00.000Z',
          status: 'active',
          capacity: 25,
          inviteCode: 'ABCD2345',
        },
        stats: {
          enrolled: 2,
          byStatus: { active: 2 },
          verdicts: { pass: 1, fail: 0, pending: 1 },
          // scoring.engine weightedTotal is 0–100, NOT 0–1.
          avgWeightedTotal: 90,
        },
        candidates: [
          {
            enrollmentId: 'e1',
            userId: 'u1',
            email: 'ada@test.local',
            name: 'Ada',
            status: 'active',
            unlockedDay: 2,
            requiredComplete: 1,
            requiredTotal: 2,
            weightedTotal: 90,
            verdict: 'pass',
          },
          {
            enrollmentId: 'e2',
            userId: 'u2',
            email: 'bo@test.local',
            name: 'Bo',
            status: 'active',
            unlockedDay: 1,
            requiredComplete: 0,
            requiredTotal: 2,
          },
        ],
      }),
    );

    render(
      <Providers>
        <CohortDashboardPage />
      </Providers>,
    );

    expect(await screen.findByText('July cohort')).toBeInTheDocument();
    expect(screen.getByText(/Onboarding/)).toBeInTheDocument();
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();
    // Stat row: pass/pending counts and average.
    expect(screen.getByText('Pass')).toBeInTheDocument();
    // 90% appears as the average stat and in Ada's row.
    expect(screen.getAllByText('90%').length).toBeGreaterThanOrEqual(2);
    // Candidate rows link to the drill-down and show progress fractions.
    expect(screen.getByText('ada@test.local')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute(
      'href',
      '/admin/candidates/e1',
    );
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
