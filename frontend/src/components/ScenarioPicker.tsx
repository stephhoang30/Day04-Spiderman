"use client";

import { useMemo, useState } from "react";
import { tint, toolVisual } from "@/lib/toolMeta";
import type { Scenario } from "@/lib/types";

const SUITE_LABEL: Record<string, string> = {
  base: "base eval",
  group: "case của nhóm",
  research: "research ext",
};

export function ScenarioPicker({
  scenarios,
  onPick,
  disabled,
}: {
  scenarios: Scenario[];
  onPick: (scenario: Scenario) => void;
  disabled: boolean;
}) {
  const suites = useMemo(() => {
    const seen = new Set(scenarios.map((item) => item.suite));
    return ["base", "group", "research"].filter((suite) => seen.has(suite as Scenario["suite"]));
  }, [scenarios]);
  const [suite, setSuite] = useState<string>(suites[0] ?? "base");

  const visible = scenarios.filter((item) => item.suite === suite);
  if (!scenarios.length) {
    return <p className="text-[11.5px] text-mist-400">Chưa có eval case nào để làm demo prompt.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {suites.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSuite(item)}
            className={`rounded-md border px-2 py-1 text-[10.5px] transition ${
              suite === item
                ? "border-web-500/50 bg-web-500/12 text-web-400"
                : "border-ink-700 text-mist-400 hover:text-mist-200"
            }`}
          >
            {SUITE_LABEL[item] ?? item}
          </button>
        ))}
      </div>
      <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
        {visible.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(scenario)}
            className="block w-full rounded-lg border border-ink-700/60 bg-ink-900/40 px-2.5 py-2 text-left transition hover:border-web-500/50 hover:bg-ink-800/60 disabled:opacity-50"
          >
            <p className="text-[12px] leading-snug text-mist-200">{scenario.query}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="font-mono text-[9.5px] text-mist-400/70">{scenario.id}</span>
              {scenario.no_tool && (
                <span className="rounded bg-ink-800 px-1 font-mono text-[9.5px] text-mist-400">no_tool</span>
              )}
              {scenario.expected_tools.map((name, index) => {
                const visual = toolVisual(name);
                return (
                  <span
                    key={`${name}-${index}`}
                    className="rounded px-1 font-mono text-[9.5px]"
                    style={{ backgroundColor: tint(visual.color, 12), color: visual.color }}
                  >
                    → {name}
                  </span>
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
