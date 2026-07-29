"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "rac-theme";

/** Script chạy trước khi paint để tránh nháy theme khi reload. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}`;

const subscribe = (onChange: () => void) => {
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
};

const getSnapshot = (): Theme =>
  (document.documentElement.dataset.theme as Theme | undefined) ?? "light";

const getServerSnapshot = (): Theme => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event("themechange"));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "light" ? "Chuyển sang dark" : "Chuyển sang light"}
      aria-label="Đổi theme"
      className="flex items-center gap-1.5 rounded-full border border-ink-600 px-2 py-1 font-mono text-[10.5px] text-mist-400 transition hover:border-web-500 hover:text-mist-50"
    >
      <span aria-hidden>{theme === "light" ? "☀" : "☾"}</span>
      {theme === "light" ? "light" : "dark"}
    </button>
  );
}
