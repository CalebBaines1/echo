import { Suspense } from 'react';
import { MissionRun } from './mission-run';

export default function RunPage() {
  return (
    <Suspense>
      <MissionRun />
    </Suspense>
  );
}
