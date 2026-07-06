import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultCard } from '@/components/result/result-card';
import type { AssessmentResult, Track } from '@/lib/types';

const track = {
  _id: 't1',
  title: 'Frontend Bootcamp',
  durationDays: 7,
  days: [],
  scoring: {
    weights: { quiz: 0.6, coding: 0.4 },
    passThreshold: 0.7,
    categoryMinimums: { logical: 0.5 },
  },
  status: 'published',
} as unknown as Track;

function result(overrides: Partial<AssessmentResult>): AssessmentResult {
  return {
    enrollmentId: 'e1',
    breakdown: { logical: 80, verbal: 90 },
    weightedTotal: 84.5,
    verdict: 'pass',
    generatedAt: '2026-07-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('ResultCard', () => {
  it('renders a PASS verdict with the weighted total and per-category bars', () => {
    render(<ResultCard result={result({})} track={track} />);
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText(/84\.5/)).toBeInTheDocument();
    expect(screen.getByText(/pass mark: 70/i)).toBeInTheDocument();
    expect(screen.getByText('logical')).toBeInTheDocument();
    expect(screen.getByText('verbal')).toBeInTheDocument();
    expect(screen.queryByText(/below minimum/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/personality profile/i)).not.toBeInTheDocument();
  });

  it('tags categories below their minimum and renders the informative profile section', () => {
    render(
      <ResultCard
        result={result({
          verdict: 'fail',
          weightedTotal: 62,
          breakdown: { logical: 40, verbal: 90 },
          personalityProfile: { openness: 72, conscientiousness: 58 },
        })}
        track={track}
      />,
    );
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText(/logical: below minimum/i)).toBeInTheDocument();
    expect(screen.getByText(/personality profile/i)).toBeInTheDocument();
    expect(screen.getByText('openness')).toBeInTheDocument();
    expect(screen.getByText(/does not affect pass\/fail/i)).toBeInTheDocument();
  });
});
