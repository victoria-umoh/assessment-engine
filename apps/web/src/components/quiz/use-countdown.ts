'use client';

import { useEffect, useRef, useState } from 'react';

// Countdown anchored to the SERVER's startedAt — the server enforces the real
// limit (+5s grace); this drives UX and the auto-submit at zero.
// When serverNow is provided (attempt views carry it), the skew between the
// server clock and Date.now() is folded in once at mount, so a wrong client
// clock can neither stretch nor shrink the visible timer.
export function useCountdown(
  startedAt: string | Date,
  timeLimitSec: number,
  onExpire: () => void,
  serverNow?: string | Date,
): { secondsLeft: number; display: string } {
  const skewRef = useRef<number | null>(null);
  if (skewRef.current === null) {
    skewRef.current = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
  }
  const skewMs = skewRef.current;
  const deadline = new Date(startedAt).getTime() + timeLimitSec * 1000;
  const remaining = () => Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000));

  const [secondsLeft, setSecondsLeft] = useState(remaining);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, skewMs]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  return { secondsLeft, display: `${mm}:${ss}` };
}
