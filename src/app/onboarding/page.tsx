import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/icons';

// Placeholder until voice onboarding is built.
export default function OnboardingPage() {
  return (
    <main className="flex flex-1 flex-col gap-4">
      <Link href="/" className="flex items-center gap-1.5 text-base font-bold">
        <ArrowLeftIcon className="size-[18px]" />
        Back
      </Link>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="font-voice text-2xl font-medium">Onboarding is next</h1>
        <p className="max-w-[32ch] text-sm text-muted">
          The voice conversation that builds your echo goes here.
        </p>
      </div>
    </main>
  );
}
