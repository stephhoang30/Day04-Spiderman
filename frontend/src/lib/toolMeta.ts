export type ToolVisual = { color: string; glyph: string; role: string };

const FALLBACK: ToolVisual = { color: "var(--tool-default)", glyph: "◆", role: "tool" };

/** Pha màu theo % — dùng cho nền/viền nhạt, hoạt động với cả biến CSS (light/dark). */
export const tint = (color: string, percent: number) =>
  `color-mix(in oklab, ${color} ${percent}%, transparent)`;

/** Màu + icon cho từng tool. Màu là biến CSS nên tự đổi theo light/dark theme. */
export const TOOL_VISUALS: Record<string, ToolVisual> = {
  clarify: { color: "var(--tool-clarify)", glyph: "?", role: "hỏi lại người dùng" },
  timeline: { color: "var(--tool-timeline)", glyph: "@", role: "bài đăng của 1 tài khoản" },
  social_search: { color: "var(--tool-social_search)", glyph: "#", role: "bài đăng theo từ khóa" },
  lookup: { color: "var(--tool-lookup)", glyph: "⌕", role: "tìm trên web" },
  fetch: { color: "var(--tool-fetch)", glyph: "↧", role: "đọc 1 URL" },
  format: { color: "var(--tool-format)", glyph: "▤", role: "render digest markdown" },
  send: { color: "var(--tool-send)", glyph: "↗", role: "gửi đi (cần confirm)" },
  policy: { color: "var(--tool-policy)", glyph: "§", role: "policy nội bộ" },
  papers: { color: "var(--tool-papers)", glyph: "✦", role: "tìm paper arXiv" },
  paper_text: { color: "var(--tool-paper_text)", glyph: "¶", role: "trích text PDF" },
};

export const toolVisual = (name: string): ToolVisual => TOOL_VISUALS[name] ?? FALLBACK;

export const STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "đang chạy", color: "var(--status-running)" },
  answered: { label: "đã trả lời", color: "var(--status-ok)" },
  waiting_for_user: { label: "chờ user trả lời", color: "var(--status-wait)" },
  max_tool_rounds: { label: "hết số round", color: "var(--status-limit)" },
  provider_error: { label: "lỗi provider", color: "var(--status-error)" },
  started: { label: "started", color: "var(--status-idle)" },
};

export const OK_COLOR = "var(--status-ok)";
export const ERROR_COLOR = "var(--status-error)";
