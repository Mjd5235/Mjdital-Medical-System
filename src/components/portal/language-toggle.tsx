"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/actions/locale";
import type { Locale } from "@/lib/i18n/types";

type LanguageToggleProps = {
  locale: Locale;
  variant?: "header" | "compact";
};

function applyDocumentLocale(next: Locale) {
  document.documentElement.lang = next;
  document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
}

export function LanguageToggle({
  locale,
  variant = "header",
}: LanguageToggleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: Locale) {
    if (next === locale) {
      return;
    }

    applyDocumentLocale(next);
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  if (variant === "compact") {
    return (
      <div
        role="group"
        aria-label={locale === "ar" ? "اللغة" : "Language"}
        className="flex items-center gap-2 text-sm"
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => switchLocale("ar")}
          className={`font-semibold transition disabled:opacity-60 ${
            locale === "ar"
              ? "text-[#0066CC]"
              : "text-[#94A3B8] hover:text-[#475569] dark:hover:text-slate-200"
          }`}
        >
          العربية
        </button>
        <span className="text-[#CBD5E1] dark:text-slate-600" aria-hidden="true">
          /
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => switchLocale("en")}
          className={`font-medium transition disabled:opacity-60 ${
            locale === "en"
              ? "text-[#0066CC]"
              : "text-[#94A3B8] hover:text-[#475569] dark:hover:text-slate-200"
          }`}
        >
          English
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={locale === "ar" ? "اللغة" : "Language"}
      className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => switchLocale("ar")}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
          locale === "ar"
            ? "bg-[#0066CC] text-white shadow-sm"
            : "text-[#64748B] hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        العربية
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => switchLocale("en")}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
          locale === "en"
            ? "bg-[#0066CC] text-white shadow-sm"
            : "text-[#94A3B8] hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-slate-100"
        }`}
      >
        English
      </button>
    </div>
  );
}
