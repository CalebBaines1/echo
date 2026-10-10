'use client';

import type { EchoProfile } from './types';

const W = 1080;
const H = 1350;

function fontVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the shareable taste card: summary, traits, three favorites. */
export async function renderTasteCard(p: EchoProfile): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const serif = fontVar('--font-newsreader', 'Georgia, serif');
  const sans = fontVar('--font-manrope', 'system-ui, sans-serif');

  ctx.fillStyle = '#17182b';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3b38c2';
  ctx.fillRect(0, 0, W, 14);

  ctx.fillStyle = '#9e9bff';
  ctx.font = `700 34px ${sans}`;
  ctx.fillText(p.name ? `${p.name.toUpperCase()}'S ECHO` : 'MY ECHO', 90, 150);

  ctx.fillStyle = '#ecedf5';
  ctx.font = `500 64px ${serif}`;
  let y = 260;
  for (const line of wrap(ctx, p.summary ?? 'What I love, in one place.', W - 180).slice(0, 6)) {
    ctx.fillText(line, 90, y);
    y += 82;
  }

  // Trait pills.
  y += 30;
  ctx.font = `700 34px ${sans}`;
  let x = 90;
  for (const t of (p.traits ?? []).slice(0, 4)) {
    const w = ctx.measureText(t).width + 56;
    if (x + w > W - 90) {
      x = 90;
      y += 82;
    }
    ctx.fillStyle = '#2a2862';
    ctx.beginPath();
    ctx.roundRect(x, y - 46, w, 66, 33);
    ctx.fill();
    ctx.fillStyle = '#c9c7ff';
    ctx.fillText(t, x + 28, y);
    x += w + 18;
  }

  // Three favorites.
  y = Math.max(y + 120, 900);
  ctx.fillStyle = '#7c7f96';
  ctx.font = `700 28px ${sans}`;
  ctx.fillText('THINGS I LOVE', 90, y);
  ctx.fillStyle = '#ecedf5';
  ctx.font = `500 44px ${serif}`;
  for (const t of p.tastes.filter((t) => t.status === 'matched').slice(0, 3)) {
    y += 70;
    ctx.fillText(t.entity?.name ?? t.name, 90, y);
  }

  ctx.fillStyle = '#7c7f96';
  ctx.font = `700 30px ${sans}`;
  ctx.fillText('echo', 90, H - 80);
  ctx.font = `400 26px ${sans}`;
  ctx.fillText('Tell Echo what you love. It finds what to do next.', 190, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card.'))), 'image/png'));
}

/** Shares the card with the share sheet, or downloads it where sharing files isn't supported. */
export async function shareTasteCard(p: EchoProfile): Promise<'shared' | 'downloaded'> {
  const blob = await renderTasteCard(p);
  const file = new File([blob], 'my-echo.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: 'My echo' });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-echo.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
