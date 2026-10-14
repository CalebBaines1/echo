'use client';

import { useEffect } from 'react';
import { mergeServerFriends } from '@/lib/friends';
import { loadPlans, loadProfile, writePlansLocal, writeProfileLocal } from '@/lib/store';
import { recheckPendingTastes } from '@/lib/profile/recheck';
import { fetchFriends, pullFromServer } from '@/lib/sync';

/** Signs in (anonymously if needed) and pulls this user's data once per page load. */
export function SyncBoot() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const synced = await pullFromServer({
          profile: loadProfile(),
          plans: loadPlans(),
          writeProfile: (p) => !cancelled && writeProfileLocal(p),
          writePlans: (p) => !cancelled && writePlansLocal(p),
        });
        if (!synced || cancelled) return;
        const friends = await fetchFriends();
        if (friends && !cancelled) mergeServerFriends(friends);
        // Match tastes saved while Qloo was unreachable; the profile rebuilds itself when they change.
        if (!cancelled) await recheckPendingTastes();
      } catch (err) {
        console.error('Sync failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
