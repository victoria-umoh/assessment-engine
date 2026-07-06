import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import type { Enrollment, TrackItem } from '@/lib/types';

vi.mock('@/components/quiz/quiz-runner', () => ({
  QuizRunner: ({ item }: { item: TrackItem }) => (
    <p>quiz-runner-stub:{item.itemId}</p>
  ),
}));

import { ReadingViewer } from '@/components/items/reading-viewer';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const enrollment: Enrollment = {
  _id: 'e1',
  userId: 'u1',
  trackId: 't1',
  startDate: '2026-07-01T00:00:00.000Z',
  unlockedDay: 1,
  itemProgress: [],
  status: 'active',
  version: 0,
};

const item: TrackItem = { itemId: 'i5', type: 'reading', refId: 'm1', config: {} };

describe('ReadingViewer', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders the material body then chains into the quiz runner on continue', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/materials/m1')) {
        return Promise.resolve(
          jsonResponse(200, { _id: 'm1', title: 'Sets', body: '# Sets\nA set is a collection.' }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <ReadingViewer enrollment={enrollment} item={item} />
      </Providers>,
    );

    expect((await screen.findAllByRole('heading', { name: 'Sets' })).length).toBeGreaterThan(0);
    expect(screen.getByText(/a set is a collection/i)).toBeInTheDocument();
    expect(screen.queryByText(/quiz-runner-stub/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /continue to questions/i }));
    expect(screen.getByText('quiz-runner-stub:i5')).toBeInTheDocument();
  });

  it('shows the unavailable state with the API message when the material 404s', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(404, { message: 'Material not found' })),
    );
    render(
      <Providers>
        <ReadingViewer enrollment={enrollment} item={item} />
      </Providers>,
    );
    expect(await screen.findByText(/material unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Material not found/)).toBeInTheDocument();
  });
});
