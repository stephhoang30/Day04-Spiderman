"use client";

import { useState } from "react";
import { runCompare } from "@/lib/api";
import { Collapsible, JsonBlock } from "@/components/JsonView";
import { Markdown } from "@/components/Markdown";
import { ERROR_COLOR, OK_COLOR, STATUS_META, tint, toolVisual } from "@/lib/toolMeta";
import type { CompareRun, Meta, Scenario } from "@/lib/types";

function toolSignature(run: CompareRun): string {
  return run.turn.tool_events.map((event) => event.tool).join(" → ") || "no_tool";
}

function RunColumn({
  run,
  scenario,
  isDifferent,
}: {
  run: CompareRun;
  scenario: Scenario | null;
  isDifferent: boolean;
}) {
  const status = STATUS_META[run.turn.status] ?? { label: run.turn.status, color: "var(--status-idle)" };
  const actual = run.turn.tool_events.map((event) => event.tool);
  const expected = scenario?.no_tool ? [] : (scenario?.expected_tools ?? []);
  const pass = scenario
    ? scenario.no_tool
      ? actual.length === 0
      : expected.every((name) => actual.includes(name))
    : null;

  return (
    <div
      className="flex min-w-0 flex-col rounded-xl border bg-ink-900/40"
      style={{ borderColor: isDifferent ? tint("var(--color-web-500)", 45) : "var(--color-ink-700)" }}
    >
      <div className="space-y-1.5 border-b border-ink-700 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-spider-500/40 bg-spider-500/10 px-2 py-px font-mono text-[11px] text-spider-400">
            {run.version_label}
          </span>
          <span
            className="rounded-full border px-2 py-px font-mono text-[10px]"
            style={{ borderColor: tint(status.color, 34), color: status.color, background: tint(status.color, 10) }}
          >
            {status.label}
          </span>
          {pass !== null && (
            <span
              className="ml-auto rounded-full border px-2 py-px font-mono text-[10px]"
              style={
                pass
                  ? { borderColor: tint(OK_COLOR, 40), color: OK_COLOR }
                  : { borderColor: tint(ERROR_COLOR, 40), color: ERROR_COLOR }
              }
            >
              {pass ? "PASS" : "FAIL"}
            </span>
          )}
        </div>
        <p className="font-mono text-[10px] break-all text-mist-400">{run.artifact_version}</p>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <p className="mb-1 text-[9.5px] font-semibold tracking-widest text-mist-400 uppercase">tool path</p>
          <div className="flex flex-wrap items-center gap-1">
            {actual.length ? (
              actual.map((name, index) => (
                <span
                  key={index}
                  className="rounded px-1.5 py-px font-mono text-[10.5px]"
                  style={{ backgroundColor: tint(toolVisual(name).color, 12), color: toolVisual(name).color }}
                >
                  {name}
                </span>
              ))
            ) : (
              <span className="font-mono text-[10.5px] text-mist-400">no_tool</span>
            )}
          </div>
        </div>

        {run.turn.tool_events.map((event, index) => (
          <div key={index} className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-2">
            <p className="font-mono text-[11px]" style={{ color: toolVisual(event.tool).color }}>
              {event.tool}
              <span className="ml-1.5 text-mist-400">round {event.round ?? 1}</span>
              {event.result?.error && <span className="ml-1.5 text-spider-400">error</span>}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-snug break-all text-mist-400">
              {JSON.stringify(event.args)}
            </p>
          </div>
        ))}

        {run.turn.assistant_text && (
          <div className="rounded-lg border border-ink-700/60 bg-ink-950/40 p-2.5">
            <Markdown text={run.turn.assistant_text.slice(0, 900)} />
          </div>
        )}
        {run.turn.error && <p className="font-mono text-[11px] text-spider-400">{run.turn.error}</p>}

        <Collapsible title="turn json">
          <JsonBlock value={run.turn} maxHeight={280} />
        </Collapsible>
      </div>
    </div>
  );
}

export function CompareView({
  meta,
  provider,
  model,
  maxToolRounds,
  scenarios,
}: {
  meta: Meta;
  provider: string;
  model: string | null;
  maxToolRounds: number;
  scenarios: Scenario[];
}) {
  const [message, setMessage] = useState("Tweet mới nhất của Sam Altman là gì?");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [selected, setSelected] = useState<string[]>(
    meta.versions.slice(0, 2).map((item) => item.label),
  );
  const [runs, setRuns] = useState<CompareRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signatures = new Set(runs.map(toolSignature));
  const diverged = signatures.size > 1;

  const toggle = (label: string) =>
    setSelected((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );

  const run = async () => {
    if (!message.trim() || !selected.length) return;
    setBusy(true);
    setError(null);
    setRuns([]);
    try {
      const result = await runCompare({
        message: message.trim(),
        provider,
        model,
        versions: selected,
        max_tool_rounds: maxToolRounds,
      });
      setRuns(result.runs);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-mist-50">So sánh artifact version</h2>
            <p className="mt-0.5 text-[12px] text-mist-400">
              Cùng một prompt chạy qua nhiều bản prompt/tools để thấy routing thay đổi thế nào.
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={busy || !selected.length}
            className="rounded-lg border border-spider-500/50 bg-spider-500/15 px-4 py-2 text-[12.5px] font-medium text-spider-400 transition hover:bg-spider-500/25 disabled:opacity-40"
          >
            {busy ? "đang chạy…" : `▶ chạy ${selected.length} version`}
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setScenario(null);
            }}
            rows={2}
            className="w-full resize-none rounded-lg border border-ink-600 bg-ink-950/70 px-3 py-2 text-[13px] text-mist-50 outline-none focus:border-web-500"
            placeholder="Prompt demo…"
          />

          <div className="flex flex-wrap gap-1.5">
            {meta.versions.map((version) => (
              <button
                key={version.label}
                type="button"
                onClick={() => toggle(version.label)}
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] transition ${
                  selected.includes(version.label)
                    ? "border-web-500/50 bg-web-500/12 text-web-400"
                    : "border-ink-700 text-mist-400 hover:text-mist-200"
                }`}
              >
                {version.label}
                <span className="ml-1.5 font-mono text-[9.5px] opacity-70">{version.prompt_hash.slice(0, 6)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {scenarios.slice(0, 8).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMessage(item.query);
                  setScenario(item);
                }}
                className="rounded-md border border-ink-700 px-2 py-1 font-mono text-[10px] text-mist-400 transition hover:border-web-500/50 hover:text-mist-200"
              >
                {item.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-spider-500/40 bg-spider-500/10 px-3 py-2.5 text-[12px] text-spider-400">
          {error}
        </div>
      )}

      {runs.length > 0 && (
        <div
          className={`rounded-xl border px-3 py-2 text-[12px] ${
            diverged
              ? "border-web-500/40 bg-web-500/10 text-web-400"
              : "border-ink-700 bg-ink-900/40 text-mist-400"
          }`}
        >
          {diverged
            ? "⚡ Các version chọn tool khác nhau — đây chính là bằng chứng prompt/tool declaration đổi hành vi."
            : "Các version cho cùng một tool path."}
        </div>
      )}

      <div className={`grid gap-3 ${runs.length > 2 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {runs.map((item) => (
          <RunColumn
            key={item.version_label}
            run={item}
            scenario={scenario}
            isDifferent={diverged}
          />
        ))}
        {busy &&
          selected.map((label) => (
            <div key={label} className="shimmer h-40 rounded-xl border border-ink-700 bg-ink-900/40" />
          ))}
      </div>
    </div>
  );
}
