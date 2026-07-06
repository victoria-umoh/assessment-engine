import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '@/lib/tokens';
import { MaterialEditor } from '@/components/admin/material-editor';
import type { AdminMaterialDetail } from '@/lib/admin-types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const MATERIAL: AdminMaterialDetail = {
  _id: 'm1',
  title: 'Ratios',
  source: 'upload',
  status: 'ready',
  archived: false,
  content: undefined,
  extractedText: '# Ratios\nOriginal text.',
  linkedQuestionIds: [],
};

describe('MaterialEditor', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('saves title/content via PATCH with exactly the edited fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...MATERIAL, title: 'Ratios v2', content: '# Better' }),
    );
    const onSaved = vi.fn();
    render(<MaterialEditor material={MATERIAL} onSaved={onSaved} />);

    // Body seeds from content ?? extractedText.
    expect(screen.getByLabelText('Content (markdown)')).toHaveValue('# Ratios\nOriginal text.');

    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Ratios v2');
    const content = screen.getByLabelText('Content (markdown)');
    await userEvent.clear(content);
    await userEvent.type(content, '# Better');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/materials/m1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Ratios v2', content: '# Better' });
    expect(onSaved).toHaveBeenCalled();
  });
});
