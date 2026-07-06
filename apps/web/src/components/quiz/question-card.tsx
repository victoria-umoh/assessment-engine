'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { AnswerValue } from '@/components/quiz/answers';
import type { AttemptQuestion } from '@/lib/types';

const LIKERT_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
];

export function QuestionCard({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: AttemptQuestion;
  value: AnswerValue | undefined;
  onChange: (value: number | string) => void;
}) {
  const qid = question.questionId;

  return (
    <Card>
      <CardHeader className="space-y-2">
        {Array.isArray(question.media) &&
          question.media.map((m, i) =>
            typeof m === 'string' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={m} alt={`Question ${index + 1} figure ${i + 1}`} className="max-w-xs" />
            ) : null,
          )}
        <p className="font-medium">
          {index + 1}. {question.prompt}
        </p>
      </CardHeader>
      <CardContent>
        {question.type === 'mcq' && question.options && (
          <RadioGroup
            value={typeof value === 'number' ? String(value) : undefined}
            onValueChange={(v) => onChange(Number(v))}
          >
            {question.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem id={`${qid}-${i}`} value={String(i)} />
                <Label htmlFor={`${qid}-${i}`} className="font-normal">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {question.type === 'multi' && question.options && (
          <div className="space-y-2">
            {question.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox
                  id={`${qid}-${i}`}
                  checked={Array.isArray(value) && value.includes(i)}
                  onCheckedChange={() => onChange(i)}
                />
                <Label htmlFor={`${qid}-${i}`} className="font-normal">
                  {opt}
                </Label>
              </div>
            ))}
          </div>
        )}

        {question.type === 'text' && (
          <Textarea
            aria-label={`Answer to question ${index + 1}`}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
          />
        )}

        {question.type === 'likert' && (
          <RadioGroup
            className="flex flex-wrap gap-4"
            value={typeof value === 'number' ? String(value) : undefined}
            onValueChange={(v) => onChange(Number(v))}
          >
            {LIKERT_LABELS.map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <RadioGroupItem id={`${qid}-lk-${i + 1}`} value={String(i + 1)} />
                <Label htmlFor={`${qid}-lk-${i + 1}`} className="text-xs font-normal">
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
      </CardContent>
    </Card>
  );
}
