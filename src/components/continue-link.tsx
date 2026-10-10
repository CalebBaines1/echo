'use client';

import Link from 'next/link';
import { loadProfile, useStored } from '@/lib/store';

/** Shown on the welcome screen when this browser already has a profile. */
export function ContinueLink() {
  const profile = useStored(loadProfile);
  if (!profile) return null;
  return (
    <Link href="/home" className="text-center text-sm font-bold text-accent">
      Continue as {profile.name ?? 'you'}
    </Link>
  );
}
