import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { ExercisePanel } from '@/components/items/exercise-panel';
import type { Enrollment, TrackItem } from '@/lib/types';

const item: TrackItem = {
  itemId: 'i4',
  type: 'exercise',
  config: { instructions: 'Build a todo list locally and check it off.' },
};

function enrollment(progressStatus?: string): Enrollment {
  return {
    _id: 'e1',
    userId: 'u1',
    trackId: 't1',
    startDate: '2026-07-01T00:00:00.000Z',
    unlockedDay: 1,
    itemProgress: progressStatus
      ? [{ itemId: 'i4', status: progressStatus, attempts: 1 }]
      : [],
    status: 'active',
    version: 0,
  };
}

describe('ExercisePanel', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('shows config instructions and renders already-completed state without any POST', () => {
    render(
      <Providers>
        <ExercisePanel enrollment={enrollment('completed')} item={item} />
      </Providers>,
    );
    expect(screen.getByText(/build a todo list locally/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /completed/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
