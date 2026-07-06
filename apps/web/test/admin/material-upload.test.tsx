import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '@/lib/tokens';
import { MaterialUpload } from '@/components/admin/material-upload';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MaterialUpload', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('submits title and file as multipart FormData', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { _id: 'm1', status: 'ready' }));
    const onCreated = vi.fn();
    render(<MaterialUpload onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Ratios reading');
    const file = new File(['# Ratios'], 'ratios.md', { type: 'text/markdown' });
    await userEvent.upload(screen.getByLabelText('File'), file);
    await userEvent.click(screen.getByRole('button', { name: /upload/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/admin/materials/upload');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('title')).toBe('Ratios reading');
    expect((form.get('file') as File).name).toBe('ratios.md');
    expect(onCreated).toHaveBeenCalledWith('m1');
  });
});
