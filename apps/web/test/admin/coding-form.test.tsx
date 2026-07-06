import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { CodingProblemForm } from '@/components/admin/coding-problem-form';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CodingProblemForm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/categories')) {
        return Promise.resolve(
          jsonResponse([
            { _id: 'cat1', key: 'computational', name: 'Computational', scoringMode: 'correctness' },
          ]),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('checking a language exposes its starter code; test cases carry hidden and weight', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <Providers>
        <CodingProblemForm onSubmit={onSubmit} />
      </Providers>,
    );

    await screen.findByRole('option', { name: 'Computational' });
    await userEvent.type(screen.getByLabelText('Title'), 'Sum two numbers');
    await userEvent.type(screen.getByLabelText('Statement (markdown)'), 'Add a and b.');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat1');

    expect(screen.queryByLabelText('Starter code: python')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'python' }));
    await userEvent.type(
      screen.getByLabelText('Starter code: python'),
      'def solve(): pass',
    );

    await userEvent.click(screen.getByRole('button', { name: /add test case/i }));
    await userEvent.type(screen.getByLabelText('Input 1'), '1 2');
    await userEvent.type(screen.getByLabelText('Expected output 1'), '3');
    await userEvent.click(screen.getByRole('button', { name: /add test case/i }));
    await userEvent.type(screen.getByLabelText('Input 2'), '5 5');
    await userEvent.type(screen.getByLabelText('Expected output 2'), '10');
    await userEvent.click(screen.getByRole('checkbox', { name: /hidden 2/i }));
    await userEvent.clear(screen.getByLabelText('Weight 2'));
    await userEvent.type(screen.getByLabelText('Weight 2'), '2');

    await userEvent.click(screen.getByRole('button', { name: /save problem/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Sum two numbers',
      statement: 'Add a and b.',
      difficulty: 1,
      categoryId: 'cat1',
      languages: ['python'],
      starterCode: { python: 'def solve(): pass' },
      testCases: [
        { input: '1 2', expectedOutput: '3', hidden: false, weight: 1 },
        { input: '5 5', expectedOutput: '10', hidden: true, weight: 2 },
      ],
      limits: { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
    });
  });
});
