'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Area } from '@/lib/profile/types';
import { apiFetch } from '@/lib/supabase/browser';
import { Button } from './ui';

/** Find an area by name or from the browser's location. Calls onPick with the chosen area. */
export function AreaPicker({ current, onPick }: { current?: Area; onPick: (a: Area) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Area[] | null>(null);
  const [busy, setBusy] = useState<'search' | 'locate' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function lookup(body: object): Promise<Area[]> {
    const res = await apiFetch('/api/geo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "Couldn't look that place up just now. Try again.");
    return data.areas as Area[];
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setMessage('Type a neighbourhood or city.');
    setBusy('search');
    setMessage(null);
    try {
      const areas = await lookup({ query: q });
      setResults(areas);
      if (!areas.length) setMessage(`No places found for "${q}". Try adding the city.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!('geolocation' in navigator)) return setMessage("This browser can't share your location. Type your area instead.");
    setBusy('locate');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const [area] = await lookup({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          if (area) onPick(area);
        } catch (err) {
          setMessage((err as Error).message);
        } finally {
          setBusy(null);
        }
      },
      () => {
        setBusy(null);
        setMessage('Location access is off. Type your area instead.');
      },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <p className="text-sm text-muted">
          Now: <span className="font-semibold text-ink">{current.label}</span>
        </p>
      )}
      <Button kind="primary" onClick={locate} disabled={busy !== null}>
        {busy === 'locate' ? 'Finding you…' : 'Use my location'}
      </Button>
      <form onSubmit={search} className="flex gap-2">
        <label htmlFor="area-query" className="sr-only">
          Neighbourhood or city
        </label>
        <input
          id="area-query"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (message) setMessage(null);
          }}
          placeholder="Williamsburg, Brooklyn"
          autoComplete="address-level2"
          maxLength={120}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
        />
        <Button type="submit" disabled={busy !== null}>
          {busy === 'search' ? 'Finding…' : 'Find'}
        </Button>
      </form>
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {results.map((a) => (
            <li key={`${a.label}-${a.lat}-${a.lon}`}>
              <button
                type="button"
                onClick={() => onPick(a)}
                className="w-full cursor-pointer rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-accent"
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="text-sm text-warn">
          {message}
        </p>
      )}
      <p className="text-xs text-faint">
        Echo keeps only a rough area (about a kilometre), never your exact location. Place search by{' '}
        <Link href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noreferrer">
          OpenStreetMap
        </Link>
        .
      </p>
    </div>
  );
}
