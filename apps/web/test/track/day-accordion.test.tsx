import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DayAccordion } from '@/components/track/day-accordion';
import type { Track, UnlockState } from '@/lib/types';

const track = {
  _id: 't1',
  title: 'Track',
  durationDays: 3,
  days: [
    {
      dayNumber: 1,
      items: [
        { itemId: 'i1', type: 'lesson', refId: 'l1', config: {} },
        { itemId: 'i2', type: 'quiz', config: {} },
      ],
    },
    {
      dayNumber: 2,
      items: [
        { itemId: 'i3', type: 'coding', refId: 'c1', config: {} },
        { itemId: 'i4', type: 'exercise', config: {} },
        { itemId: 'i5', type: 'reading', refId: 'm1', config: { required: false } },
      ],
    },
    { dayNumber: 3, items: [{ itemId: 'i6', type: 'quiz', config: {} }] },
  ],
  scoring: { weights: {}, passThreshold: 0.7 },
  status: 'published',
} as unknown as Track;

const unlockState: UnlockState = {
  unlockedDay: 2,
  days: [
    { dayNumber: 1, unlocked: true, requiredComplete: 2, requiredTotal: 2, dateGateOpen: true },
    { dayNumber: 2, unlocked: true, requiredComplete: 1, requiredTotal: 2, dateGateOpen: true },
    { dayNumber: 3, unlocked: false, requiredComplete: 0, requiredTotal: 1, dateGateOpen: false },
  ],
};

describe('DayAccordion', () => {
  it('links items on unlocked days, locks gated days with the reason, and shows required chips', () => {
    render(
      <DayAccordion
        track={track}
        unlockState={unlockState}
        itemProgress={[
          { itemId: 'i1', status: 'completed', score: null, attempts: 1 },
          { itemId: 'i2', status: 'completed', score: 80, attempts: 2 },
          { itemId: 'i3', status: 'completed', score: 100, attempts: 1 },
        ]}
        enrollmentId="e1"
        startDate="2026-07-01T00:00:00.000Z"
      />,
    );
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    // Unlocked day items link to the item route
    expect(screen.getByRole('link', { name: /lesson/i })).toHaveAttribute(
      'href',
      '/enrollments/e1/items/i1',
    );
    // Locked, date-gated day: no links, shows an "opens" date (start + 2d)
    expect(screen.queryByRole('link', { name: /i6|day 3 quiz/i })).not.toBeInTheDocument();
    expect(screen.getByText(/opens/i)).toBeInTheDocument();
  });
});
