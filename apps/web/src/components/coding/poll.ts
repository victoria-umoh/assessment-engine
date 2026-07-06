import { JUDGE0_LANGUAGE_IDS } from '@lms/shared';

export const SETTLED = ['passed', 'failed', 'error'] as const;

export function isSettled(status: string): boolean {
  return (SETTLED as readonly string[]).includes(status);
}

// Plugs into useQuery refetchInterval: 2s while unsettled, stop when settled.
export function pollInterval(data: { status: string } | undefined): number | false {
  return data && isSettled(data.status) ? false : 2000;
}

// A submission's language must be in the Judge0 map AND the problem's list
// (server-enforced); the select only offers the intersection, problem order.
export function selectableLanguages(problemLanguages: string[]): string[] {
  return problemLanguages.filter((lang) => lang in JUDGE0_LANGUAGE_IDS);
}
