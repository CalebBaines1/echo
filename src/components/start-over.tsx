'use client';

import { useState } from 'react';
import { startOver } from '@/lib/account';
import { Button } from './ui';

/** "Start over", with a confirmation step: it deletes everything. */
export function StartOver() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="cursor-pointer self-center text-sm font-semibold text-faint hover:text-warn">
        Start over
      </button>
    );
  }
  return (
    <section
      ref={(el) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
      className="flex flex-col gap-2 rounded-2xl border-2 border-warn bg-warn-soft px-3.5 py-3"
      role="alertdialog"
      aria-label="Start over"
    >
      <p className="text-sm font-bold text-warn">Delete your echo, plans, check-ins and friends?</p>
      <p className="text-sm">You&apos;ll start again from the beginning. This can&apos;t be undone.</p>
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setAsking(false)} disabled={busy}>
          Keep everything
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await startOver();
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
          className="cursor-pointer rounded-2xl bg-warn px-4 py-3 text-sm font-bold text-surface disabled:opacity-60"
        >
          {busy ? 'Deleting…' : 'Delete and start over'}
        </button>
      </div>
    </section>
  );
}
