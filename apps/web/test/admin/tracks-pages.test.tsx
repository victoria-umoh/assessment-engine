import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 't1' }),
}));

import TracksPage from '@/app/(admin)/admin/tracks/page';
import TrackBuilderPage from '@/app/(admin)/admin/tracks/[id]/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Tracks pages', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('list page renders tracks with status badges linking to the builder', async () => {
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
                status: 'draft',
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
        <TracksPage />
      </Providers>,
    );

    expect(await screen.findByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Onboarding' })).toHaveAttribute(
      'href',
      '/admin/tracks/t1',
    );
  });

  it('builder page loads the track and its ref options into the builder', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/admin/tracks/t1')) {
        return Promise.resolve(
          jsonResponse({
            _id: 't1',
            title: 'Onboarding',
            description: '',
            durationDays: 1,
            days: [{ dayNumber: 1, items: [] }],
            scoring: {
              weights: { quiz: 1, coding: 0, exercise: 0, reading: 0, finalAssessment: 0 },
              passThreshold: 0.7,
            },
            status: 'draft',
          }),
        );
      }
      if (url.includes('/admin/lessons')) {
        return Promise.resolve(
          jsonResponse({ items: [{ _id: 'l1', title: 'Intro lesson' }], nextCursor: null }),
        );
      }
      if (url.includes('/admin/materials')) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (url.includes('/admin/coding-problems')) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (url.endsWith('/categories')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <TrackBuilderPage />
      </Providers>,
    );

    expect(await screen.findByLabelText('Title')).toHaveValue('Onboarding');
    expect(screen.getByText('Day 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
  });
});
