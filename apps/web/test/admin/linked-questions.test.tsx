import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { LinkedQuestions } from '@/components/admin/linked-questions';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('LinkedQuestions', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('lists linked questions and unlinks one via a filtered PATCH', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('materialId=m1')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              { _id: 'q1', prompt: 'First comprehension?', type: 'mcq', status: 'active' },
              { _id: 'q2', prompt: 'Second comprehension?', type: 'mcq', status: 'active' },
            ],
            nextCursor: null,
          }),
        );
      }
      if (url.includes('/admin/materials/m1') && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ _id: 'm1', linkedQuestionIds: ['q2'] }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(
      <Providers>
        <LinkedQuestions materialId="m1" linkedQuestionIds={['q1', 'q2']} onChanged={vi.fn()} />
      </Providers>,
    );

    expect(await screen.findByText('First comprehension?')).toBeInTheDocument();
    const unlinkButtons = screen.getAllByRole('button', { name: /unlink/i });
    await userEvent.click(unlinkButtons[0]);

    const patch = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/admin/materials/m1') && c[1]?.method === 'PATCH',
    );
    expect(patch).toBeDefined();
    expect(JSON.parse(patch![1].body as string)).toEqual({ linkedQuestionIds: ['q2'] });
  });
});
