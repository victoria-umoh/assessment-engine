'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { AssessmentResult, Track } from '@/lib/types';

function Bars({ values }: { values: Record<string, number> }) {
  return (
    <div className="space-y-3">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span>{key}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round(value)}%</span>
          </div>
          <Progress value={value} />
        </div>
      ))}
    </div>
  );
}

export function ResultCard({
  result,
  track,
}: {
  result: AssessmentResult;
  track?: Track;
}) {
  const minimums = track?.scoring.categoryMinimums ?? {};
  const belowMinimum = Object.entries(minimums)
    .filter(([key, min]) => (result.breakdown[key] ?? 0) / 100 < min)
    .map(([key]) => key);
  const passThreshold = track?.scoring.passThreshold;

  return (
    <div className="space-y-6">
      <Card className={result.verdict === 'pass' ? 'border-green-500' : 'border-destructive'}>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-3xl">
            {result.verdict === 'pass' ? 'PASS' : 'FAIL'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-center">
          <p className="text-4xl font-semibold tabular-nums">
            {Math.round(result.weightedTotal * 10) / 10}%
          </p>
          {passThreshold !== undefined && (
            <p className="text-sm text-muted-foreground">
              Pass mark: {Math.round(passThreshold * 100)}%
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Bars values={result.breakdown} />
          {belowMinimum.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {belowMinimum.map((key) => (
                  <Badge key={key} variant="destructive">
                    {key}: below minimum
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result.personalityProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personality profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Bars values={result.personalityProfile} />
            <p className="text-xs text-muted-foreground">
              Informative — does not affect pass/fail.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Generated {new Date(result.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
