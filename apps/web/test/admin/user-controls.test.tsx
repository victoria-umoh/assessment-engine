import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '@/lib/tokens';
import { UserRowControls } from '@/components/admin/user-row-controls';
import type { AdminUser } from '@/lib/admin-types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const USER: AdminUser = {
  _id: 'u2',
  email: 'c@x.co',
  name: 'Cami',
  role: 'candidate',
  status: 'active',
};

describe('UserRowControls', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('changing role PATCHes the user and reports the change', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...USER, role: 'admin' }));
    const onChanged = vi.fn();
    render(<UserRowControls user={USER} selfId="u1" onChanged={onChanged} />);

    await userEvent.selectOptions(screen.getByLabelText(`Role for ${USER.email}`), 'admin');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/users/u2');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ role: 'admin' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('locks both selects on the acting admin’s own row with the reason', () => {
    render(<UserRowControls user={{ ...USER, _id: 'u1' }} selfId="u1" onChanged={vi.fn()} />);

    const role = screen.getByLabelText(`Role for ${USER.email}`);
    const status = screen.getByLabelText(`Status for ${USER.email}`);
    expect(role).toBeDisabled();
    expect(status).toBeDisabled();
    expect(role).toHaveAttribute('title', 'You cannot change your own role or status');
  });
});
