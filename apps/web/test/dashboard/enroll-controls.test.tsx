import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EnrollControls } from '@/components/dashboard/enroll-controls';
import { ApiError } from '@/lib/api';

describe('EnrollControls', () => {
  it('joins by invite code, blocks empty input, and renders API errors verbatim', async () => {
    const onJoin = vi.fn().mockRejectedValueOnce(new ApiError(409, 'Cohort is full'));
    const user = userEvent.setup();
    render(<EnrollControls onJoin={onJoin} />);

    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(onJoin).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/invite code/i), 'AB2CD3EF');
    await user.click(screen.getByRole('button', { name: /join/i }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith('AB2CD3EF'));
    expect(await screen.findByText('Cohort is full')).toBeInTheDocument();
  });
});
