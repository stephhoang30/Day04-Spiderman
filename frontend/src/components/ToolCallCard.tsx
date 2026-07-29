"use client";

import { Collapsible, JsonBlock } from "@/components/JsonView";
import { Markdown } from "@/components/Markdown";
import { ERROR_COLOR, OK_COLOR, tint, toolVisual } from "@/lib/toolMeta";
import { safeHref } from "@/lib/url";
import type { DigestItem, LiveCall, ToolResultPayload } from "@/lib/types";

function truncate(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function ArgChips({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args ?? {});
  if (!entries.length) {
    return <span className="font-mono text-[11px] text-mist-400">{"{ }"} — không có argument</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-900/70 px-1.5 py-0.5 font-mono text-[11px]"
        >
          <span className="text-mist-400">{key}</span>
          <span className="text-mist-400/60">=</span>
          <span className="text-mist-50">
            {truncate(typeof value === "string" ? value : JSON.stringify(value), 64)}
          </span>
        </span>
      ))}
    </div>
  );
}

function ItemList({ items }: { items: DigestItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 6).map((item, index) => (
        <li key={index} className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12.5px] font-medium text-mist-50">{truncate(item.title ?? "(no title)", 110)}</p>
            {item.source && (
              <span className="shrink-0 rounded bg-ink-800 px-1.5 py-px font-mono text-[10px] text-mist-400">
                {item.source}
              </span>
            )}
          </div>
          {item.summary && (
            <p className="mt-1 text-[11.5px] leading-snug text-mist-400">{truncate(item.summary, 220)}</p>
          )}
          {item.url &&
            (safeHref(item.url) ? (
              <a
                href={safeHref(item.url) as string}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-mono text-[10.5px] text-web-400 hover:text-mist-50"
              >
                {truncate(item.url, 70)} ↗
              </a>
            ) : (
              <span className="mt-1 inline-block font-mono text-[10.5px] text-mist-400 line-through">
                {truncate(item.url, 70)}
              </span>
            ))}
        </li>
      ))}
      {items.length > 6 && (
        <li className="px-1 text-[11px] text-mist-400">+ {items.length - 6} item nữa (xem raw JSON)</li>
      )}
    </ul>
  );
}

function PolicyHits({ results }: { results: Record<string, unknown>[] }) {
  return (
    <ul className="space-y-1.5">
      {results.map((hit, index) => (
        <li key={index} className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-medium text-mist-50">
              {String(hit.title ?? "")} <span className="text-mist-400">› {String(hit.section ?? "")}</span>
            </p>
            <span className="shrink-0 rounded bg-ink-800 px-1.5 py-px font-mono text-[10px] text-mist-400">
              score {String(hit.score ?? "-")}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-mist-400">{truncate(String(hit.facts ?? ""), 260)}</p>
          <p className="mt-1 font-mono text-[10px] text-mist-400/70">
            {String(hit.doc_id ?? "")} · {String(hit.effective_date ?? "n/a")}
          </p>
        </li>
      ))}
    </ul>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-lg border border-dashed border-ink-600 bg-ink-950/30 px-2.5 py-3 text-center text-[11.5px] text-mist-400">
      Tool chạy OK nhưng trả về 0 kết quả — args có thể chưa khớp dữ liệu.
    </div>
  );
}

function ResultBody({ result }: { result: ToolResultPayload }) {
  if (result.error) {
    return (
      <div className="rounded-lg border border-spider-500/40 bg-spider-500/8 p-2.5">
        <p className="font-mono text-[11.5px] font-semibold text-spider-500">{String(result.error)}</p>
        <p className="mt-1 text-[11.5px] leading-snug text-mist-200">{String(result.message ?? "")}</p>
      </div>
    );
  }
  if (result.awaiting_user) {
    return (
      <div className="rounded-lg border border-warn-400/40 bg-warn-400/10 p-2.5">
        <p className="text-[12.5px] text-mist-50">{String(result.question ?? "")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="rounded border border-warn-400/40 px-1.5 py-px font-mono text-[10px] text-warn-400">
            response_type: {String(result.response_type ?? "text")}
          </span>
          {Array.isArray(result.options) &&
            (result.options as string[]).map((option) => (
              <span key={option} className="rounded bg-ink-800 px-1.5 py-px font-mono text-[10px] text-mist-200">
                {option}
              </span>
            ))}
        </div>
      </div>
    );
  }
  if (typeof result.markdown === "string") {
    return (
      <div className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-3">
        <Markdown text={result.markdown} />
      </div>
    );
  }
  if (Array.isArray(result.items)) {
    return result.items.length ? <ItemList items={result.items} /> : <EmptyResult />;
  }
  if (Array.isArray(result.results)) {
    return result.results.length ? (
      <PolicyHits results={result.results as Record<string, unknown>[]} />
    ) : (
      <EmptyResult />
    );
  }
  if (result.status) {
    return (
      <div className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-2.5 text-[12px] text-mist-200">
        status: <span className="font-mono text-mist-50">{String(result.status)}</span>
        {result.message ? <p className="mt-1 text-[11.5px] text-mist-400">{String(result.message)}</p> : null}
      </div>
    );
  }
  return <JsonBlock value={result} maxHeight={180} />;
}

export function ToolCallCard({ call, round }: { call: LiveCall; round: number }) {
  const visual = toolVisual(call.name);
  const failed = Boolean(call.result?.error);
  const running = call.state === "running";

  return (
    <div
      className="animate-rise overflow-hidden rounded-xl border bg-ink-900/50"
      style={{ borderColor: failed ? tint(ERROR_COLOR, 35) : "var(--color-ink-700)" }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700/70 px-3 py-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md font-mono text-[13px] font-bold"
          style={{ backgroundColor: tint(visual.color, 14), color: visual.color }}
        >
          {visual.glyph}
        </span>
        <span className="font-mono text-[13px] font-semibold" style={{ color: visual.color }}>
          {call.name}
        </span>
        <span className="text-[11px] text-mist-400">{visual.role}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="rounded border border-ink-600 px-1.5 py-px font-mono text-[10px] text-mist-400">
            round {round}
          </span>
          {running ? (
            <span className="flex items-center gap-1.5 rounded border border-web-500/40 bg-web-500/10 px-1.5 py-px font-mono text-[10px] text-web-400">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-web-400" /> chạy…
            </span>
          ) : (
            <span
              className="rounded border px-1.5 py-px font-mono text-[10px]"
              style={{
                borderColor: tint(failed ? ERROR_COLOR : OK_COLOR, 40),
                color: failed ? ERROR_COLOR : OK_COLOR,
                background: tint(failed ? ERROR_COLOR : OK_COLOR, 9),
              }}
            >
              {failed ? "error" : "ok"} · {call.durationMs ?? 0}ms
            </span>
          )}
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-widest text-mist-400 uppercase">arguments</p>
          <ArgChips args={call.args} />
        </div>

        {running ? (
          <div className="shimmer h-8 rounded-lg border border-ink-700/60 bg-ink-950/40" />
        ) : (
          call.result && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-widest text-mist-400 uppercase">result</p>
              <ResultBody result={call.result} />
              <Collapsible title="raw json" >
                <JsonBlock value={{ tool: call.name, args: call.args, result: call.result }} />
              </Collapsible>
            </div>
          )
        )}
      </div>
    </div>
  );
}
