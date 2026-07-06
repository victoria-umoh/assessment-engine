import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import CohortsPage from '@/app/(admin)/admin/cohorts/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CohortsPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists cohorts with track titles and copies the invite code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/admin/tracks')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 't1',
                title: 'Onboarding',
                durationDays: 2,
                days: [],
                scoring: {
                  weights: { quiz: 1, coding: 0, exercise: 0, reading: 0, finalAssessment: 0 },
                  passThreshold: 0.7,
                },
                status: 'published',
              },
            ],
            nextCursor: null,
          }),
        );
      }
      if (url.includes('/admin/cohorts')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'c1',
                trackId: 't1',
                name: 'July cohort',
                startDate: '2026-07-10T00:00:00.000Z',
                capacity: 25,
                inviteCode: 'ABCD2345',
                status: 'scheduled',
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
        <CohortsPage />
      </Providers>,
    );

    expect(await screen.findByText('July cohort')).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Onboarding' })).toBeInTheDocument();
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /copy invite code/i }));
    expect(writeText).toHaveBeenCalledWith('ABCD2345');
  });
});
