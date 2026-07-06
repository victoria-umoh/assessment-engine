import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { LessonViewer } from '@/components/items/lesson-viewer';
import type { Enrollment, TrackItem } from '@/lib/types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const enrollment: Enrollment = {
  _id: 'e1',
  userId: 'u1',
  trackId: 't1',
  startDate: '2026-07-01T00:00:00.000Z',
  unlockedDay: 1,
  itemProgress: [],
  status: 'active',
  version: 0,
};

const item: TrackItem = { itemId: 'i1', type: 'lesson', refId: 'l1', config: {} };

describe('LessonViewer', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('sandboxes video iframes and refuses non-http(s) embed urls', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/lessons/l1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'l1',
            title: 'Media lesson',
            contentBlocks: [
              { type: 'video', url: 'https://example.com/embed/1', caption: 'Good video' },
              // eslint-disable-next-line no-script-url
              { type: 'video', url: 'javascript:alert(1)', caption: 'Evil video' },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <Providers>
        <LessonViewer enrollment={enrollment} item={item} />
      </Providers>,
    );

    const good = await screen.findByTitle('Good video');
    // No allow-same-origin: paired with allow-scripts it lets the frame remove
    // its own sandbox attr (defeating it). Embeds (YouTube/Vimeo) don't need it.
    expect(good).toHaveAttribute('sandbox', 'allow-scripts allow-presentation');
    expect(screen.queryByTitle('Evil video')).not.toBeInTheDocument();
    expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
  });

  it('renders all block types and marks the lesson complete', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/lessons/l1')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'l1',
            title: 'Intro to Logic',
            contentBlocks: [
              { type: 'markdown', markdown: '# Welcome' },
              { type: 'video', url: 'https://example.com/v.mp4', caption: 'Overview video' },
              { type: 'image', url: 'https://example.com/p.png', caption: 'Diagram' },
            ],
            estMinutes: 10,
            tags: [],
          }),
        );
      }
      if (url.endsWith('/items/i1/complete') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, { unlockedDay: 1, days: [] }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <LessonViewer enrollment={enrollment} item={item} />
      </Providers>,
    );

    expect(await screen.findByText('Intro to Logic')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByTitle('Overview video')).toBeInTheDocument(); // iframe
    expect(screen.getByAltText('Diagram')).toBeInTheDocument();
    expect(screen.getByText(/10 min/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mark as complete/i }));
    await waitFor(() => {
      const completeCall = fetchMock.mock.calls.find(([u]) =>
        String(u).endsWith('/enrollments/e1/items/i1/complete'),
      );
      expect(completeCall).toBeDefined();
    });
    expect(await screen.findByRole('button', { name: /completed/i })).toBeDisabled();
  });
});
