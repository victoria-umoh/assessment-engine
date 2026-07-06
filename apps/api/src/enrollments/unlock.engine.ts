// Pure unlock computation (spec §5). No nest/mongoose imports — plain data in/out.

export type UnlockMode = 'hybrid' | 'progress-only' | 'day-only';

export interface UnlockInput {
  days: Array<{ dayNumber: number; items: Array<{ itemId: string; required: boolean }> }>;
  itemProgress: Array<{ itemId: string; status: string }>;
  anchorDate: Date; // cohort.startDate if cohort member else enrollment.startDate
  unlockMode: UnlockMode; // cohort.pacingOverrides?.unlockMode ?? 'hybrid'
  now: Date;
}

export interface DayState {
  dayNumber: number;
  unlocked: boolean;
  requiredComplete: number;
  requiredTotal: number;
  dateGateOpen: boolean;
}

export interface UnlockState {
  unlockedDay: number;
  days: DayState[];
}

const DAY_MS = 86400000;

export function computeUnlockState(input: UnlockInput): UnlockState {
  const days = [...input.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const completed = new Set(
    input.itemProgress.filter((p) => p.status === 'completed').map((p) => p.itemId),
  );
  const useProgress = input.unlockMode !== 'day-only';
  const useDate = input.unlockMode !== 'progress-only';

  const states: DayState[] = [];
  let previousUnlocked = false;
  let previousRequiredDone = true; // day 1 has no predecessor to gate on
  let unlockedDay = 0;

  for (const d of days) {
    const required = d.items.filter((i) => i.required);
    const requiredComplete = required.filter((i) => completed.has(i.itemId)).length;
    // Date gate for day N opens at anchor + (N-1) days.
    const dateGateOpen = input.now.getTime() >= input.anchorDate.getTime() + (d.dayNumber - 1) * DAY_MS;

    const gatesPass =
      (!useProgress || previousRequiredDone) && (!useDate || dateGateOpen || d.dayNumber === 1);
    // Days beyond the first locked day stay locked regardless of their own gates.
    const unlocked: boolean = d.dayNumber === 1 ? true : previousUnlocked && gatesPass;

    states.push({
      dayNumber: d.dayNumber,
      unlocked,
      requiredComplete,
      requiredTotal: required.length,
      dateGateOpen,
    });

    if (unlocked) unlockedDay = d.dayNumber;
    previousUnlocked = unlocked;
    previousRequiredDone = requiredComplete === required.length; // empty required counts complete
  }

  return { unlockedDay, days: states };
}
