import type { Step } from '@/lib/plans/types';
import { CheckIcon, XIcon } from './icons';

export function StepList({ steps, running }: { steps: Step[]; running?: string }) {
  return (
    <ol className="flex flex-col gap-2 border-t border-line pt-3" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-[0.82rem] leading-snug">
          {s.kind === 'dropped' ? (
            <XIcon className="mt-0.5 size-4 flex-none text-warn" />
          ) : s.kind === 'info' ? (
            <span className="mt-1.5 size-1.5 flex-none rounded-full bg-faint" aria-hidden="true" />
          ) : (
            <CheckIcon className="mt-0.5 size-4 flex-none text-echo" />
          )}
          <span>{s.text}</span>
        </li>
      ))}
      {running && (
        <li className="flex items-start gap-2 text-[0.82rem] text-accent-text">
          <span className="mt-0.5 size-3.5 flex-none animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
          <span>{running}</span>
        </li>
      )}
    </ol>
  );
}
