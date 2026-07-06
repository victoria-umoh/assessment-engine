import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let authState: { user: PublicUser | null; status: 'loading' | 'authed' | 'anon' };
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ ...authState, login: vi.fn(), register: vi.fn(), logout: vi.fn() }),
}));

import CandidateLayout from '@/app/(candidate)/layout';

describe('CandidateLayout admin link', () => {
  it('shows an Admin link to admins only', () => {
    authState = {
      user: { id: 'u1', email: 'a@x.co', name: 'Ada', role: 'admin' },
      status: 'authed',
    };
    const { unmount } = render(<CandidateLayout>c</CandidateLayout>);
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    unmount();

    authState = {
      user: { id: 'u2', email: 'c@x.co', name: 'Cami', role: 'candidate' },
      status: 'authed',
    };
    render(<CandidateLayout>c</CandidateLayout>);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});
