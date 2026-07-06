'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { AdminUser } from '@/lib/admin-types';

const SELECT_CLASS = 'h-8 rounded-md border border-input bg-transparent px-2 text-sm';
const SELF_LOCK = 'You cannot change your own role or status';

export function UserRowControls({
  user,
  selfId,
  onChanged,
}: {
  user: AdminUser;
  selfId: string;
  onChanged: () => void;
}) {
  const isSelf = user._id === selfId;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: { role?: string; status?: string }) {
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user._id}`, { method: 'PATCH', body });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className={SELECT_CLASS}
        aria-label={`Role for ${user.email}`}
        value={user.role}
        disabled={isSelf || busy}
        title={isSelf ? SELF_LOCK : undefined}
        onChange={(e) => void patch({ role: e.target.value })}
      >
        <option value="candidate">candidate</option>
        <option value="admin">admin</option>
      </select>
      <select
        className={SELECT_CLASS}
        aria-label={`Status for ${user.email}`}
        value={user.status}
        disabled={isSelf || busy}
        title={isSelf ? SELF_LOCK : undefined}
        onChange={(e) => void patch({ status: e.target.value })}
      >
        <option value="active">active</option>
        <option value="disabled">disabled</option>
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
