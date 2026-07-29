export type ToolResultPayload = Record<string, unknown> & {
  error?: string;
  message?: string;
  items?: DigestItem[];
  markdown?: string;
  results?: Record<string, unknown>[];
  awaiting_user?: boolean;
  question?: string;
  status?: string;
};

export type DigestItem = {
  title?: string;
  url?: string;
  source?: string;
  summary?: string;
  section?: string;
  date?: string;
  score?: number;
};

export type ToolEvent = {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResultPayload;
  round?: number;
  call_id?: string;
  duration_ms?: number;
};

export type RoundRecord = {
  round: number;
  assistant_text: string | null;
  tool_calls: { name: string; args: Record<string, unknown> }[];
  tool_results: ToolEvent[];
};

export type TurnRecord = {
  turn_index: number;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  user: string;
  status: "started" | "answered" | "waiting_for_user" | "max_tool_rounds" | "provider_error";
  assistant_text: string | null;
  rounds: RoundRecord[];
  tool_events: ToolEvent[];
  artifact_version?: string;
  error?: string;
};

export type StreamEvent =
  | ({ type: "run_start"; session_id: string; turn_index: number; provider: string; model: string | null; version_label: string } & ArtifactVersionFields)
  | { type: "round_start"; round: number }
  | { type: "assistant_text"; round: number; text: string | null }
  | { type: "tool_call"; round: number; call_id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; round: number; call_id: string; event: ToolEvent }
  | { type: "round_end"; round: number }
  | ({ type: "final"; session_id: string; transcript_id: string; transcript_path: string; turn: TurnRecord } & ArtifactVersionFields)
  | { type: "error"; message: string };

export type ArtifactVersionFields = {
  version: string;
  artifact_version: string;
  prompt_hash: string;
  tools_hash: string;
};

export type VersionSummary = ArtifactVersionFields & {
  label: string;
  is_working: boolean;
  description: string;
  tool_count: number;
  tool_names: string[];
  prompt_chars: number;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>;
    required?: string[];
  };
  required: string[];
  implemented: boolean;
  env_keys: { name: string; present: boolean }[];
};

export type ProviderInfo = {
  key: string;
  label: string;
  models: string[];
  default_model: string | null;
  key_present: boolean;
  env: string;
};

export type Meta = {
  providers: ProviderInfo[];
  versions: VersionSummary[];
  tools: ToolSpec[];
  defaults: { history_window: number; max_tool_rounds: number; version: string };
  prompt_visible: boolean;
};

export type Scenario = {
  id: string;
  suite: "base" | "group" | "research";
  query: string;
  turns?: unknown[] | null;
  failure_type?: string;
  expected_tools: string[];
  expected_args: Record<string, unknown>[];
  no_tool: boolean;
  what_it_tests?: string;
};

export type TranscriptListItem = {
  transcript_id: string;
  file: string;
  artifact_version: string | null;
  provider: string | null;
  model: string | null;
  surface: string;
  turn_count: number;
  updated_at: string | null;
};

/** UI-side chat entry: either a user message or one agent turn (with its trace). */
export type ChatEntry =
  | { kind: "user"; id: string; text: string; at: string }
  | {
      kind: "agent";
      id: string;
      status: TurnRecord["status"] | "running";
      text: string | null;
      rounds: LiveRound[];
      artifact_version?: string;
      versionLabel?: string;
      provider?: string;
      model?: string | null;
      durationMs?: number;
      transcriptId?: string;
      error?: string;
    };

export type LiveRound = {
  round: number;
  assistantText: string | null;
  calls: LiveCall[];
};

export type LiveCall = {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
  result?: ToolResultPayload;
  durationMs?: number;
  state: "running" | "done";
};

export type CompareRun = {
  version_label: string;
  session_id?: string;
  transcript_id?: string;
  /** vắng mặt khi version đó chạy lỗi — khi ấy `error` có giá trị */
  turn?: TurnRecord;
  error?: string;
} & Partial<ArtifactVersionFields>;
