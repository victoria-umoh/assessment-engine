import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EnrollmentCard } from '@/components/dashboard/enrollment-card';
import type { Enrollment, Track } from '@/lib/types';

const track = {
  _id: 't1',
  title: 'Frontend Bootcamp',
  durationDays: 7,
  days: [],
  scoring: { weights: {}, passThreshold: 0.7 },
  status: 'published',
} as unknown as Track;

function enrollment(overrides: Partial<Enrollment>): Enrollment {
  return {
    _id: 'e1',
    userId: 'u1',
    trackId: 't1',
    startDate: '2026-07-01T00:00:00.000Z',
    unlockedDay: 3,
    itemProgress: [],
    status: 'active',
    version: 0,
    ...overrides,
  };
}

describe('EnrollmentCard', () => {
  it('renders title, day progress, status badge, and links to the enrollment', () => {
    render(<EnrollmentCard enrollment={enrollment({})} track={track} />);
    expect(screen.getByText('Frontend Bootcamp')).toBeInTheDocument();
    expect(screen.getByText(/day 3 of 7/i)).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/enrollments/e1',
    );
    expect(screen.queryByRole('link', { name: /view result/i })).not.toBeInTheDocument();
  });

  it('shows a result link for settled enrollments', () => {
    render(<EnrollmentCard enrollment={enrollment({ status: 'failed' })} track={track} />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view result/i })).toHaveAttribute(
      'href',
      '/enrollments/e1/result',
    );
  });
});
