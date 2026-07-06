// Candidate-facing lesson projection. Allowlist construction keeps any future
// schema fields (status, timestamps, internal flags) private by default.

export interface LessonLike {
  _id: unknown;
  title: string;
  contentBlocks: unknown[];
  estMinutes: number;
  tags: string[];
}

export function toCandidateLessonView(l: LessonLike) {
  return {
    _id: l._id,
    title: l.title,
    contentBlocks: l.contentBlocks,
    estMinutes: l.estMinutes,
    tags: l.tags,
  };
}
