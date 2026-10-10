'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AreaPicker } from '@/components/area-picker';
import { BackHeader } from '@/components/ui';
import { loadProfile, saveProfile, useStored } from '@/lib/store';

function AreaScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  // Only same-site paths, so the link can't send people elsewhere.
  const back = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
  const profile = useStored(loadProfile);
  if (profile === undefined) return null;

  return (
    <main className="flex flex-1 flex-col gap-4">
      <BackHeader href={back}>Where should Echo look?</BackHeader>
      <AreaPicker
        current={profile?.area.sample ? undefined : profile?.area}
        onPick={(area) => {
          if (profile) saveProfile({ ...profile, area });
          router.push(back);
        }}
      />
    </main>
  );
}

export default function AreaPage() {
  return (
    <Suspense>
      <AreaScreen />
    </Suspense>
  );
}
