import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { MaterialGenerate } from '@/components/admin/material-generate';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MaterialGenerate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('posts topic/count/category and surfaces the 503 unconfigured message verbatim', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/categories')) {
        return Promise.resolve(
          jsonResponse(200, [
            { _id: 'cat1', key: 'verbal', name: 'Verbal', scoringMode: 'correctness' },
          ]),
        );
      }
      if (init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(503, { message: 'Material generation is not configured' }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <MaterialGenerate onCreated={vi.fn()} />
      </Providers>,
    );

    await screen.findByRole('option', { name: 'Verbal' });
    await userEvent.type(screen.getByLabelText('Topic'), 'Reading comprehension: ratios');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat1');
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(
      await screen.findByText('Material generation is not configured'),
    ).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall![1].body as string)).toEqual({
      topic: 'Reading comprehension: ratios',
      numQuestions: 5,
      categoryId: 'cat1',
    });
  });
});
