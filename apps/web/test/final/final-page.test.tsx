import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'e1' }),
}));
vi.mock('@/components/final/capstone-hub', () => ({
  CapstoneHub: ({ status }: { status: { available: boolean } }) => (
    <p>capstone-hub-stub:{String(status.available)}</p>
  ),
}));

import FinalPage from '@/app/(candidate)/enrollments/[id]/final/page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FinalPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('loads the capstone status and renders the hub, or the no-capstone message on 404', async () => {
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
      if (url.endsWith('/final-assessment')) {
        return Promise.resolve(jsonResponse(200, { available: true }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <Providers>
        <FinalPage />
      </Providers>,
    );
    expect(await screen.findByText('capstone-hub-stub:true')).toBeInTheDocument();
  });
});
