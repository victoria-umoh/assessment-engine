import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ItemEditor, type DraftItem, type RefOptions } from '@/components/admin/item-editor';

const REF_OPTIONS: RefOptions = {
  lessons: [{ _id: 'l1', title: 'Intro lesson' }],
  materials: [{ _id: 'm1', title: 'Ratios reading' }],
  problems: [{ _id: 'p1', title: 'Sum problem' }],
  categories: [
    { _id: 'cat1', name: 'Logical' },
    { _id: 'cat2', name: 'Verbal' },
  ],
};

function Harness({
  initial,
  onChange,
}: {
  initial: DraftItem;
  onChange: (next: DraftItem) => void;
}) {
  const [item, setItem] = useState(initial);
  return (
    <ItemEditor
      item={item}
      refOptions={REF_OPTIONS}
      onChange={(next) => {
        setItem(next);
        onChange(next);
      }}
      onRemove={vi.fn()}
    />
  );
}

describe('ItemEditor', () => {
  it('quiz items edit config fields; unchecking required rides config.required', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ type: 'quiz', config: {} }} onChange={onChange} />);

    const count = screen.getByLabelText('Question count');
    await userEvent.clear(count);
    await userEvent.type(count, '5');
    const timeLimit = screen.getByLabelText('Time limit (seconds)');
    await userEvent.clear(timeLimit);
    await userEvent.type(timeLimit, '600');
    await userEvent.click(screen.getByRole('checkbox', { name: /required/i }));

    const last = onChange.mock.lastCall![0] as DraftItem;
    expect(last.type).toBe('quiz');
    expect(last.config.count).toBe(5);
    expect(last.config.timeLimitSec).toBe(600);
    expect(last.config.required).toBe(false);
  });

  it('quiz items collect categoryIds from category checkboxes', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ type: 'quiz', config: {} }} onChange={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Logical' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Verbal' }));
    let last = onChange.mock.lastCall![0] as DraftItem;
    expect(last.config.categoryIds).toEqual(['cat1', 'cat2']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Logical' }));
    last = onChange.mock.lastCall![0] as DraftItem;
    expect(last.config.categoryIds).toEqual(['cat2']);
  });

  it('coding items pick their problem refId from the option list', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ type: 'coding', config: {} }} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Coding problem'), 'p1');
    const last = onChange.mock.lastCall![0] as DraftItem;
    expect(last.refId).toBe('p1');
  });
});
