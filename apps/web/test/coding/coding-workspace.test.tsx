import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import type { Enrollment, TrackItem } from '@/lib/types';

// jsdom cannot host Monaco — stub the editor module with a textarea double.
vi.mock('@/components/coding/editor', () => ({
  Editor: ({
    value,
    onChange,
  }: {
    language: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="code editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { CodingWorkspace } from '@/components/coding/coding-workspace';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const enrollment: Enrollment = {
  _id: 'e1',
  userId: 'u1',
  trackId: 't1',
  startDate: '2026-07-01T00:00:00.000Z',
  unlockedDay: 1,
  itemProgress: [],
  status: 'active',
  version: 0,
};

const item: TrackItem = { itemId: 'i3', type: 'coding', refId: 'p1', config: {} };

const problem = {
  id: 'p1',
  title: 'Sum Two Numbers',
  statement: 'Read two integers and print their **sum**.',
  difficulty: 1,
  categoryId: 'c1',
  languages: ['python', 'javascript'],
  starterCode: { python: 'print()', javascript: 'console.log()' },
  visibleTestCases: [{ input: '1 2', expectedOutput: '3' }],
  limits: { cpuTimeSec: 2, memoryKb: 128000, wallTimeSec: 5 },
};

describe('CodingWorkspace', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('seeds starter code, submits the exact body, and polls to the settled banner', async () => {
    let polls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/coding-problems/p1')) {
        return Promise.resolve(jsonResponse(200, problem));
      }
      if (url.endsWith('/submissions') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(201, {
            _id: 's1',
            enrollmentId: 'e1',
            itemId: 'i3',
            problemId: 'p1',
            final: false,
            language: 'python',
            status: 'queued',
            score: 0,
            testResults: [],
          }),
        );
      }
      if (url.endsWith('/submissions/s1')) {
        polls += 1;
        return Promise.resolve(
          jsonResponse(200, {
            _id: 's1',
            enrollmentId: 'e1',
            itemId: 'i3',
            problemId: 'p1',
            final: false,
            language: 'python',
            status: 'passed',
            score: 100,
            testResults: [{ caseIndex: 0, status: 'passed', stdout: '3\n', time: 0.01 }],
          }),
        );
      }
      if (url.includes('/enrollments/e1/submissions')) {
        // The API's owner list is cursor-paginated: { items, nextCursor }.
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                _id: 's0',
                enrollmentId: 'e1',
                itemId: 'i3',
                problemId: 'p1',
                final: false,
                language: 'python',
                status: 'failed',
                score: 50,
                testResults: [],
                createdAt: '2026-07-04T10:00:00.000Z',
              },
            ],
            nextCursor: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <CodingWorkspace enrollment={enrollment} item={item} />
      </Providers>,
    );

    expect(await screen.findByText('Sum Two Numbers')).toBeInTheDocument();
    expect(await screen.findByText(/previous submissions/i)).toBeInTheDocument();
    // History is filtered server-side — page 1 of ALL submissions truncates
    // per-problem history on busy enrollments (P5 rider).
    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).includes('/enrollments/e1/submissions?problemId=p1'),
      ),
    ).toBe(true);
    const editor = screen.getByLabelText('code editor');
    expect(editor).toHaveValue('print()');

    await user.clear(editor);
    await user.type(editor, 'print(1+2)');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith('/submissions') && (i as RequestInit)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(post![1].body as string)).toEqual({
        enrollmentId: 'e1',
        itemId: 'i3',
        problemId: 'p1',
        language: 'python',
        sourceCode: 'print(1+2)',
      });
    });

    expect(await screen.findByText('Passed', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(polls).toBeGreaterThan(0);
  });

  it('posts final:true without itemId for capstone submissions', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/coding-problems/p1')) {
        return Promise.resolve(jsonResponse(200, problem));
      }
      if (url.endsWith('/submissions') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(201, {
            _id: 's2',
            enrollmentId: 'e1',
            problemId: 'p1',
            final: true,
            language: 'python',
            status: 'queued',
            score: 0,
            testResults: [],
          }),
        );
      }
      if (url.endsWith('/submissions/s2')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 's2',
            enrollmentId: 'e1',
            problemId: 'p1',
            final: true,
            language: 'python',
            status: 'passed',
            score: 100,
            testResults: [],
          }),
        );
      }
      if (url.includes('/enrollments/e1/submissions')) {
        return Promise.resolve(jsonResponse(200, { items: [], nextCursor: null }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <CodingWorkspace enrollment={enrollment} final problemId="p1" />
      </Providers>,
    );

    await screen.findByText('Sum Two Numbers');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith('/submissions') && (i as RequestInit)?.method === 'POST',
      );
      expect(post).toBeDefined();
      const body = JSON.parse(post![1].body as string);
      expect(body.final).toBe(true);
      expect(body.itemId).toBeUndefined();
      expect(body.problemId).toBe('p1');
    });
  });
});
