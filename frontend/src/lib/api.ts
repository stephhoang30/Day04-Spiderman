import type { CompareRun, Meta, Scenario, StreamEvent, TranscriptListItem } from "./types";

/** Mặc định gọi cùng origin ("" -> /api/...), Next rewrite sang FastAPI (xem next.config.ts).
 *  Chỉ set NEXT_PUBLIC_API_BASE khi cố tình tách frontend và backend ra 2 domain. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${path}`);
  return response.json() as Promise<T>;
}

export const fetchMeta = () => getJson<Meta>("/api/meta");
export const fetchScenarios = () => getJson<{ scenarios: Scenario[] }>("/api/scenarios");
export const fetchTranscripts = () => getJson<{ transcripts: TranscriptListItem[] }>("/api/transcripts");
export const fetchTranscript = (id: string) => getJson<Record<string, unknown>>(`/api/transcripts/${id}`);

export type ChatPayload = {
  message: string;
  session_id: string | null;
  provider: string;
  model: string | null;
  version: string;
  history_window: number;
  max_tool_rounds: number;
};

/** POST /api/chat/stream and yield each SSE event as it lands. */
export async function* streamChat(
  payload: ChatPayload,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!chunk.startsWith("data:")) continue;
      const data = chunk.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data) as StreamEvent;
      } catch {
        // ignore malformed frame
      }
    }
  }
}

export async function runCompare(body: {
  message: string;
  provider: string;
  model: string | null;
  versions: string[];
  max_tool_rounds: number;
}): Promise<{ message: string; runs: CompareRun[] }> {
  const response = await fetch(`${API_BASE}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Compare failed: ${response.status}`);
  return response.json();
}
