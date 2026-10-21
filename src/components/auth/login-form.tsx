"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { loginAction, type LoginFormState } from "@/actions/auth";
import type { Portal } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";
import { getDictionary } from "@/lib/i18n/dictionaries";

type LoginFormProps = {
  portal: Portal;
  locale: Locale;
  nextPath: string;
  demoHint: { email: string; password: string } | null;
};

const initialState: LoginFormState = {
  status: "idle",
  message: "",
};

export function LoginForm({
  portal,
  locale,
  nextPath,
  demoHint,
}: LoginFormProps) {
  const t = getDictionary(locale);
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotHint, setForgotHint] = useState(false);
  const isArabic = locale === "ar";

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="portal" value={portal} />
      <input type="hidden" name="next" value={nextPath} />

      <div>
        <label
          htmlFor={`${portal}-email`}
          className="mb-2 block text-sm font-semibold text-[#1E293B] dark:text-foreground"
        >
          {t.login.emailLabel}
        </label>
        <div className="relative">
          <UserRound
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 text-[#94A3B8] start-3"
          />
          <input
            id={`${portal}-email`}
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue={demoHint?.email ?? ""}
            placeholder={t.login.emailPlaceholder}
            className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pe-3 ps-11 text-sm text-[#1E293B] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0D9488] focus:ring-4 focus:ring-teal-100 dark:border-border dark:bg-card dark:text-foreground"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${portal}-password`}
          className="mb-2 block text-sm font-semibold text-[#1E293B] dark:text-foreground"
        >
          {t.login.passwordLabel}
        </label>
        <div className="relative">
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 text-[#94A3B8] start-3"
          />
          <input
            id={`${portal}-password`}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder={t.login.passwordPlaceholder}
            className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white pe-12 ps-11 text-sm text-[#1E293B] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0D9488] focus:ring-4 focus:ring-teal-100 dark:border-border dark:bg-card dark:text-foreground"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#94A3B8] hover:text-[#0F172A] end-3"
            aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
          >
            {showPassword ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="inline-flex items-center gap-2 text-[#475569] dark:text-muted">
          <input
            type="checkbox"
            name="remember"
            className="size-4 rounded border-[#CBD5E1] text-[#0D9488] accent-[#0D9488]"
          />
          {t.login.rememberMe}
        </label>
        <button
          type="button"
          onClick={() => setForgotHint(true)}
          className="font-semibold text-[#0D9488] hover:underline"
        >
          {t.login.forgotPassword}
        </button>
      </div>

      {forgotHint ? (
        <p className="rounded-xl bg-[#F1F5F9] px-3 py-2 text-sm text-[#475569] dark:bg-charcoal dark:text-muted">
          {t.login.forgotPasswordHint}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <p role="status" className="text-sm font-medium text-[#0D9488]">
          {isArabic ? "تم تسجيل الدخول بنجاح." : "Signed in successfully."}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#0D9488] text-base font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:opacity-70"
      >
        <span>{pending ? (isArabic ? "جاري الدخول..." : "Signing in...") : t.login.submit}</span>
        <span aria-hidden="true">{isArabic ? "←" : "→"}</span>
      </button>

      {demoHint ? (
        <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-xs leading-6 text-[#64748B] dark:border-border dark:bg-charcoal dark:text-muted">
          <span className="block font-semibold text-[#334155] dark:text-foreground">
            {t.login.demoTitle}
          </span>
          {demoHint.email}
          <span className="mx-1">·</span>
          {demoHint.password}
        </p>
      ) : null}
    </form>
  );
}
