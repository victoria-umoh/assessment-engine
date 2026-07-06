import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Enrollment } from '@/lib/types';

vi.mock('@/components/quiz/quiz-runner', () => ({
  QuizRunner: ({ item }: { item: { itemId: string } }) => <p>quiz-runner-stub:{item.itemId}</p>,
}));
vi.mock('@/components/coding/coding-workspace', () => ({
  CodingWorkspace: ({ final, problemId }: { final?: boolean; problemId?: string }) => (
    <p>
      coding-stub:{problemId}:{String(final)}
    </p>
  ),
}));

import { CapstoneHub } from '@/components/final/capstone-hub';

const enrollment: Enrollment = {
  _id: 'e1',
  userId: 'u1',
  trackId: 't1',
  startDate: '2026-07-01T00:00:00.000Z',
  unlockedDay: 2,
  itemProgress: [],
  status: 'active',
  version: 0,
};

describe('CapstoneHub', () => {
  it('shows the locked message when the capstone is unavailable', () => {
    render(
      <CapstoneHub
        enrollment={enrollment}
        status={{ available: false, quiz: { config: { count: 10 }, attempted: false } }}
      />,
    );
    expect(screen.getByText(/complete all days first/i)).toBeInTheDocument();
  });

  it('shows the attempted quiz score and opens final coding parts with final set', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    render(
      <CapstoneHub
        enrollment={enrollment}
        status={{
          available: true,
          quiz: { config: { count: 10 }, attempted: true, score: 85 },
          coding: [{ problemId: 'p9', settled: false }],
        }}
      />,
    );
    expect(screen.getByText(/85/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open problem/i }));
    expect(screen.getByText('coding-stub:p9:true')).toBeInTheDocument();
  });

  it('re-enables Check result after a 404 (worker still finalizing)', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const { waitFor } = await import('@testing-library/react');
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Result not ready' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <CapstoneHub
        enrollment={enrollment}
        status={{
          available: true,
          quiz: { config: { count: 1 }, attempted: true, score: 100 },
        }}
      />,
    );
    const button = screen.getByRole('button', { name: /check result/i });
    await user.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(button).toBeEnabled());
  });
});
