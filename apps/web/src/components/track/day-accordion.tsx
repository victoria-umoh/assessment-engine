'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemRow } from '@/components/track/item-row';
import type { ItemProgress, Track, UnlockState } from '@/lib/types';

const DAY_MS = 86400000;

export function DayAccordion({
  track,
  unlockState,
  itemProgress,
  enrollmentId,
  startDate,
}: {
  track: Track;
  unlockState: UnlockState;
  itemProgress: ItemProgress[];
  enrollmentId: string;
  startDate: string;
}) {
  const progressById = new Map(itemProgress.map((p) => [p.itemId, p]));
  const stateByDay = new Map(unlockState.days.map((d) => [d.dayNumber, d]));

  return (
    <div className="space-y-4">
      {[...track.days]
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .map((day) => {
          const state = stateByDay.get(day.dayNumber);
          const unlocked = state?.unlocked ?? false;
          const opensAt = new Date(
            new Date(startDate).getTime() + (day.dayNumber - 1) * DAY_MS,
          );
          const reason =
            state && !state.dateGateOpen
              ? `Opens ${opensAt.toLocaleDateString()}`
              : 'Complete the previous day first';
          return (
            <Card key={day.dayNumber} className={unlocked ? '' : 'opacity-80'}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">
                  Day {day.dayNumber}
                  {!unlocked && <span className="ml-2 text-sm text-muted-foreground">🔒</span>}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!unlocked && (
                    <span className="text-xs text-muted-foreground">{reason}</span>
                  )}
                  {state && (
                    <Badge variant={state.requiredComplete === state.requiredTotal ? 'secondary' : 'outline'}>
                      {state.requiredComplete}/{state.requiredTotal}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {day.items.map((item) => (
                  <ItemRow
                    key={item.itemId}
                    item={item}
                    progress={progressById.get(item.itemId)}
                    enrollmentId={enrollmentId}
                    locked={!unlocked}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
