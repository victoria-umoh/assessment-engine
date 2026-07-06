import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackScoring } from '@/lib/types';
import { ScoringEditor } from '@/components/admin/scoring-editor';

const SCORING: TrackScoring = {
  weights: { quiz: 0.5, coding: 0.3, exercise: 0.2, reading: 0, finalAssessment: 0 },
  passThreshold: 0.7,
};

function Harness({ onChange }: { onChange: (next: TrackScoring) => void }) {
  const [scoring, setScoring] = useState(SCORING);
  return (
    <ScoringEditor
      scoring={scoring}
      onChange={(next) => {
        setScoring(next);
        onChange(next);
      }}
    />
  );
}

describe('ScoringEditor', () => {
  it('edits a weight, warns when the sum breaks 1, and clears when it balances', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(screen.queryByText('weights must sum to 1')).not.toBeInTheDocument();

    const quiz = screen.getByLabelText('quiz weight');
    await userEvent.clear(quiz);
    await userEvent.type(quiz, '0.6');
    expect(onChange).toHaveBeenLastCalledWith({
      ...SCORING,
      weights: { ...SCORING.weights, quiz: 0.6 },
    });
    // Sum is now 1.1 — the shared schema's exact copy shows live.
    expect(screen.getByText('weights must sum to 1')).toBeInTheDocument();

    const coding = screen.getByLabelText('coding weight');
    await userEvent.clear(coding);
    await userEvent.type(coding, '0.2');
    expect(screen.queryByText('weights must sum to 1')).not.toBeInTheDocument();
  });
});
