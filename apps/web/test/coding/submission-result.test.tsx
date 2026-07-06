import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubmissionResult } from '@/components/coding/submission-result';
import type { SubmissionView } from '@/lib/types';

function submission(overrides: Partial<SubmissionView>): SubmissionView {
  return {
    _id: 's1',
    enrollmentId: 'e1',
    itemId: 'i3',
    problemId: 'p1',
    final: false,
    language: 'python',
    status: 'passed',
    score: 100,
    testResults: [],
    ...overrides,
  };
}

describe('SubmissionResult', () => {
  it('renders per-case rows with stdout for visible cases and status-only for hidden ones', () => {
    render(
      <SubmissionResult
        submission={submission({
          status: 'failed',
          score: 33.3,
          testResults: [
            { caseIndex: 0, status: 'passed', stdout: '3\n', time: 0.02, hidden: false },
            { caseIndex: 1, status: 'failed', hidden: true }, // server masked this case
          ],
        })}
      />,
    );
    expect(screen.getByText(/33/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // visible stdout
    expect(screen.getByText(/hidden/i)).toBeInTheDocument();
  });

  it('labels off the explicit hidden flag — a visible case with no stdout shows (no output)', () => {
    render(
      <SubmissionResult
        submission={submission({
          status: 'passed',
          testResults: [{ caseIndex: 0, status: 'passed', hidden: false }],
        })}
      />,
    );
    expect(screen.getByText('(no output)')).toBeInTheDocument();
    expect(screen.queryByText(/^hidden$/i)).not.toBeInTheDocument();
  });

  it('renders the attempt-not-consumed note for error submissions', () => {
    render(<SubmissionResult submission={submission({ status: 'error', score: 0 })} />);
    expect(screen.getByText(/did not consume an attempt/i)).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it('does not crash on an unknown status (renders it as a neutral badge)', () => {
    render(
      <SubmissionResult
        submission={submission({ status: 'weird' as unknown as SubmissionView['status'] })}
      />,
    );
    expect(screen.getByText('weird')).toBeInTheDocument();
  });
});
