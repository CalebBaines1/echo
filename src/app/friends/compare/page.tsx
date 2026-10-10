import { Suspense } from 'react';
import { CompareScreen } from './compare-screen';

export default function ComparePage() {
  return (
    <Suspense>
      <CompareScreen />
    </Suspense>
  );
}
