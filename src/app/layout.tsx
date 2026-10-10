import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope, Newsreader } from 'next/font/google';
import { SyncBoot } from '@/components/sync-boot';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', style: ['normal', 'italic'], display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Echo',
  description: 'Tell Echo what you love. It finds hobbies, places, and plans that fit you.',
  applicationName: 'Echo',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1018' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <body>
        <SyncBoot />
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
          {children}
        </div>
      </body>
    </html>
  );
}
