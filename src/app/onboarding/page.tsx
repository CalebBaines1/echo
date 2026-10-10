import { OnboardingClient } from './onboarding-client';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <OnboardingClient initialMode={mode === 'text' ? 'text' : 'voice'} />;
}
