'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveFriends } from '@/lib/friends';
import { EMPTY_PREFERENCES, SAMPLE_AREA } from '@/lib/profile/types';
import { clearAll, saveProfile } from '@/lib/store';

/**
 * Development only. Loads the sample people from the saved Qloo probe so the
 * app can be exercised end to end without any live Qloo calls.
 */
export function DevTools() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  if (process.env.NODE_ENV === 'production') return null;

  async function loadTestProfile() {
    setMessage('Loading…');
    const res = await fetch('/api/dev/test-profile');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body?.error ?? 'Could not load the test profile.');
      return;
    }
    saveProfile({
      name: 'Riley',
      tastes: body.riley,
      activities: [
        { name: 'pottery', status: 'wants_to', hobbyId: 'pottery' },
        { name: 'board games', status: 'does', hobbyId: 'board_games' },
        { name: 'reading', status: 'does', hobbyId: 'books' },
      ],
      preferences: { ...EMPTY_PREFERENCES, company: 'either', budget: 40, maxMiles: 5, notes: ['prefers quiet places'] },
      area: SAMPLE_AREA,
    });
    saveFriends([{ id: 'jordan', name: 'Jordan', tastes: body.jordan, sample: true }]);
    setMessage(null);
    router.push('/echo?build=1');
  }

  return (
    <details className="mt-2 rounded-2xl border border-dashed border-warn/50 px-3 py-2 text-xs text-muted">
      <summary className="cursor-pointer font-bold text-warn">Dev tools</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>Loads the sample profile and a sample friend from the saved Qloo test run. Uses cached data only.</p>
        <div className="flex gap-2">
          <button type="button" onClick={loadTestProfile} className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 font-bold">
            Load test profile
          </button>
          <button
            type="button"
            onClick={() => {
              clearAll();
              saveFriends([]);
              router.push('/');
            }}
            className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 font-bold"
          >
            Reset everything
          </button>
        </div>
        {message && <p>{message}</p>}
      </div>
    </details>
  );
}
