'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/items/markdown';
import { apiFetch } from '@/lib/api';
import type { Enrollment, Lesson, TrackItem, UnlockState } from '@/lib/types';

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function LessonViewer({
  enrollment,
  item,
}: {
  enrollment: Enrollment;
  item: TrackItem;
}) {
  const queryClient = useQueryClient();
  const lesson = useQuery({
    queryKey: ['lessons', item.refId],
    queryFn: () => apiFetch<Lesson>(`/lessons/${item.refId}`),
  });

  const alreadyComplete =
    enrollment.itemProgress.find((p) => p.itemId === item.itemId)?.status === 'completed';

  const complete = useMutation({
    mutationFn: () =>
      apiFetch<UnlockState>(`/enrollments/${enrollment._id}/items/${item.itemId}/complete`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', enrollment._id] });
    },
  });

  if (lesson.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!lesson.data) {
    return <p className="text-destructive">Lesson unavailable.</p>;
  }

  const done = alreadyComplete || complete.isSuccess;

  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">{lesson.data.title}</h1>
      {lesson.data.contentBlocks.map((block, i) => {
        if (block.type === 'markdown' && block.markdown) {
          return <Markdown key={i}>{block.markdown}</Markdown>;
        }
        if (block.type === 'video' && block.url) {
          // Only http(s) embeds, and always sandboxed — lesson content is
          // admin-authored but a compromised URL must not script this origin.
          if (!isHttpUrl(block.url)) {
            return (
              <p key={i} className="text-sm text-muted-foreground">
                Video unavailable
              </p>
            );
          }
          return (
            <figure key={i} className="space-y-1">
              <iframe
                src={block.url}
                title={block.caption ?? `Video ${i + 1}`}
                className="aspect-video w-full rounded-md border"
                sandbox="allow-scripts allow-presentation"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              {block.caption && (
                <figcaption className="text-sm text-muted-foreground">{block.caption}</figcaption>
              )}
            </figure>
          );
        }
        if (block.type === 'image' && block.url) {
          return (
            <figure key={i} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.caption ?? `Image ${i + 1}`}
                className="max-w-full rounded-md border"
              />
              {block.caption && (
                <figcaption className="text-sm text-muted-foreground">{block.caption}</figcaption>
              )}
            </figure>
          );
        }
        return null;
      })}
      <footer className="flex items-center gap-4 border-t pt-4">
        <span className="text-sm text-muted-foreground">{lesson.data.estMinutes} min</span>
        {complete.error && (
          <Alert variant="destructive" className="flex-1">
            <AlertDescription>
              {complete.error instanceof Error ? complete.error.message : 'Could not complete'}
            </AlertDescription>
          </Alert>
        )}
        <Button
          onClick={() => complete.mutate()}
          disabled={done || complete.isPending}
        >
          {done ? 'Completed ✓' : 'Mark as complete'}
        </Button>
      </footer>
    </article>
  );
}
