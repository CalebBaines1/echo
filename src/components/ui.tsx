import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ArrowLeftIcon, HomeIcon, UsersIcon, WaveIcon } from './icons';

export function buttonClass(kind: 'primary' | 'secondary' = 'secondary', extra = '') {
  const base =
    'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-bold transition-transform active:scale-[0.98] disabled:cursor-default disabled:opacity-60';
  const look = kind === 'primary' ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink';
  return `${base} ${look} ${extra}`;
}

export function Button({ kind, className = '', ...props }: ComponentProps<'button'> & { kind?: 'primary' | 'secondary' }) {
  return <button type="button" {...props} className={buttonClass(kind, className)} />;
}

export function LinkButton({ kind, className = '', ...props }: ComponentProps<typeof Link> & { kind?: 'primary' | 'secondary' }) {
  return <Link {...props} className={buttonClass(kind, className)} />;
}

export function Label({ children, as: Tag = 'h2' }: { children: ReactNode; as?: 'h2' | 'h3' | 'p' }) {
  return <Tag className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">{children}</Tag>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-0.5 rounded-2xl border border-line bg-surface px-3.5 py-3 ${className}`}>{children}</div>;
}

export function Why({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 self-start rounded-lg bg-echo-soft px-2 py-1 text-[11.5px] font-semibold text-echo">{children}</span>;
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'accent' | 'echo' }) {
  const look =
    tone === 'accent'
      ? 'border-transparent bg-accent-soft text-accent-text'
      : tone === 'echo'
        ? 'border-transparent bg-echo-soft text-echo'
        : 'border-line bg-surface';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${look}`}>{children}</span>;
}

export function Voice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`font-voice text-[1.15rem] leading-snug ${className}`}>{children}</p>;
}

export function BackHeader({ href, children, right }: { href: string; children: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2">
      <Link href={href} className="flex min-w-0 items-center gap-1.5 text-base font-bold">
        <ArrowLeftIcon className="size-[18px] flex-none" />
        <span className="truncate">{children}</span>
      </Link>
      {right}
    </header>
  );
}

const TABS = [
  { href: '/home', label: 'Home', Icon: HomeIcon },
  { href: '/echo', label: 'Your echo', Icon: WaveIcon },
  { href: '/friends', label: 'Friends', Icon: UsersIcon },
] as const;

/** Bottom navigation for the main screens. */
export function TabBar({ current }: { current: (typeof TABS)[number]['href'] }) {
  return (
    <nav className="sticky bottom-0 -mx-4 mt-auto flex justify-around border-t border-line bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
      {TABS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={href === current ? 'page' : undefined}
          className={`flex flex-col items-center gap-0.5 px-2 text-[10.5px] font-semibold ${href === current ? 'text-accent' : 'text-faint'}`}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
      {label}
    </p>
  );
}
