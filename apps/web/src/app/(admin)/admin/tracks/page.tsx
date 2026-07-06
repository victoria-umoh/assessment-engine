'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminTrack } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'destructive',
};

export default function TracksPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const track = await apiFetch<AdminTrack>('/admin/tracks', {
        method: 'POST',
        body: {
          title,
          description,
          durationDays,
          days: Array.from({ length: durationDays }, (_, i) => ({
            dayNumber: i + 1,
            items: [],
          })),
          scoring: {
            weights: { quiz: 1, coding: 0, exercise: 0, reading: 0, finalAssessment: 0 },
            passThreshold: 0.7,
          },
        },
      });
      router.push(`/admin/tracks/${track._id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tracks</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New track</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New track</DialogTitle>
            </DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="tp-title">Title</Label>
                <Input id="tp-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tp-description">Description</Label>
                <Textarea
                  id="tp-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="w-40 space-y-1">
                <Label htmlFor="tp-duration">Duration (days)</Label>
                <Input
                  id="tp-duration"
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit">Create and open builder</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <CursorList<AdminTrack>
        queryKey={['admin-tracks']}
        path="/admin/tracks"
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((track) => (
                <TableRow key={track._id}>
                  <TableCell className="max-w-md truncate">
                    <Link href={`/admin/tracks/${track._id}`} className="hover:underline">
                      {track.title}
                    </Link>
                  </TableCell>
                  <TableCell>{track.durationDays} days</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[track.status] ?? 'secondary'}>
                      {track.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </div>
  );
}
