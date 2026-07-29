"use client";

import { useEffect, useRef } from "react";
import { Markdown } from "@/components/Markdown";
import { ToolCallCard } from "@/components/ToolCallCard";
import { STATUS_META, tint } from "@/lib/toolMeta";
import type { ChatEntry } from "@/lib/types";

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: "var(--status-idle)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-px font-mono text-[10px]"
      style={{ borderColor: tint(meta.color, 34), color: meta.color, background: tint(meta.color, 10) }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "running" ? "animate-pulse-dot" : ""}`}
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="animate-rise flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-br-md border border-spider-500/35 bg-spider-500/12 px-3.5 py-2.5">
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-mist-50">{text}</p>
      </div>
    </div>
  );
}

function AgentTurn({ entry }: { entry: Extract<ChatEntry, { kind: "agent" }> }) {
  const toolCount = entry.rounds.reduce((sum, round) => sum + round.calls.length, 0);
  const errorCount = entry.rounds.reduce(
    (sum, round) => sum + round.calls.filter((call) => call.result?.error).length,
    0,
  );

  return (
    <div className="animate-rise space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-spider-500/40 bg-spider-500/12 text-[12px]">
          🕷
        </span>
        <span className="text-[12.5px] font-semibold text-mist-50">Research Agent</span>
        <StatusPill status={entry.status} />
        {entry.versionLabel && (
          <span className="rounded border border-ink-600 px-1.5 py-px font-mono text-[10px] text-mist-400">
            {entry.versionLabel}
          </span>
        )}
        {entry.model && (
          <span className="rounded border border-ink-600 px-1.5 py-px font-mono text-[10px] text-mist-400">
            {entry.model}
          </span>
        )}
        {toolCount > 0 && (
          <span className="rounded border border-ink-600 px-1.5 py-px font-mono text-[10px] text-mist-400">
            {toolCount} tool call{errorCount ? ` · ${errorCount} lỗi` : ""}
          </span>
        )}
        {entry.durationMs !== undefined && (
          <span className="rounded border border-ink-600 px-1.5 py-px font-mono text-[10px] text-mist-400">
            {(entry.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {entry.rounds.map((round) => (
        <div key={round.round} className="space-y-2 pl-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-widest text-mist-400 uppercase">round {round.round}</span>
            <span className="h-px flex-1 bg-ink-700" />
          </div>
          {round.assistantText && round.assistantText !== entry.text && (
            <div className="rounded-xl border border-ink-700 bg-ink-900/40 px-3 py-2">
              <Markdown text={round.assistantText} />
            </div>
          )}
          {round.calls.map((call) => (
            <ToolCallCard key={call.call_id} call={call} round={round.round} />
          ))}
        </div>
      ))}

      {entry.error && (
        <div className="rounded-xl border border-spider-500/40 bg-spider-500/10 px-3 py-2.5">
          <p className="font-mono text-[12px] text-spider-400">{entry.error}</p>
        </div>
      )}

      {entry.status !== "running" && entry.text && (
        <div className="rounded-2xl rounded-tl-md border border-ink-600 bg-ink-850/80 px-3.5 py-3">
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-mist-400 uppercase">
            final response
          </p>
          <Markdown text={entry.text} />
        </div>
      )}

      {entry.status === "running" && !entry.rounds.length && (
        <div className="shimmer h-10 rounded-xl border border-ink-700 bg-ink-900/40" />
      )}
    </div>
  );
}

export function ChatThread({ entries, emptyState }: { entries: ChatEntry[]; emptyState: React.ReactNode }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  if (!entries.length) return <>{emptyState}</>;

  return (
    <div className="space-y-5">
      {entries.map((entry) =>
        entry.kind === "user" ? (
          <UserBubble key={entry.id} text={entry.text} />
        ) : (
          <AgentTurn key={entry.id} entry={entry} />
        ),
      )}
      {/* chừa chỗ cho ô nhập dính đáy, tránh tin cuối bị che khi auto-scroll */}
      <div ref={bottomRef} style={{ scrollMarginBottom: "140px" }} />
    </div>
  );
}
