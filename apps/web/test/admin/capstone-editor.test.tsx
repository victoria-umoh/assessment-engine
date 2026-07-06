import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CapstoneEditor, type CapstoneDraft } from '@/components/admin/capstone-editor';

const PROBLEMS = [{ _id: 'p1', title: 'Sum problem' }];
const CATEGORIES = [{ _id: 'cat1', name: 'Logical' }];

function Harness({ onChange }: { onChange: (next: CapstoneDraft | undefined) => void }) {
  const [value, setValue] = useState<CapstoneDraft | undefined>(undefined);
  return (
    <CapstoneEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      problems={PROBLEMS}
      categories={CATEGORIES}
    />
  );
}

describe('CapstoneEditor', () => {
  it('builds a capstone draft with a final quiz and coding problems; disabling clears it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /enable final assessment/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /include final quiz/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sum problem' }));

    expect(onChange).toHaveBeenLastCalledWith({
      quizConfig: { count: 10, timeLimitSec: 900 },
      codingProblemIds: ['p1'],
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /enable final assessment/i }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
