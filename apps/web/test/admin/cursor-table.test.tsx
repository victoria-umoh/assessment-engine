import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { CursorList } from '@/components/admin/cursor-table';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CursorList', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders pages and loads more via the cursor until it runs out', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('after=c1')) {
        return Promise.resolve(jsonResponse({ items: [{ _id: 'b', title: 'Second' }], nextCursor: null }));
      }
      return Promise.resolve(jsonResponse({ items: [{ _id: 'a', title: 'First' }], nextCursor: 'c1' }));
    });

    render(
      <Providers>
        <CursorList<{ _id: string; title: string }>
          queryKey={['lessons', 'active']}
          path="/admin/lessons?status=active"
          render={(items) => (
            <ul>
              {items.map((i) => (
                <li key={i._id}>{i.title}</li>
              ))}
            </ul>
          )}
        />
      </Providers>,
    );

    expect(await screen.findByText('First')).toBeInTheDocument();
    const loadMore = screen.getByRole('button', { name: /load more/i });

    await userEvent.click(loadMore);
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();

    // First page keeps existing filters; second page appends the cursor.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain('/admin/lessons?status=active');
    expect(urls[0]).not.toContain('after=');
    expect(urls[1]).toContain('status=active');
    expect(urls[1]).toContain('after=c1');

    // Cursor exhausted → button gone.
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });
});
