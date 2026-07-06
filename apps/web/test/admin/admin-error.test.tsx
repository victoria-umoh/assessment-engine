import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

import AdminError from '@/app/(admin)/error';
import { ApiError } from '@/lib/api';

describe('(admin) error boundary', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('redirects to /login on an auth failure instead of crashing the page', () => {
    // P6 gate rider: an expired session made admin pages hit Next's error
    // boundary; a 401 must route to login, not show an error screen.
    render(<AdminError error={new ApiError(401, 'Unauthorized')} reset={() => {}} />);
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('shows the error message with a retry button for non-auth failures', () => {
    const reset = vi.fn();
    render(<AdminError error={new Error('Aggregation exploded')} reset={reset} />);
    expect(screen.getByText('Aggregation exploded')).toBeInTheDocument();
    screen.getByRole('button', { name: /try again/i }).click();
    expect(reset).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
