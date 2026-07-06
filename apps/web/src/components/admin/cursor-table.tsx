'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { Button } from '@/components/ui/button';

// Generic load-more scaffold over the API's cursor pagination. `path` carries
// any filters; the cursor rides an appended `after=` param.
export function CursorList<T>({
  queryKey,
  path,
  render,
}: {
  queryKey: unknown[];
  path: string;
  render: (items: T[]) => React.ReactNode;
}) {
  const query = useInfiniteQuery({
    queryKey: ['cursor-list', ...queryKey],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiFetch<Paginated<T>>(
        pageParam ? `${path}${path.includes('?') ? '&' : '?'}after=${pageParam}` : path,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (query.isPending) return <p className="text-muted-foreground">Loading…</p>;
  if (query.isError) {
    return <p className="text-destructive">{(query.error as Error).message}</p>;
  }

  const items = query.data.pages.flatMap((p) => p.items);
  return (
    <div className="space-y-3">
      {render(items)}
      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
