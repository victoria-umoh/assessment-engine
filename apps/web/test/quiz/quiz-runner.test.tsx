import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/lib/query';
import { tokenStore } from '@/lib/tokens';
import { QuizRunner } from '@/components/quiz/quiz-runner';
import type { Enrollment, TrackItem } from '@/lib/types';

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

const item: TrackItem = {
  itemId: 'i-quiz',
  type: 'quiz',
  config: { count: 2, timeLimitSec: 600 },
};

const attemptView = {
  _id: 'a1',
  quizItemId: 'i-quiz',
  status: 'in-progress',
  startedAt: new Date().toISOString(),
  timeLimitSec: 600,
  questions: [
    { questionId: 'q1', prompt: 'Even number?', type: 'mcq', options: ['three', 'four'] },
    { questionId: 'q2', prompt: 'I enjoy puzzles', type: 'likert' },
  ],
};

describe('QuizRunner', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
  });

  it('starts an attempt, submits the exact answers dto, and shows the score', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/items/i-quiz/quiz-attempts') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(200, attemptView));
      }
      if (url.endsWith('/quiz-attempts/a1/submit') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(200, {
            attemptId: 'a1',
            score: 100,
            correctCount: 1,
            total: 1,
            unlockState: { unlockedDay: 2, days: [] },
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <QuizRunner enrollment={enrollment} item={item} />
      </Providers>,
    );

    // intro → start
    await user.click(await screen.findByRole('button', { name: /start quiz/i }));

    // running: answer both questions
    await user.click(await screen.findByRole('radio', { name: 'four' }));
    await user.click(screen.getByRole('radio', { name: /strongly agree/i }));
    expect(screen.getByText(/2\/2 answered/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^submit$/i }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find(([u]) =>
        String(u).endsWith('/quiz-attempts/a1/submit'),
      );
      expect(submit).toBeDefined();
      expect(JSON.parse(submit![1].body as string)).toEqual({
        answers: [
          { questionId: 'q1', answer: 1 },
          { questionId: 'q2', answer: 5 },
        ],
      });
    });

    expect(await screen.findByText(/100/)).toBeInTheDocument();
    expect(screen.getByText(/1\/1 correct/i)).toBeInTheDocument();
  });

  it('renders the intro when the item has NO config key (mongoose minimize strips {})', async () => {
    // Caught live by the Playwright journey: a reading item saved without
    // config crashed the runner ('Application error' page) — jsdom fixtures
    // had always carried config.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {})));
    const bareItem = { itemId: 'i-read', type: 'reading' } as unknown as TrackItem;
    render(
      <Providers>
        <QuizRunner enrollment={enrollment} item={bareItem} />
      </Providers>,
    );
    expect(await screen.findByRole('button', { name: /start quiz/i })).toBeInTheDocument();
  });

  it('review mode echoes the candidate answers alongside correctness', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/quiz-attempts/a9')) {
        return Promise.resolve(
          jsonResponse(200, {
            _id: 'a9',
            quizItemId: 'i-quiz',
            status: 'submitted',
            startedAt: new Date().toISOString(),
            timeLimitSec: 600,
            score: 50,
            questions: [
              {
                questionId: 'q1',
                prompt: 'Even number?',
                type: 'mcq',
                options: ['three', 'four'],
                correct: true,
                answer: 1,
              },
              {
                questionId: 'q2',
                prompt: 'Capital of France?',
                type: 'text',
                correct: false,
                answer: 'Lyon',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(
      <Providers>
        <QuizRunner enrollment={enrollment} item={item} reviewAttemptId="a9" />
      </Providers>,
    );

    expect(await screen.findByText(/attempt review/i)).toBeInTheDocument();
    // mcq: the chosen PRESENTED option is named; text: the raw answer echoes.
    expect(screen.getByText('Your answer: four')).toBeInTheDocument();
    expect(screen.getByText('Your answer: Lyon')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText('Incorrect')).toBeInTheDocument();
  });

  it('renders the verbatim 409 message with a back link when starting is blocked', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/items/i-quiz/quiz-attempts') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(409, { message: 'No attempts remaining' }));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <QuizRunner enrollment={enrollment} item={item} />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: /start quiz/i }));
    expect(await screen.findByText(/No attempts remaining/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to track/i })).toHaveAttribute(
      'href',
      '/enrollments/e1',
    );
  });

  it('auto-submits current answers when the countdown has expired', async () => {
    // Resuming an attempt whose deadline already passed: the countdown's first
    // tick fires onExpire immediately — the runner must submit on its own.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/items/i-quiz/quiz-attempts') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(200, {
            ...attemptView,
            startedAt: new Date(Date.now() - 601_000).toISOString(), // past the 600s limit
          }),
        );
      }
      if (url.endsWith('/quiz-attempts/a1/submit') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(200, {
            attemptId: 'a1',
            score: 0,
            correctCount: 0,
            total: 1,
            unlockState: { unlockedDay: 1, days: [] },
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    const user = userEvent.setup();
    render(
      <Providers>
        <QuizRunner enrollment={enrollment} item={item} />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: /start quiz/i }));

    await waitFor(() => {
      const submit = fetchMock.mock.calls.find(([u]) =>
        String(u).endsWith('/quiz-attempts/a1/submit'),
      );
      expect(submit).toBeDefined();
      expect(JSON.parse(submit![1].body as string)).toEqual({ answers: [] });
    });
  });
});
