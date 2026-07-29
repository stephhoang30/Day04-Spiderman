"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, fetchMeta, fetchScenarios, fetchTranscripts, streamChat } from "@/lib/api";
import { ChatThread } from "@/components/ChatThread";
import { CompareView } from "@/components/CompareView";
import { ConfigPanel, ToolCatalog, type RunConfig } from "@/components/ConfigPanel";
import { ScenarioPicker } from "@/components/ScenarioPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TracePanel } from "@/components/TracePanel";
import type {
  ChatEntry,
  LiveRound,
  Meta,
  Scenario,
  StreamEvent,
  TranscriptListItem,
} from "@/lib/types";

type Tab = "chat" | "compare";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "chat", label: "Chat + Trace", hint: "chạy agent, xem từng tool call" },
  { key: "compare", label: "So sánh version", hint: "1 prompt · N artifact version" },
];

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-xl p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[10.5px] font-semibold tracking-widest text-mist-400 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [config, setConfig] = useState<RunConfig>({
    provider: "openai",
    model: null,
    version: "current",
    historyWindow: 5,
    maxToolRounds: 4,
  });

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const abortRef = useRef<AbortController | null>(null);

  /** Đọc lại artifact registry từ đĩa. `initial` chỉ đúng cho lần nạp đầu:
   *  các lần sau giữ nguyên lựa chọn của người dùng nếu version đó còn tồn tại. */
  const loadMeta = useCallback(async (initial = false) => {
    setRefreshing(true);
    try {
      const [metaData, scenarioData] = await Promise.all([fetchMeta(), fetchScenarios()]);
      setMeta(metaData);
      setScenarios(scenarioData.scenarios);
      setBootError(null);
      setConfig((current) => {
        if (!initial) {
          const stillThere = metaData.versions.some((item) => item.label === current.version);
          return stillThere ? current : { ...current, version: metaData.defaults.version };
        }
        const withKey = metaData.providers.find((item) => item.key_present) ?? metaData.providers[0];
        return {
          ...current,
          provider: withKey?.key ?? current.provider,
          model: withKey?.default_model ?? withKey?.models[0] ?? null,
          version: metaData.defaults.version,
          historyWindow: metaData.defaults.history_window,
          maxToolRounds: metaData.defaults.max_tool_rounds,
        };
      });
    } catch (exc) {
      setBootError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadMeta(true);
    })();
  }, [loadMeta]);

  // Sửa artifacts trong IDE rồi quay lại tab trình duyệt -> tự nạp lại registry.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") loadMeta();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadMeta]);

  const refreshTranscripts = useCallback(async () => {
    try {
      const data = await fetchTranscripts();
      setTranscripts(data.transcripts);
    } catch {
      /* backend chưa sẵn sàng */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTranscripts()
      .then((data) => {
        if (!cancelled) setTranscripts(data.transcripts);
      })
      .catch(() => {
        /* backend chưa sẵn sàng */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastAgentEntry = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry.kind === "agent") return entry;
    }
    return null;
  }, [entries]);

  const patchAgent = useCallback(
    (
      id: string,
      updater: (entry: Extract<ChatEntry, { kind: "agent" }>) => Extract<ChatEntry, { kind: "agent" }>,
    ) => {
      setEntries((current) =>
        current.map((entry) => (entry.kind === "agent" && entry.id === id ? updater(entry) : entry)),
      );
    },
    [],
  );

  const send = useCallback(
    async (text: string, scenario: Scenario | null) => {
      if (!text.trim() || busy) return;
      const stamp = `${Date.now()}`;
      const agentId = `a${stamp}`;
      setActiveScenario(scenario);
      setInput("");
      setBusy(true);
      setEntries((current) => [
        ...current,
        { kind: "user", id: `u${stamp}`, text: text.trim(), at: new Date().toISOString() },
        { kind: "agent", id: agentId, status: "running", text: null, rounds: [] },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      const upsertRound = (rounds: LiveRound[], round: number): LiveRound[] =>
        rounds.some((item) => item.round === round)
          ? rounds
          : [...rounds, { round, assistantText: null, calls: [] }];

      const applyEvent = (event: StreamEvent) => {
        switch (event.type) {
          case "run_start":
            setSessionId(event.session_id);
            patchAgent(agentId, (entry) => ({
              ...entry,
              artifact_version: event.artifact_version,
              versionLabel: event.version_label,
              provider: event.provider,
              model: event.model,
            }));
            break;
          case "round_start":
            patchAgent(agentId, (entry) => ({ ...entry, rounds: upsertRound(entry.rounds, event.round) }));
            break;
          case "assistant_text":
            patchAgent(agentId, (entry) => ({
              ...entry,
              rounds: upsertRound(entry.rounds, event.round).map((round) =>
                round.round === event.round ? { ...round, assistantText: event.text } : round,
              ),
            }));
            break;
          case "tool_call":
            patchAgent(agentId, (entry) => ({
              ...entry,
              rounds: upsertRound(entry.rounds, event.round).map((round) =>
                round.round === event.round
                  ? {
                      ...round,
                      calls: [
                        ...round.calls,
                        { call_id: event.call_id, name: event.name, args: event.args, state: "running" as const },
                      ],
                    }
                  : round,
              ),
            }));
            break;
          case "tool_result":
            patchAgent(agentId, (entry) => ({
              ...entry,
              rounds: entry.rounds.map((round) =>
                round.round === event.round
                  ? {
                      ...round,
                      calls: round.calls.map((call) =>
                        call.call_id === event.call_id
                          ? {
                              ...call,
                              state: "done" as const,
                              result: event.event.result,
                              durationMs: event.event.duration_ms,
                            }
                          : call,
                      ),
                    }
                  : round,
              ),
            }));
            break;
          case "final":
            patchAgent(agentId, (entry) => ({
              ...entry,
              status: event.turn.status,
              text: event.turn.assistant_text,
              durationMs: event.turn.duration_ms,
              transcriptId: event.transcript_id,
              artifact_version: event.artifact_version,
              error: event.turn.error,
            }));
            break;
          case "error":
            patchAgent(agentId, (entry) => ({ ...entry, status: "provider_error", error: event.message }));
            break;
        }
      };

      try {
        for await (const event of streamChat(
          {
            message: text.trim(),
            session_id: sessionId,
            provider: config.provider,
            model: config.model,
            version: config.version,
            history_window: config.historyWindow,
            max_tool_rounds: config.maxToolRounds,
          },
          controller.signal,
        )) {
          applyEvent(event);
        }
      } catch (exc) {
        patchAgent(agentId, (entry) => ({
          ...entry,
          status: "provider_error",
          error: exc instanceof Error ? exc.message : String(exc),
        }));
      } finally {
        setBusy(false);
        abortRef.current = null;
        refreshTranscripts();
      }
    },
    [busy, config, patchAgent, refreshTranscripts, sessionId],
  );

  const resetSession = () => {
    abortRef.current?.abort();
    setEntries([]);
    setSessionId(null);
    setActiveScenario(null);
    setBusy(false);
  };

  const activeProvider = meta?.providers.find((item) => item.key === config.provider);

  if (bootError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="panel max-w-lg space-y-3 rounded-2xl p-6">
          <h1 className="text-lg font-semibold text-spider-400">Không kết nối được backend</h1>
          <p className="text-[13px] text-mist-200">
            UI đang gọi <code className="font-mono text-web-400">{API_BASE || "/api (proxy sang localhost:8000)"}</code>{" "}
            nhưng không nhận được phản hồi.
          </p>
          <pre className="overflow-auto rounded-lg border border-ink-700 bg-ink-950/70 p-3 font-mono text-[11px] text-mist-400">
            {`cd starter_v0
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn server:app --reload --port 8000`}
          </pre>
          <p className="font-mono text-[11px] text-mist-400">{bootError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-4 p-4 lg:p-6">
      <header className="panel flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-spider-500/40 bg-spider-500/12 text-lg">
            🕷
          </span>
          <div>
            <h1 className="text-[15px] leading-tight font-semibold text-mist-50">Research Agent Console</h1>
            <p className="text-[11px] text-mist-400">Day 04 · Team Spiderman · tool routing evidence UI</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              title={item.hint}
              className={`rounded-lg border px-3 py-1.5 text-[12px] transition ${
                tab === item.key
                  ? "border-spider-500/50 bg-spider-500/12 text-spider-400"
                  : "border-ink-700 text-mist-400 hover:text-mist-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 font-mono text-[10.5px]">
          <button
            type="button"
            onClick={() => loadMeta()}
            disabled={refreshing}
            title="Đọc lại artifacts/ từ đĩa (sau khi sửa system_prompt.md hoặc tools.yaml)"
            className="flex items-center gap-1.5 rounded-full border border-ink-600 px-2 py-1 text-mist-400 transition hover:border-web-500 hover:text-mist-50 disabled:opacity-50"
          >
            <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>⟳</span>
            {refreshing ? "đang nạp…" : `${meta?.tools.length ?? 0} tool`}
          </button>
          <ThemeToggle />
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 ${
              meta ? "border-ok-400/40 text-ok-400" : "border-ink-600 text-mist-400"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta ? "bg-ok-400" : "animate-pulse-dot bg-mist-400"}`} />
            {meta ? "backend online" : "connecting…"}
          </span>
          {activeProvider && (
            <span
              className={`rounded-full border px-2 py-1 ${
                activeProvider.key_present ? "border-ink-600 text-mist-400" : "border-warn-400/50 text-warn-400"
              }`}
            >
              {activeProvider.label}
              {activeProvider.key_present ? "" : " · thiếu key"}
            </span>
          )}
        </div>
      </header>

      {!meta ? (
        <div className="panel flex flex-1 items-center justify-center rounded-2xl p-10 text-[13px] text-mist-400">
          Đang tải cấu hình agent…
        </div>
      ) : tab === "compare" ? (
        <CompareView
          meta={meta}
          provider={config.provider}
          model={config.model}
          maxToolRounds={config.maxToolRounds}
          scenarios={scenarios}
        />
      ) : (
        <div className="grid flex-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <div className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
            <Section title="run config">
              <ConfigPanel meta={meta} config={config} onChange={setConfig} disabled={busy} />
            </Section>
            <Section title={`tools (${meta.tools.length})`}>
              <ToolCatalog tools={meta.tools} />
            </Section>
            <Section title="demo scenario">
              <ScenarioPicker
                scenarios={scenarios}
                disabled={busy}
                onPick={(scenario) => {
                  setInput(scenario.query);
                  setActiveScenario(scenario);
                }}
              />
            </Section>
          </div>

          <div className="panel flex flex-col rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-[10.5px] text-mist-400">
                <span>session</span>
                <span className="truncate text-mist-200">{sessionId ?? "chưa bắt đầu"}</span>
              </div>
              <button
                type="button"
                onClick={resetSession}
                className="rounded-md border border-ink-600 px-2 py-1 text-[11px] text-mist-400 transition hover:border-spider-500/50 hover:text-spider-400"
              >
                session mới
              </button>
            </div>

            <div className="flex-1 p-4">
              <ChatThread
                entries={entries}
                emptyState={
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
                    <span className="text-4xl">🕸</span>
                    <p className="text-[14px] text-mist-200">Gửi một request để agent bắt đầu chọn tool.</p>
                    <p className="max-w-md text-[12px] text-mist-400">
                      Mỗi turn hiển thị đủ round → tool call → arguments → result/error, kèm transcript id và
                      artifact_version để đối chiếu với eval.
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {scenarios.slice(0, 4).map((scenario) => (
                        <button
                          key={scenario.id}
                          type="button"
                          onClick={() => send(scenario.query, scenario)}
                          className="rounded-lg border border-ink-700 px-2.5 py-1.5 text-[11.5px] text-mist-400 transition hover:border-spider-500/50 hover:text-mist-50"
                        >
                          {scenario.query.length > 42 ? `${scenario.query.slice(0, 40)}…` : scenario.query}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              />
            </div>

            <div className="sticky bottom-0 z-10 rounded-b-2xl border-t border-ink-700 bg-ink-850/95 p-3 backdrop-blur">
              {activeScenario && (
                <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] text-mist-400">
                  <span className="rounded bg-ink-800 px-1.5 py-px text-web-400">{activeScenario.id}</span>
                  <span className="truncate">
                    expect: {activeScenario.no_tool ? "no_tool" : activeScenario.expected_tools.join(", ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveScenario(null)}
                    className="ml-auto text-mist-400 hover:text-spider-400"
                  >
                    bỏ chọn
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send(input, activeScenario);
                    }
                  }}
                  rows={2}
                  disabled={busy}
                  placeholder="Ví dụ: Tin tức AI hôm nay có gì nổi bật?  (Enter để gửi, Shift+Enter xuống dòng)"
                  className="flex-1 resize-none rounded-xl border border-ink-600 bg-ink-950/70 px-3 py-2.5 text-[13px] text-mist-50 outline-none transition focus:border-web-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => send(input, activeScenario)}
                  disabled={busy || !input.trim()}
                  className="h-13 rounded-xl border border-spider-500/50 bg-spider-500/15 px-5 text-[13px] font-medium text-spider-400 transition hover:bg-spider-500/25 disabled:opacity-40"
                >
                  {busy ? "…" : "Gửi"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
            <Section title="evidence / trace">
              <TracePanel
                entry={lastAgentEntry}
                scenario={activeScenario}
                sessionId={sessionId}
                transcripts={transcripts}
                onOpenTranscript={(id) => window.open(`${API_BASE}/api/transcripts/${id}`, "_blank")}
              />
            </Section>
          </div>
        </div>
      )}
    </main>
  );
}
