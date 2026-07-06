import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemRow } from '@/components/track/item-row';
import type { TrackItem } from '@/lib/types';

const quiz: TrackItem = { itemId: 'i2', type: 'quiz', config: {} };

describe('ItemRow', () => {
  it('links an unlocked item to its route with a score chip when graded', () => {
    render(
      <ItemRow
        item={quiz}
        progress={{ itemId: 'i2', status: 'completed', score: 80, attempts: 2 }}
        enrollmentId="e1"
        locked={false}
      />,
    );
    expect(screen.getByRole('link', { name: /quiz/i })).toHaveAttribute(
      'href',
      '/enrollments/e1/items/i2',
    );
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it('renders profile completions without a number and locked items without a link', () => {
    const { rerender } = render(
      <ItemRow
        item={quiz}
        progress={{ itemId: 'i2', status: 'completed', score: null, attempts: 1 }}
        enrollmentId="e1"
        locked={false}
      />,
    );
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<ItemRow item={quiz} enrollmentId="e1" locked={true} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/not started/i)).toBeInTheDocument();
  });
});
