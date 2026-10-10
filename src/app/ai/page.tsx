'use client';

import { useRef, useState } from 'react';
import { Button, Label, LinkButton, TabBar } from '@/components/ui';
import { profileAsPrompt } from '@/lib/profile/prompt';
import { loadProfile, useStored } from '@/lib/store';

export default function UseWithAiPage() {
  const profile = useStored(loadProfile);
  const [includeArea, setIncludeArea] = useState(false);
  const [includePicks, setIncludePicks] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  if (profile === undefined) return null;
  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted">Build your echo first.</p>
        <LinkButton href="/onboarding" kind="primary">
          Tell Echo what you love
        </LinkButton>
      </main>
    );
  }

  const prompt = profileAsPrompt(profile, { includeArea, includePicks });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus('Copied. Paste it at the start of a chat with any AI assistant.');
    } catch {
      textRef.current?.select();
      setStatus('Select the text and copy it.');
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="text-lg font-bold">Use with AI</h1>
      <p className="text-sm text-muted">Give any AI assistant your taste, so you never have to explain it again.</p>

      <Label>Your echo as a prompt</Label>
      <label htmlFor="prompt" className="sr-only">
        Profile prompt
      </label>
      <textarea
        id="prompt"
        ref={textRef}
        readOnly
        value={prompt}
        rows={10}
        className="w-full resize-none rounded-2xl bg-sunk px-3.5 py-3 font-mono text-[0.75rem] leading-relaxed text-ink"
      />
      <Button kind="primary" onClick={copy}>
        Copy as prompt
      </Button>
      {status && (
        <p role="status" className="text-sm text-muted">
          {status}
        </p>
      )}

      <Label>What to include</Label>
      <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[0.85rem]">
        Your area
        <input type="checkbox" checked={includeArea} onChange={(e) => setIncludeArea(e.target.checked)} className="size-4 accent-accent" />
      </label>
      <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-[0.85rem]">
        Echo&apos;s picks for you
        <input type="checkbox" checked={includePicks} onChange={(e) => setIncludePicks(e.target.checked)} className="size-4 accent-accent" />
      </label>

      <div className="rounded-2xl border border-dashed border-line px-3.5 py-3">
        <p className="text-[0.9rem] font-bold">Connect as an MCP server</p>
        <p className="text-sm text-muted">Coming soon: let Claude and other assistants ask Echo for recommendations directly, with access you can revoke.</p>
      </div>
      <TabBar current="/ai" />
    </main>
  );
}
