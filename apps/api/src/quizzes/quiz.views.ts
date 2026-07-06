// Candidate-facing attempt projection. Never expose: correct, explanation,
// traitMapping, canonical option order, or the shuffle permutation itself.

export interface AttemptQuestionLike {
  questionId: unknown;
  presentedOrder: number;
  shuffledOptionOrder?: number[];
}

export interface QuestionDocLike {
  prompt: string;
  type: string;
  options?: string[];
  media?: unknown;
}

export interface AttemptLike {
  _id: unknown;
  quizItemId: string;
  status: string;
  startedAt: Date;
  timeLimitSec: number;
  questions: AttemptQuestionLike[];
}

export function toCandidateAttemptView(
  attempt: AttemptLike,
  questionsById: Map<string, QuestionDocLike>,
) {
  return {
    _id: attempt._id,
    quizItemId: attempt.quizItemId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    timeLimitSec: attempt.timeLimitSec,
    // Serialization-time server clock: the client anchors its countdown to
    // this instead of trusting its own clock (P5 skew rider).
    serverNow: new Date().toISOString(),
    questions: [...attempt.questions]
      .sort((a, b) => a.presentedOrder - b.presentedOrder)
      .map((aq) => {
        const q = questionsById.get(String(aq.questionId));
        if (!q) return { questionId: aq.questionId };
        return {
          questionId: aq.questionId,
          prompt: q.prompt,
          type: q.type,
          ...(q.media !== undefined ? { media: q.media } : {}),
          ...(q.options
            ? {
                options: (aq.shuffledOptionOrder ?? q.options.map((_, i) => i)).map(
                  (i) => q.options![i],
                ),
              }
            : {}),
        };
      }),
  };
}
