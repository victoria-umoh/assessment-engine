import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const login = vi.fn();
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: null, status: 'anon', login, register: vi.fn(), logout: vi.fn() }),
}));

import { LoginForm } from '@/components/auth/login-form';

describe('LoginForm', () => {
  beforeEach(() => {
    push.mockReset();
    login.mockReset();
  });

  it('blocks submit with an inline error on invalid email and never calls login', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in and redirects to the dashboard; API errors render verbatim', async () => {
    login.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'cand@test.local');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'cand@test.local', password: 'password123' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));

    login.mockRejectedValueOnce(new Error('Invalid credentials'));
    await user.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
