import { createCohortSchema, updateCohortSchema } from '@lms/shared';

describe('cohort schemas — date rules', () => {
  const base = { trackId: 'abc123', name: 'Cohort A', startDate: '2026-07-01' };

  it('create rejects endDate before startDate', () => {
    const r = createCohortSchema.safeParse({ ...base, endDate: '2026-06-30' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.flatten())).toContain('endDate must be on or after startDate');
    }
    expect(createCohortSchema.safeParse({ ...base, endDate: '2026-07-01' }).success).toBe(true);
    expect(createCohortSchema.safeParse(base).success).toBe(true);
  });

  it('update rejects endDate before startDate only when both are present', () => {
    // endDate alone can't be validated against a startDate the dto doesn't carry.
    expect(updateCohortSchema.safeParse({ endDate: '2026-06-30' }).success).toBe(true);
    const r = updateCohortSchema.safeParse({ startDate: '2026-07-01', endDate: '2026-06-30' });
    expect(r.success).toBe(false);
  });
});
