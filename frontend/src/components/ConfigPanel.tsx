"use client";

import { tint, toolVisual } from "@/lib/toolMeta";
import type { Meta, ToolSpec, VersionSummary } from "@/lib/types";

export type RunConfig = {
  provider: string;
  model: string | null;
  version: string;
  historyWindow: number;
  maxToolRounds: number;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold tracking-widest text-mist-400 uppercase">{label}</span>
        {hint && <span className="font-mono text-[10px] text-mist-400/70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  "w-full rounded-lg border border-ink-600 bg-ink-900/80 px-2.5 py-1.5 text-[12.5px] text-mist-50 outline-none transition focus:border-web-500";

export function ConfigPanel({
  meta,
  config,
  onChange,
  disabled,
}: {
  meta: Meta;
  config: RunConfig;
  onChange: (next: RunConfig) => void;
  disabled: boolean;
}) {
  const provider = meta.providers.find((item) => item.key === config.provider);
  const version = meta.versions.find((item) => item.label === config.version);

  return (
    <div className="space-y-3">
      <Field label="provider" hint={provider?.key_present ? "key ✓" : "thiếu key"}>
        <select
          className={selectClass}
          value={config.provider}
          disabled={disabled}
          onChange={(event) => {
            const next = meta.providers.find((item) => item.key === event.target.value);
            onChange({ ...config, provider: event.target.value, model: next?.models[0] ?? null });
          }}
        >
          {meta.providers.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label} {item.key_present ? "✓" : "✕"}
            </option>
          ))}
        </select>
      </Field>

      <Field label="model">
        <select
          className={selectClass}
          value={config.model ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({ ...config, model: event.target.value || null })}
        >
          <option value="">(mặc định của provider)</option>
          {provider?.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </Field>

      <Field label="artifact version" hint={version ? `${version.tool_count} tools` : undefined}>
        <select
          className={selectClass}
          value={config.version}
          disabled={disabled}
          onChange={(event) => onChange({ ...config, version: event.target.value })}
        >
          {meta.versions.map((item) => (
            <option key={item.label} value={item.label}>
              {item.label} {item.is_working ? "(đang sửa)" : "(snapshot)"}
            </option>
          ))}
        </select>
      </Field>

      {version && <VersionBadge version={version} />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="history">
          <input
            type="number"
            min={0}
            max={20}
            className={selectClass}
            value={config.historyWindow}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, historyWindow: Number(event.target.value) })}
          />
        </Field>
        <Field label="max rounds">
          <input
            type="number"
            min={1}
            max={10}
            className={selectClass}
            value={config.maxToolRounds}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, maxToolRounds: Number(event.target.value) })}
          />
        </Field>
      </div>
    </div>
  );
}

export function VersionBadge({ version }: { version: VersionSummary }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/50 p-2.5">
      <p className="font-mono text-[11px] break-all text-web-400">{version.artifact_version}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 font-mono text-[10px] text-mist-400">
        <span>prompt {version.prompt_hash.slice(0, 8)}</span>
        <span>tools {version.tools_hash.slice(0, 8)}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] text-mist-400">{version.description}</p>
    </div>
  );
}

export function ToolCatalog({ tools }: { tools: ToolSpec[] }) {
  return (
    <div className="space-y-1.5">
      {tools.map((tool) => {
        const visual = toolVisual(tool.name);
        const missingKey = tool.env_keys.some((key) => !key.present);
        return (
          <div
            key={tool.name}
            className="group flex items-start gap-2 rounded-lg border border-ink-700/60 bg-ink-900/40 px-2.5 py-2 transition hover:border-ink-600"
            title={tool.description}
          >
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-bold"
              style={{ backgroundColor: tint(visual.color, 14), color: visual.color }}
            >
              {visual.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-mono text-[12px]" style={{ color: visual.color }}>
                {tool.name}
                {!tool.implemented && <span className="text-[9px] text-spider-400">chưa impl</span>}
                {missingKey && (
                  <span className="rounded bg-warn-400/15 px-1 text-[9px] text-warn-400" title="thiếu API key">
                    key ✕
                  </span>
                )}
              </p>
              <p className="truncate text-[10.5px] text-mist-400">{visual.role}</p>
            </div>
            <span className="font-mono text-[9.5px] text-mist-400/60">{tool.required.join(",")}</span>
          </div>
        );
      })}
    </div>
  );
}
