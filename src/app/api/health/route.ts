import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness check. Reports whether Qloo live calls are enabled; never calls Qloo. */
export function GET() {
  return NextResponse.json({
    ok: true,
    qloo: {
      mode: process.env.QLOO_LIVE === '1' ? 'live' : 'offline',
      keyConfigured: Boolean(process.env.QLOO_API_KEY?.trim()),
    },
  });
}
