import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CohortForm } from '@/components/admin/cohort-form';

const TRACKS = [
  { _id: 't1', title: 'Onboarding', status: 'published' },
  { _id: 't2', title: 'Draft only', status: 'draft' },
];

describe('CohortForm', () => {
  it('offers only published tracks and omits default pacing from the dto', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CohortForm tracks={TRACKS} onSubmit={onSubmit} />);

    expect(screen.queryByRole('option', { name: 'Draft only' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Track'), 't1');
    await userEvent.type(screen.getByLabelText('Name'), 'July cohort');
    await userEvent.type(screen.getByLabelText('Start date'), '2026-07-10');
    await userEvent.type(screen.getByLabelText('Capacity (optional)'), '25');
    await userEvent.click(screen.getByRole('button', { name: /save cohort/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      trackId: 't1',
      name: 'July cohort',
      startDate: '2026-07-10',
      capacity: 25,
    });
  });

  it('a non-default unlock mode rides pacingOverrides', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CohortForm tracks={TRACKS} onSubmit={onSubmit} />);

    await userEvent.selectOptions(screen.getByLabelText('Track'), 't1');
    await userEvent.type(screen.getByLabelText('Name'), 'Fast cohort');
    await userEvent.type(screen.getByLabelText('Start date'), '2026-07-12');
    await userEvent.selectOptions(screen.getByLabelText('Unlock mode'), 'progress-only');
    await userEvent.click(screen.getByRole('button', { name: /save cohort/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      trackId: 't1',
      name: 'Fast cohort',
      startDate: '2026-07-12',
      pacingOverrides: { unlockMode: 'progress-only' },
    });
  });
});
