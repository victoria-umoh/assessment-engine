'use client';

import { useState } from 'react';
import type { AuditEntry } from '@/lib/admin-types';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';

// Known audit entities — the interceptor derives them from /admin/<entity>/… paths.
const ENTITIES = [
  'categories',
  'questions',
  'lessons',
  'coding-problems',
  'materials',
  'tracks',
  'cohorts',
  'users',
];

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const path = entity ? `/admin/audit-logs?entity=${entity}` : '/admin/audit-logs';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <div className="space-y-1">
          <Label htmlFor="ap-entity">Entity</Label>
          <select
            id="ap-entity"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
          >
            <option value="">All</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      <CursorList<AuditEntry>
        queryKey={['audit-logs', entity]}
        path={path}
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry._id}>
                  <TableCell className="whitespace-nowrap">
                    {entry.at.replace('T', ' ').slice(0, 19)}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{entry.actorId.slice(-6)}</code>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{entry.action}</code>
                  </TableCell>
                  <TableCell>
                    {entry.entity}
                    {entry.entityId ? (
                      <code className="ml-1 text-xs text-muted-foreground">
                        …{entry.entityId.slice(-6)}
                      </code>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {entry.diff !== undefined ? (
                      <details>
                        <summary className="cursor-pointer text-sm text-muted-foreground">
                          diff
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(entry.diff, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      '—'
                    )}
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
