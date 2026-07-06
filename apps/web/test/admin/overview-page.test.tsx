import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import AdminOverviewPage from '@/app/(admin)/admin/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AdminOverviewPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders platform stat cards from the overview endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        users: { total: 42, admins: 2, candidates: 40, disabled: 1 },
        tracks: { published: 3, draft: 2 },
        cohorts: { scheduled: 1, active: 2 },
        enrollments: { active: 30, completed: 8, failed: 2 },
        submissions: { queued: 4, running: 1 },
      }),
    );

    render(
      <Providers>
        <AdminOverviewPage />
      </Providers>,
    );

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Published tracks')).toBeInTheDocument();
    expect(screen.getByText('Active cohorts')).toBeInTheDocument();
    expect(screen.getByText('Active enrollments')).toBeInTheDocument();
    expect(screen.getByText('Queued submissions')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
