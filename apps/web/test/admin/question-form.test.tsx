import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { QuestionForm } from '@/components/admin/question-form';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const CATEGORIES = [
  { _id: 'cat1', key: 'logical-reasoning', name: 'Logical Reasoning', scoringMode: 'correctness' },
  { _id: 'cat2', key: 'personality', name: 'Personality', scoringMode: 'profile' },
];

describe('QuestionForm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/categories')) return Promise.resolve(jsonResponse(CATEGORIES));
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('builds a schema-valid mcq dto from prompt, options and correct pick', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <Providers>
        <QuestionForm onSubmit={onSubmit} />
      </Providers>,
    );

    await screen.findByRole('option', { name: 'Logical Reasoning' });
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat1');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), '3');
    await userEvent.type(screen.getByLabelText('Prompt'), 'Which comes next: 2, 4, 8, …?');
    await userEvent.type(screen.getByLabelText(/Options/), '12{enter}16{enter}24');
    // Option rows appear as radio choices for the single correct answer.
    await userEvent.click(screen.getByRole('radio', { name: '16' }));
    await userEvent.click(screen.getByRole('button', { name: /save question/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'mcq',
      categoryId: 'cat1',
      difficulty: 3,
      prompt: 'Which comes next: 2, 4, 8, …?',
      options: ['12', '16', '24'],
      correct: [1],
      tags: [],
    });
  });

  it('likert questions carry a traitMapping and never a correct field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <Providers>
        <QuestionForm onSubmit={onSubmit} />
      </Providers>,
    );

    await screen.findByRole('option', { name: 'Personality' });
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'likert');
    expect(screen.queryByLabelText(/Options/)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat2');
    await userEvent.type(screen.getByLabelText('Prompt'), 'I enjoy meeting new people.');
    await userEvent.type(screen.getByLabelText('Trait dimension'), 'extraversion');
    await userEvent.selectOptions(screen.getByLabelText('Direction'), '-1');
    await userEvent.click(screen.getByRole('button', { name: /save question/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'likert',
      categoryId: 'cat2',
      difficulty: 1,
      prompt: 'I enjoy meeting new people.',
      traitMapping: { dimension: 'extraversion', direction: -1 },
      tags: [],
    });
  });

  it('blocks an mcq without a correct pick and renders the zod issue', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <Providers>
        <QuestionForm onSubmit={onSubmit} />
      </Providers>,
    );

    await screen.findByRole('option', { name: 'Logical Reasoning' });
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'cat1');
    await userEvent.type(screen.getByLabelText('Prompt'), 'Pick one');
    await userEvent.type(screen.getByLabelText(/Options/), 'a{enter}b');
    await userEvent.click(screen.getByRole('button', { name: /save question/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/correct indexes must reference existing options/i)).toBeInTheDocument();
  });
});
