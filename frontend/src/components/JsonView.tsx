"use client";

import { useState } from "react";

export function JsonBlock({
  value,
  maxHeight = 260,
}: {
  value: unknown;
  maxHeight?: number;
}) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre
      className="overflow-auto rounded-lg border border-ink-700 bg-ink-950/70 p-3 font-mono text-[11px] leading-[1.5] text-mist-200"
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}

export function Collapsible({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-900/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium tracking-wide text-mist-400 uppercase hover:text-mist-200"
      >
        <span className="flex items-center gap-2">
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          {title}
          {count !== undefined && (
            <span className="rounded bg-ink-700 px-1.5 py-px font-mono text-[10px] text-mist-200">{count}</span>
          )}
        </span>
      </button>
      {open && <div className="border-t border-ink-700/70 p-3">{children}</div>}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="rounded-md border border-ink-600 px-2 py-1 text-[11px] text-mist-400 transition hover:border-web-500 hover:text-mist-50"
    >
      {copied ? "✓ đã copy" : label}
    </button>
  );
}
