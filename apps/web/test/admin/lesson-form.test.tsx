import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonForm } from '@/components/admin/lesson-form';

describe('LessonForm', () => {
  it('builds a schema-valid lesson dto from blocks, minutes and tags', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LessonForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Ratios 101');
    await userEvent.clear(screen.getByLabelText('Estimated minutes'));
    await userEvent.type(screen.getByLabelText('Estimated minutes'), '12');
    await userEvent.type(screen.getByLabelText('Tags (comma-separated)'), 'math, ratios');

    await userEvent.click(screen.getByRole('button', { name: /add markdown/i }));
    await userEvent.type(screen.getByLabelText('Markdown'), '# Ratios');

    await userEvent.click(screen.getByRole('button', { name: /add video/i }));
    await userEvent.type(screen.getByLabelText('Video URL'), 'https://example.com/v.mp4');
    await userEvent.type(screen.getByLabelText('Caption'), 'Intro video');

    await userEvent.click(screen.getByRole('button', { name: /save lesson/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Ratios 101',
      estMinutes: 12,
      tags: ['math', 'ratios'],
      contentBlocks: [
        { type: 'markdown', markdown: '# Ratios' },
        { type: 'video', url: 'https://example.com/v.mp4', caption: 'Intro video' },
      ],
    });
  });

  it('blocks an invalid video URL and renders the issue', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LessonForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Broken');
    await userEvent.click(screen.getByRole('button', { name: /add video/i }));
    await userEvent.type(screen.getByLabelText('Video URL'), 'not-a-url');
    await userEvent.click(screen.getByRole('button', { name: /save lesson/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/contentBlocks/)).toBeInTheDocument();
  });
});
