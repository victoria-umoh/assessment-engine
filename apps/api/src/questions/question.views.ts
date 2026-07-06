export interface QuestionLike {
  id: string;
  type: 'mcq' | 'multi' | 'text' | 'likert';
  categoryId: unknown;
  difficulty: number;
  prompt: string;
  media?: Array<{ kind: 'svg' | 'imageUrl'; value: string }>;
  options?: string[];
  [key: string]: unknown; // answer-bearing fields exist but are never read here
}

export interface CandidateQuestionView {
  id: string;
  type: QuestionLike['type'];
  categoryId: unknown;
  difficulty: number;
  prompt: string;
  media?: QuestionLike['media'];
  options?: string[];
}

/**
 * Candidate-facing projection. MUST never include `correct`, `explanation`,
 * or `traitMapping` (spec: answer secrecy). Built as an allowlist, not a
 * strip-list, so new schema fields stay private by default.
 */
export function toCandidateQuestionView(q: QuestionLike): CandidateQuestionView {
  const view: CandidateQuestionView = {
    id: q.id,
    type: q.type,
    categoryId: q.categoryId,
    difficulty: q.difficulty,
    prompt: q.prompt,
  };
  if (q.media !== undefined) view.media = q.media;
  if (q.options !== undefined) view.options = q.options;
  return view;
}
