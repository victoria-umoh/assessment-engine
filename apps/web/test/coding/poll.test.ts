import { describe, expect, it } from 'vitest';
import { isSettled, pollInterval, selectableLanguages } from '@/components/coding/poll';

describe('poll helpers', () => {
  it('settles on passed/failed/error, polls 2s otherwise, and intersects languages in problem order', () => {
    expect(isSettled('passed')).toBe(true);
    expect(isSettled('failed')).toBe(true);
    expect(isSettled('error')).toBe(true);
    expect(isSettled('queued')).toBe(false);
    expect(isSettled('running')).toBe(false);

    expect(pollInterval(undefined)).toBe(2000);
    expect(pollInterval({ status: 'queued' })).toBe(2000);
    expect(pollInterval({ status: 'running' })).toBe(2000);
    expect(pollInterval({ status: 'passed' })).toBe(false);

    expect(selectableLanguages(['python', 'rust', 'javascript'])).toEqual([
      'python',
      'javascript',
    ]);
  });
});
