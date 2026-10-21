"use client";

import { Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

type ThemeToggleProps = {
  lightLabel: string;
  darkLabel: string;
  variant?: "header" | "compact";
};

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", onStoreChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle({
  lightLabel,
  darkLabel,
  variant = "header",
}: ThemeToggleProps) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mjdital-theme", next ? "dark" : "light");
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? lightLabel : darkLabel}
      dir="ltr"
      className={`inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1.5 shadow-sm transition hover:shadow-md dark:border-border dark:bg-card ${variant === "compact" ? "gap-1.5" : ""
        }`}
    >
      <Sun
        aria-hidden="true"
        className={`size-4 ${isDark ? "text-[#94A3B8]" : "text-[#F59E0B]"}`}
        strokeWidth={2.2}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full bg-[#E2E8F0] dark:bg-slate-600"
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-[#0066CC] shadow-sm transition-transform ${
            isDark ? "translate-x-[1px]" : "translate-x-[-20px]"
          }`}
        />
      </span>
      <Moon
        aria-hidden="true"
        className={`size-4 ${isDark ? "text-[#0066CC]" : "text-[#94A3B8]"}`}
        strokeWidth={2.2}
      />
    </button>
  );
}
