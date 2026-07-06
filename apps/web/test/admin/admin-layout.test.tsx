import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@/lib/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/admin/questions',
}));

let authState: { user: PublicUser | null; status: 'loading' | 'authed' | 'anon' };
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ ...authState, login: vi.fn(), register: vi.fn(), logout: vi.fn() }),
}));

import AdminLayout from '@/app/(admin)/layout';

describe('AdminLayout', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('renders the nav for admins with the active link highlighted', () => {
    authState = {
      user: { id: 'u1', email: 'a@x.co', name: 'Ada Admin', role: 'admin' },
      status: 'authed',
    };
    render(<AdminLayout>content</AdminLayout>);

    expect(screen.getByText('content')).toBeInTheDocument();
    for (const label of [
      'Overview',
      'Tracks',
      'Cohorts',
      'Questions',
      'Coding',
      'Lessons',
      'Materials',
      'Users',
      'Audit',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('bounces authed candidates to their dashboard and hides content', () => {
    authState = {
      user: { id: 'u2', email: 'c@x.co', name: 'Cami', role: 'candidate' },
      status: 'authed',
    };
    render(<AdminLayout>secret</AdminLayout>);

    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('bounces anonymous visitors to login', () => {
    authState = { user: null, status: 'anon' };
    render(<AdminLayout>secret</AdminLayout>);

    expect(replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
