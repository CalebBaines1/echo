import { Suspense } from 'react';
import { GroupPlanRun } from './group-plan-run';

export default function GroupPlanPage() {
  return (
    <Suspense>
      <GroupPlanRun />
    </Suspense>
  );
}
