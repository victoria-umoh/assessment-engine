import { computeUnlockState, UnlockInput } from './unlock.engine';

const DAY_MS = 86400000;

function input(overrides: Partial<UnlockInput>): UnlockInput {
  return {
    days: [],
    itemProgress: [],
    anchorDate: new Date('2026-07-01T00:00:00Z'),
    unlockMode: 'hybrid',
    now: new Date('2026-07-01T12:00:00Z'),
    ...overrides,
  };
}

function day(dayNumber: number, itemIds: string[], required = true) {
  return { dayNumber, items: itemIds.map((itemId) => ({ itemId, required })) };
}

describe('computeUnlockState', () => {
  it('hybrid: day 1 is unlocked on empty progress', () => {
    const state = computeUnlockState(input({ days: [day(1, ['a'])] }));
    expect(state.unlockedDay).toBe(1);
    expect(state.days[0].unlocked).toBe(true);
  });

  it('hybrid: day 2 locked when day 1 incomplete even if date passed', () => {
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b'])],
        now: new Date('2026-07-05T00:00:00Z'), // date gate long open
      }),
    );
    expect(state.days[1].unlocked).toBe(false);
    expect(state.days[1].dateGateOpen).toBe(true);
    expect(state.unlockedDay).toBe(1);
  });

  it('hybrid: day 2 locked when date not reached even if day 1 complete', () => {
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b'])],
        itemProgress: [{ itemId: 'a', status: 'completed' }],
        now: new Date('2026-07-01T12:00:00Z'), // < anchor + 1 day
      }),
    );
    expect(state.days[1].unlocked).toBe(false);
    expect(state.days[1].dateGateOpen).toBe(false);
    expect(state.days[0].requiredComplete).toBe(1);
    expect(state.unlockedDay).toBe(1);
  });

  it('hybrid: day 2 unlocked when progress and date both pass', () => {
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b'])],
        itemProgress: [{ itemId: 'a', status: 'completed' }],
        now: new Date(new Date('2026-07-01T00:00:00Z').getTime() + DAY_MS),
      }),
    );
    expect(state.days[1].unlocked).toBe(true);
    expect(state.unlockedDay).toBe(2);
  });

  it('optional (required:false) items do not gate the next day', () => {
    const state = computeUnlockState(
      input({
        days: [
          { dayNumber: 1, items: [{ itemId: 'a', required: true }, { itemId: 'opt', required: false }] },
          day(2, ['b']),
        ],
        itemProgress: [{ itemId: 'a', status: 'completed' }], // 'opt' untouched
        now: new Date(new Date('2026-07-01T00:00:00Z').getTime() + DAY_MS),
      }),
    );
    expect(state.days[0].requiredTotal).toBe(1);
    expect(state.days[1].unlocked).toBe(true);
  });

  it('empty day counts as complete', () => {
    const state = computeUnlockState(
      input({
        days: [{ dayNumber: 1, items: [] }, day(2, ['b'])],
        now: new Date(new Date('2026-07-01T00:00:00Z').getTime() + DAY_MS),
      }),
    );
    expect(state.days[1].unlocked).toBe(true);
  });

  it('progress-only: unlocks day 2 on completion with anchorDate = now', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b'])],
        itemProgress: [{ itemId: 'a', status: 'completed' }],
        unlockMode: 'progress-only',
        anchorDate: now,
        now, // date gate would fail; mode ignores it
      }),
    );
    expect(state.days[1].unlocked).toBe(true);
    expect(state.unlockedDay).toBe(2);
  });

  it('day-only: unlocks day 2 purely by date with zero progress', () => {
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b'])],
        unlockMode: 'day-only',
        now: new Date(new Date('2026-07-01T00:00:00Z').getTime() + DAY_MS),
      }),
    );
    expect(state.days[1].unlocked).toBe(true);
    expect(state.unlockedDay).toBe(2);
  });

  it('anchor 3 days ago unlocks days 1-4 in day-only; unlockedDay is the highest unlocked', () => {
    const now = new Date('2026-07-04T00:00:00Z');
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b']), day(3, ['c']), day(4, ['d']), day(5, ['e'])],
        unlockMode: 'day-only',
        anchorDate: new Date(now.getTime() - 3 * DAY_MS),
        now,
      }),
    );
    expect(state.days.map((d) => d.unlocked)).toEqual([true, true, true, true, false]);
    expect(state.unlockedDay).toBe(4);
  });

  it('gap: day 3 stays locked when day 2 is locked even if its own conditions pass', () => {
    // Day 1 incomplete blocks day 2; day 2's items are complete and the date
    // gate for day 3 is open, but day 3 must stay locked behind the gap.
    const state = computeUnlockState(
      input({
        days: [day(1, ['a']), day(2, ['b']), day(3, ['c'])],
        itemProgress: [{ itemId: 'b', status: 'completed' }],
        now: new Date(new Date('2026-07-01T00:00:00Z').getTime() + 5 * DAY_MS),
      }),
    );
    expect(state.days.map((d) => d.unlocked)).toEqual([true, false, false]);
    expect(state.unlockedDay).toBe(1);
  });
});
