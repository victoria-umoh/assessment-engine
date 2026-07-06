import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCard } from '@/components/quiz/question-card';

describe('QuestionCard', () => {
  it('renders mcq options in presented order and reports the selected index', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionCard
        index={0}
        question={{
          questionId: 'q1',
          prompt: 'Pick the even number',
          type: 'mcq',
          options: ['three', 'four', 'five'],
        }}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/Pick the even number/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'four' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('reports the toggled index for multi checkboxes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionCard
        index={1}
        question={{ questionId: 'q2', prompt: 'Pick all', type: 'multi', options: ['a', 'b'] }}
        value={[0]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'b' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('reports likert selections as 1-5 values', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionCard
        index={2}
        question={{ questionId: 'q3', prompt: 'I enjoy puzzles', type: 'likert' }}
        value={undefined}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('radio', { name: /strongly agree/i }));
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('reports text answers as strings', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuestionCard
        index={3}
        question={{ questionId: 'q4', prompt: 'Explain', type: 'text' }}
        value=""
        onChange={onChange}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenLastCalledWith('x');
  });
});
