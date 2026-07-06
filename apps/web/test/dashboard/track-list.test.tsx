import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrackList } from '@/components/dashboard/track-list';
import type { Track } from '@/lib/types';

function track(id: string, title: string): Track {
  return {
    _id: id,
    title,
    durationDays: 7,
    days: [],
    scoring: { weights: {}, passThreshold: 0.7 },
    status: 'published',
  } as unknown as Track;
}

describe('TrackList', () => {
  it('hides already-enrolled tracks and enrolls via the button', async () => {
    const onEnroll = vi.fn();
    const user = userEvent.setup();
    render(
      <TrackList
        tracks={[track('t1', 'Enrolled Track'), track('t2', 'Open Track')]}
        enrolledTrackIds={new Set(['t1'])}
        onEnroll={onEnroll}
      />,
    );
    expect(screen.queryByText('Enrolled Track')).not.toBeInTheDocument();
    expect(screen.getByText('Open Track')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enroll/i }));
    expect(onEnroll).toHaveBeenCalledWith('t2');
  });
});
