import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'm1' }),
}));

import MaterialsPage from '@/app/(admin)/admin/materials/page';
import MaterialDetailPage from '@/app/(admin)/admin/materials/[id]/page';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Materials pages', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('list page renders rows with status badges and linked counts', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/admin/materials')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                _id: 'm1',
                title: 'Ratios reading',
                source: 'upload',
                status: 'ready',
                archived: false,
                linkedQuestionCount: 3,
              },
            ],
            nextCursor: null,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <MaterialsPage />
      </Providers>,
    );

    expect(await screen.findByText('Ratios reading')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument();
  });

  it('detail page composes the editor and linked-questions manager', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('materialId=m1')) {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      if (url.includes('/admin/materials/m1')) {
        return Promise.resolve(
          jsonResponse({
            _id: 'm1',
            title: 'Ratios reading',
            source: 'upload',
            status: 'ready',
            archived: false,
            extractedText: '# Ratios',
            linkedQuestionIds: [],
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <MaterialDetailPage />
      </Providers>,
    );

    expect(await screen.findByLabelText('Title')).toHaveValue('Ratios reading');
    expect(screen.getByText('Comprehension questions')).toBeInTheDocument();
  });
});
