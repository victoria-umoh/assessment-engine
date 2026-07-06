// Pure answer state in the PRESENTED-index domain (the server maps presented
// indices back to canonical order via the attempt's shuffle permutation).

export type AnswerValue = number | number[] | string;
export type AnswerMap = Record<string, AnswerValue>;

export function setAnswer(
  map: AnswerMap,
  questionId: string,
  type: 'mcq' | 'multi' | 'text' | 'likert',
  value: number | string,
): AnswerMap {
  if (type === 'multi') {
    const current = Array.isArray(map[questionId]) ? (map[questionId] as number[]) : [];
    const idx = value as number;
    const next = current.includes(idx)
      ? current.filter((v) => v !== idx)
      : [...current, idx].sort((a, b) => a - b);
    return { ...map, [questionId]: next };
  }
  return { ...map, [questionId]: value };
}

export function answeredCount(map: AnswerMap): number {
  return Object.values(map).filter((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : true,
  ).length;
}

export function toSubmitDto(map: AnswerMap): {
  answers: Array<{ questionId: string; answer: AnswerValue }>;
} {
  return {
    answers: Object.entries(map)
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : true))
      .map(([questionId, answer]) => ({ questionId, answer })),
  };
}
