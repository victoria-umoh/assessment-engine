'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminUser } from '@/lib/admin-types';
import { useAuth } from '@/components/auth/auth-provider';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CursorList } from '@/components/admin/cursor-table';
import { UserRowControls } from '@/components/admin/user-row-controls';

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

function UserCreateForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'candidate'>('candidate');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/admin/users', { method: 'POST', body: { email, name, password, role } });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="uc-email">Email</Label>
        <Input id="uc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="uc-name">Name</Label>
        <Input id="uc-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="uc-password">Password</Label>
        <Input
          id="uc-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="uc-role">Role</Label>
        <select
          id="uc-role"
          className={SELECT_CLASS + ' w-full'}
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'candidate')}
        >
          <option value="candidate">candidate</option>
          <option value="admin">admin</option>
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>
        Create user
      </Button>
    </form>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Debounce the search box into the query param.
  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const qs = params.toString();
  const path = qs ? `/admin/users?${qs}` : '/admin/users';

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['cursor-list', 'admin-users'] });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Users</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
            </DialogHeader>
            <UserCreateForm
              onCreated={() => {
                setCreateOpen(false);
                invalidate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="up-search">Search</Label>
          <Input
            id="up-search"
            placeholder="email or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="up-role">Role</Label>
          <select
            id="up-role"
            className={SELECT_CLASS}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All</option>
            <option value="admin">admin</option>
            <option value="candidate">candidate</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="up-status">Status</Label>
          <select
            id="up-status"
            className={SELECT_CLASS}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
      </div>

      <CursorList<AdminUser>
        queryKey={['admin-users', qs]}
        path={path}
        render={(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Controls</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u._id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>
                    <Badge variant={u.status === 'active' ? 'default' : 'destructive'}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UserRowControls user={u} selfId={me?.id ?? ''} onChanged={invalidate} />
                  </TableCell>
                  <TableCell>{u.createdAt ? u.createdAt.slice(0, 10) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      />
    </div>
  );
}
