/** URL trong UI đến từ tool result / model args -> chỉ cho phép scheme an toàn.
 *  React đã chặn `javascript:`, nhưng `data:`, `vbscript:`, `blob:`… thì không. */
const SAFE_SCHEMES = ["http:", "https:", "mailto:"];

export function safeHref(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  // URL tương đối (không có scheme) coi như an toàn.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    try {
      if (!SAFE_SCHEMES.includes(new URL(value).protocol)) return null;
    } catch {
      return null;
    }
  }
  return value;
}
