import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from '@/components/quiz/use-countdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats mm:ss, ticks down, and fires onExpire exactly once at zero', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useCountdown('2026-07-04T12:00:00.000Z', 90, onExpire),
    );
    expect(result.current.display).toBe('01:30');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.display).toBe('00:30');
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.display).toBe('00:00');
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1); // never re-fires
  });

  it('anchors to serverNow when provided — a skewed client clock cannot stretch the timer', () => {
    const onExpire = vi.fn();
    // Server says it is 12:01:00 while the client clock reads 12:00:00 —
    // 60 of the 90 seconds are already gone.
    const { result } = renderHook(() =>
      useCountdown('2026-07-04T12:00:00.000Z', 90, onExpire, '2026-07-04T12:01:00.000Z'),
    );
    expect(result.current.display).toBe('00:30');

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.display).toBe('00:00');
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
