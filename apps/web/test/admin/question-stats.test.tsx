import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { QuestionStats } from '@/components/admin/question-stats';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('QuestionStats', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('renders served counts and correct rates; category filter refetches', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/categories')) {
        return Promise.resolve(
          jsonResponse([
            { _id: 'cat1', key: 'logical', name: 'Logical', scoringMode: 'correctness' },
          ]),
        );
      }
      if (url.includes('categoryId=cat1')) {
        return Promise.resolve(
          jsonResponse([{ questionId: 'q2', prompt: 'Filtered Q', served: 4, correctRate: 1 }]),
        );
      }
      return Promise.resolve(
        jsonResponse([{ questionId: 'q1', prompt: 'What is 2+2?', served: 10, correctRate: 0.65 }]),
      );
    });

    render(
      <Providers>
        <QuestionStats />
      </Providers>,
    );

    expect(await screen.findByText('What is 2+2?')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();

    await screen.findByRole('option', { name: 'Logical' });
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat1');
    expect(await screen.findByText('Filtered Q')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
