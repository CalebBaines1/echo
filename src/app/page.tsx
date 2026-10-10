import Link from 'next/link';
import { ContinueLink } from '@/components/continue-link';
import { MicIcon } from '@/components/icons';

export default function WelcomePage() {
  return (
    <main className="flex flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">echo</span>
        <span className="text-xs text-faint">Step 1 of 2</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-voice text-[2rem] leading-tight font-medium text-balance">Tell me what you love</h1>
        <p className="max-w-[30ch] text-sm text-muted">
          A two-minute chat about music, shows, games, and books. No account needed.
        </p>

        <Link
          href="/onboarding?mode=voice"
          aria-label="Start talking"
          className="mt-6 grid size-[88px] place-items-center rounded-full bg-accent text-accent-ink ring-[10px] ring-accent-soft transition-transform active:scale-95"
        >
          <MicIcon className="size-9" />
        </Link>
        <p className="text-sm text-muted">Tap to start talking</p>
      </div>

      <p className="text-center text-xs text-faint">
        Only the names of things you mention are kept. Your voice recording isn&apos;t saved.
      </p>
      <Link
        href="/onboarding?mode=text"
        className="rounded-2xl border border-line bg-surface px-4 py-3 text-center text-sm font-bold"
      >
        Type instead
      </Link>
      <ContinueLink />
    </main>
  );
}
