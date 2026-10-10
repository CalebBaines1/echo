import { Suspense } from 'react';
import { EchoProfileScreen } from './profile-screen';

export default function EchoPage() {
  return (
    <Suspense>
      <EchoProfileScreen />
    </Suspense>
  );
}
