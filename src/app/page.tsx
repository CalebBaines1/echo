import Link from 'next/link';
import { ContinueLink } from '@/components/continue-link';
import { ArrowRightIcon } from '@/components/icons';
import { SampleButton } from '@/components/sample-button';

export default function WelcomePage() {
  return (
    <main className="flex flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">echo</span>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="font-voice text-[2.4rem] leading-[1.05] font-medium text-balance">Tell Echo what you love. It finds what to do next.</h1>
        <p className="max-w-[34ch] text-[0.95rem] text-muted">
          Tap a few favorite shows, songs and games. Echo turns them into real places and plans near you, and checks in after.
        </p>
        <ol className="mt-2 flex flex-col gap-2 text-sm">
          <li className="flex gap-3">
            <span className="grid size-6 flex-none place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-text">1</span>
            Tap what you love and what you&apos;d like to try. About a minute.
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 flex-none place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-text">2</span>
            Echo finds one real thing to do near you, matched to your taste.
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 flex-none place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-text">3</span>
            Say yes, go, and tell Echo how it went. It plans the next one better.
          </li>
        </ol>
      </div>

      <Link
        href="/onboarding"
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-accent bg-accent px-4 py-3.5 text-[0.95rem] font-bold text-accent-ink active:scale-[0.98]"
      >
        Start <ArrowRightIcon className="size-4" />
      </Link>
      <SampleButton />
      <ContinueLink />
      <p className="text-center text-xs text-faint">No account needed. Echo never books or sends anything without your OK.</p>
    </main>
  );
}
