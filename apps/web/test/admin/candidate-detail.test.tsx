import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ enrollmentId: 'e1' }),
}));

import CandidateDetailPage from '@/app/(admin)/admin/candidates/[enrollmentId]/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CandidateDetailPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('composes user, progress, attempts, submissions and the result card', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        enrollment: {
          _id: 'e1',
          userId: 'u1',
          trackId: 't1',
          startDate: '2026-07-01T00:00:00.000Z',
          unlockedDay: 2,
          itemProgress: [
            {
              itemId: 'i1',
              status: 'completed',
              score: 100,
              attempts: 1,
              completedAt: '2026-07-02T10:00:00.000Z',
            },
          ],
          status: 'completed',
          version: 3,
        },
        user: { _id: 'u1', email: 'ada@test.local', name: 'Ada' },
        track: { _id: 't1', title: 'Onboarding', durationDays: 2 },
        attempts: [
          {
            _id: 'qa1',
            quizItemId: 'i2',
            status: 'submitted',
            score: 90,
            startedAt: '2026-07-02T09:00:00.000Z',
            submittedAt: '2026-07-02T09:10:00.000Z',
          },
        ],
        submissions: [
          {
            _id: 's1',
            problemId: 'p1',
            itemId: 'i3',
            final: false,
            status: 'passed',
            score: 100,
            createdAt: '2026-07-02T11:00:00.000Z',
          },
        ],
        result: {
          enrollmentId: 'e1',
          breakdown: { 'logical-reasoning': 90 },
          weightedTotal: 0.9,
          verdict: 'pass',
          generatedAt: '2026-07-03T00:00:00.000Z',
        },
      }),
    );

    render(
      <Providers>
        <CandidateDetailPage />
      </Providers>,
    );

    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@test.local')).toBeInTheDocument();
    expect(screen.getByText(/Onboarding/)).toBeInTheDocument();
    // Item progress, attempts and submissions tables ('completed' also shows
    // as the enrollment status badge).
    expect(screen.getByRole('cell', { name: 'completed' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'submitted' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'passed' })).toBeInTheDocument();
    // ResultCard hero renders the verdict.
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });
});
