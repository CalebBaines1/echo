'use client';

import { useEffect } from 'react';
import { mergeServerFriends } from '@/lib/friends';
import { loadPlans, loadProfile, writePlansLocal, writeProfileLocal } from '@/lib/store';
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
