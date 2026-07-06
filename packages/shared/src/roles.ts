export const Role = {
  Admin: 'admin',
  Candidate: 'candidate',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
