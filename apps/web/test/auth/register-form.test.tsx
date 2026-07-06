import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const registerFn = vi.fn();
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({
    user: null,
    status: 'anon',
    login: vi.fn(),
    register: registerFn,
    logout: vi.fn(),
  }),
}));

import { RegisterForm } from '@/components/auth/register-form';

describe('RegisterForm', () => {
  beforeEach(() => {
    push.mockReset();
    registerFn.mockReset();
  });

  it('blocks a short password inline; valid submit registers and redirects', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText(/name/i), 'Cand One');
    await user.type(screen.getByLabelText(/email/i), 'cand@test.local');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
    expect(registerFn).not.toHaveBeenCalled();

    registerFn.mockResolvedValueOnce(undefined);
    await user.clear(screen.getByLabelText(/password/i));
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(registerFn).toHaveBeenCalledWith({
        name: 'Cand One',
        email: 'cand@test.local',
        password: 'password123',
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });
});
