'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminMaterialRow } from '@/lib/admin-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';
import { MaterialGenerate } from '@/components/admin/material-generate';
import { MaterialUpload } from '@/components/admin/material-upload';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  ready: 'default',
  processing: 'secondary',
  failed: 'destructive',
};

export default function MaterialsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  async function goToCreated(id: string) {
    setUploadOpen(false);
    setGenerateOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-materials'] });
    router.push(`/admin/materials/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Materials</h1>
        <div className="flex gap-2">
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Upload</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload material</DialogTitle>
              </DialogHeader>
              <MaterialUpload onCreated={goToCreated} />
            </DialogContent>
          </Dialog>
          <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
            <DialogTrigger asChild>
              <Button>Generate with AI</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate material</DialogTitle>
              </DialogHeader>
              <MaterialGenerate onCreated={goToCreated} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <CursorList<AdminMaterialRow>
        queryKey={['admin-materials']}
        path="/admin/materials"
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked questions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m._id}>
                  <TableCell className="max-w-md truncate">
                    <Link href={`/admin/materials/${m._id}`} className="hover:underline">
                      {m.title}
                    </Link>
                  </TableCell>
                  <TableCell>{m.source}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[m.status] ?? 'secondary'}>{m.status}</Badge>
                  </TableCell>
                  <TableCell>{m.linkedQuestionCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </div>
  );
}
