'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EnrollControls({ onJoin }: { onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    try {
      await onJoin(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="invite-code">Invite code</Label>
      <div className="flex gap-2">
        <Input
          id="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. AB2CD3EF"
        />
        <Button onClick={join} disabled={busy}>
          Join
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
