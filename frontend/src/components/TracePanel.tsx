"use client";

import { API_BASE } from "@/lib/api";
import { Collapsible, CopyButton, JsonBlock } from "@/components/JsonView";
import { ERROR_COLOR, OK_COLOR, tint, toolVisual } from "@/lib/toolMeta";
import type { ChatEntry, Scenario, TranscriptListItem } from "@/lib/types";

type AgentEntry = Extract<ChatEntry, { kind: "agent" }>;

function Stat({ label, value, tone = "var(--color-mist-50)" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-2.5 py-2">
      <p className="text-[9.5px] font-semibold tracking-widest text-mist-400 uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-[15px]" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}

/** So khớp tool thực tế với expect của eval case đang demo. */
function ExpectationCheck({ scenario, entry }: { scenario: Scenario; entry: AgentEntry }) {
  const actual = entry.rounds.flatMap((round) => round.calls.map((call) => call.name));
  const expected = scenario.no_tool ? [] : scenario.expected_tools;
  const routingOk = scenario.no_tool
    ? actual.length === 0
    : expected.every((name) => actual.includes(name));

  const argChecks = scenario.expected_args.flatMap((args, index) => {
    const name = scenario.expected_tools[index];
    const call = entry.rounds.flatMap((round) => round.calls).find((item) => item.name === name);
    return Object.entries(args ?? {}).map(([key, value]) => ({
      tool: name,
      key,
      expected: value,
      actual: call?.args?.[key],
      ok: JSON.stringify(call?.args?.[key]) === JSON.stringify(value),
    }));
  });
  const argsOk = argChecks.every((check) => check.ok);

  return (
    <div className="space-y-2 rounded-lg border border-ink-700 bg-ink-950/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-mist-400">{scenario.id}</p>
        <span
          className="rounded-full border px-2 py-px font-mono text-[10px]"
          style={
            routingOk && argsOk
              ? { borderColor: tint(OK_COLOR, 40), color: OK_COLOR, background: tint(OK_COLOR, 10) }
              : { borderColor: tint(ERROR_COLOR, 40), color: ERROR_COLOR, background: tint(ERROR_COLOR, 10) }
          }
        >
          {routingOk && argsOk ? "PASS" : "FAIL"}
        </span>
      </div>
      {scenario.what_it_tests && <p className="text-[11px] leading-snug text-mist-400">{scenario.what_it_tests}</p>}

      <div className="space-y-1">
        <p className="text-[9.5px] font-semibold tracking-widest text-mist-400 uppercase">routing</p>
        <div className="flex flex-wrap items-center gap-1 font-mono text-[10.5px]">
          <span className="text-mist-400">expect:</span>
          {expected.length ? (
            expected.map((name, index) => (
              <span key={index} style={{ color: toolVisual(name).color }}>
                {name}
              </span>
            ))
          ) : (
            <span className="text-mist-200">no_tool</span>
          )}
          <span className="text-mist-400">| actual:</span>
          {actual.length ? (
            actual.map((name, index) => (
              <span key={index} style={{ color: toolVisual(name).color }}>
                {name}
              </span>
            ))
          ) : (
            <span className="text-mist-200">no_tool</span>
          )}
        </div>
      </div>

      {argChecks.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9.5px] font-semibold tracking-widest text-mist-400 uppercase">arguments</p>
          {argChecks.map((check, index) => (
            <div key={index} className="flex items-center gap-1.5 font-mono text-[10.5px]">
              <span style={{ color: check.ok ? OK_COLOR : ERROR_COLOR }}>{check.ok ? "✓" : "✕"}</span>
              <span className="text-mist-400">{check.key}</span>
              <span className="text-mist-50">{JSON.stringify(check.actual)}</span>
              {!check.ok && <span className="text-mist-400">≠ {JSON.stringify(check.expected)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TracePanel({
  entry,
  scenario,
  sessionId,
  transcripts,
  onOpenTranscript,
}: {
  entry: AgentEntry | null;
  scenario: Scenario | null;
  sessionId: string | null;
  transcripts: TranscriptListItem[];
  onOpenTranscript: (id: string) => void;
}) {
  const calls = entry?.rounds.flatMap((round) => round.calls) ?? [];
  const errors = calls.filter((call) => call.result?.error).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="rounds" value={entry?.rounds.length ?? 0} />
        <Stat label="tool calls" value={calls.length} />
        <Stat label="tool error" value={errors} tone={errors ? ERROR_COLOR : OK_COLOR} />
        <Stat
          label="latency"
          value={entry?.durationMs !== undefined ? `${(entry.durationMs / 1000).toFixed(1)}s` : "—"}
        />
      </div>

      <div className="space-y-1.5 rounded-lg border border-ink-700 bg-ink-950/50 p-2.5 font-mono text-[10.5px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-mist-400">artifact_version</span>
          <span className="truncate text-web-400">{entry?.artifact_version ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-mist-400">session</span>
          <span className="truncate text-mist-200">{sessionId ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-mist-400">transcript</span>
          <span className="truncate text-mist-200">{entry?.transcriptId ?? "—"}</span>
        </div>
        {entry?.transcriptId && (
          <div className="flex gap-1.5 pt-1">
            <a
              href={`${API_BASE}/api/transcripts/${entry.transcriptId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-ink-600 px-2 py-1 text-[11px] text-mist-400 transition hover:border-web-500 hover:text-mist-50"
            >
              mở transcript JSON ↗
            </a>
            <CopyButton value={entry.transcriptId} label="copy id" />
          </div>
        )}
      </div>

      {scenario && entry && entry.status !== "running" && <ExpectationCheck scenario={scenario} entry={entry} />}

      {calls.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9.5px] font-semibold tracking-widest text-mist-400 uppercase">tool timeline</p>
          {calls.map((call, index) => {
            const visual = toolVisual(call.name);
            return (
              <div key={call.call_id} className="flex items-center gap-2 font-mono text-[10.5px]">
                <span className="w-4 text-right text-mist-400/70">{index + 1}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: visual.color }} />
                <span style={{ color: visual.color }}>{call.name}</span>
                <span className="flex-1 border-b border-dashed border-ink-700" />
                <span className={call.result?.error ? "text-spider-500" : "text-mist-400"}>
                  {call.state === "running"
                    ? "đang chạy…"
                    : `${call.result?.error ? "error" : "ok"} ${call.durationMs ?? 0}ms`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {entry && (
        <Collapsible title="turn json (evidence)">
          <JsonBlock value={entry} maxHeight={320} />
        </Collapsible>
      )}

      <Collapsible title="transcripts đã lưu" count={transcripts.length}>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {transcripts.map((item) => (
            <button
              key={item.file}
              type="button"
              onClick={() => onOpenTranscript(item.transcript_id)}
              className="block w-full rounded border border-ink-700/60 px-2 py-1.5 text-left font-mono text-[10px] transition hover:border-web-500/50"
            >
              <span className="block truncate text-mist-200">{item.transcript_id}</span>
              <span className="text-mist-400">
                {item.surface} · {item.turn_count} turn · {item.artifact_version ?? "—"}
              </span>
            </button>
          ))}
          {!transcripts.length && <p className="text-[11px] text-mist-400">Chưa có transcript nào.</p>}
        </div>
      </Collapsible>
    </div>
  );
}
