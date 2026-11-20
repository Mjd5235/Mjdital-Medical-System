// components/AdminPortalHeader/Header.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Bell,
    Menu,
    Users,
} from "lucide-react";

import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import type { Locale } from "@/lib/i18n/types";
import {
    getCurrentHeaderUserAction,
    type HeaderUserProfile,
} from "./actions";

type AdminHeaderProps = {
    locale: Locale;
    onMenuOpen: () => void;
};

type RoleKey = HeaderUserProfile["role"];

type Translations = {
    greeting: string;
    greetingNamed: string;
    superAdmin: string;
    roles: Record<RoleKey, string>;
    menuOpen: string;
    notifications: string;
    lightMode: string;
    darkMode: string;
};

const translations: Record<Locale, Translations> = {
    ar: {
        greeting: "مرحباً",
        greetingNamed: "مرحباً، {name}",
        superAdmin: "المدير العام",
        roles: {
            ADMIN: "مدير النظام",
            RECEPTIONIST: "موظف استقبال",
            DOCTOR: "طبيب",
            NURSE: "ممرض",
            ACCOUNTANT: "محاسب",
        },
        menuOpen: "فتح القائمة الجانبية",
        notifications: "الإشعارات",
        lightMode: "الوضع الفاتح",
        darkMode: "الوضع الداكن",
    },
    en: {
        greeting: "Hello",
        greetingNamed: "Hello, {name}",
        superAdmin: "Super Administrator",
        roles: {
            ADMIN: "System Administrator",
            RECEPTIONIST: "Receptionist",
            DOCTOR: "Doctor",
            NURSE: "Nurse",
            ACCOUNTANT: "Accountant",
        },
        menuOpen: "Open sidebar",
        notifications: "Notifications",
        lightMode: "Light mode",
        darkMode: "Dark mode",
    },
};

type ProfileState =
    | { status: "loading"; profile: HeaderUserProfile | null }
    | { status: "ready"; profile: HeaderUserProfile }
    | { status: "error"; profile: null };

/**
 * Last successfully loaded profile. It is only used to avoid a loading flash when
 * the header remounts on navigation — it is always revalidated against the server.
 */
let lastKnownProfile: HeaderUserProfile | null = null;

function firstName(fullName: string): string {
    return fullName.trim().split(/\s+/)[0] ?? "";
}

export default function AdminHeader({
    locale,
    onMenuOpen,
}: AdminHeaderProps) {
    const isRtl = locale === "ar";
    const t = translations[locale];

    const [state, setState] = useState<ProfileState>({
        status: "loading",
        profile: null,
    });

    useEffect(() => {
        let cancelled = false;

        // Show the last known profile instantly (if any), then revalidate.
        if (lastKnownProfile) {
            setState({ status: "ready", profile: lastKnownProfile });
        }

        void (async () => {
            try {
                const result = await getCurrentHeaderUserAction();

                if (cancelled) return;

                if (result.success && result.data) {
                    lastKnownProfile = result.data;
                    setState({ status: "ready", profile: result.data });
                    return;
                }

                lastKnownProfile = null;
                setState({ status: "error", profile: null });
            } catch {
                if (cancelled) return;

                setState((current) =>
                    current.profile
                        ? current
                        : { status: "error", profile: null },
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const { greetingText, roleText } = useMemo(() => {
        const profile = state.profile;

        if (!profile) {
            return { greetingText: t.greeting, roleText: "" };
        }

        const fullName =
            locale === "ar"
                ? profile.fullNameAr || profile.fullNameEn
                : profile.fullNameEn || profile.fullNameAr;

        const name = firstName(fullName);

        return {
            greetingText: name
                ? t.greetingNamed.replace("{name}", name)
                : t.greeting,
            roleText: profile.isSuperAdmin
                ? t.superAdmin
                : (t.roles[profile.role] ?? ""),
        };
    }, [state.profile, locale, t]);

    const isLoading = state.status === "loading" && !state.profile;

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex min-h-16 items-center justify-between gap-2 px-3 py-2.5 sm:min-h-[76px] sm:gap-3 sm:px-6 sm:py-3 xl:px-8">
                {/* Greeting and mobile sidebar button */}
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        aria-label={t.menuOpen}
                        aria-controls="admin-sidebar"
                        onClick={onMenuOpen}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        <Menu size={21} />
                    </button>

                    <div
                        className="min-w-0 flex-1"
                        aria-busy={isLoading || undefined}
                    >
                        {isLoading ? (
                            <div
                                role="status"
                                className="animate-pulse space-y-2"
                            >
                                <span className="sr-only">…</span>
                                <div className="h-4 w-20 rounded bg-slate-200 sm:h-[18px] sm:w-28 dark:bg-slate-800" />
                                <div className="hidden h-3 w-20 rounded bg-slate-200/70 sm:block dark:bg-slate-800/70" />
                            </div>
                        ) : (
                            <>
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                                    {greetingText}
                                </p>

                                {/* Secondary role line: hidden on small screens */}
                                <p className="mt-0.5 hidden min-h-4 truncate text-xs text-slate-500 sm:block dark:text-slate-400">
                                    {roleText}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Header actions */}
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                    <div className="shrink-0">
                        <LanguageToggle
                            locale={locale}
                            variant="header"
                        />
                    </div>

                    <div className="shrink-0">
                        <ThemeToggle
                            lightLabel={t.lightMode}
                            darkLabel={t.darkMode}
                            variant="header"
                        />
                    </div>

                    <button
                        type="button"
                        aria-label={t.notifications}
                        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Bell size={20} />

                        <span
                            className={`absolute top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500 dark:border-slate-950 ${isRtl ? "right-2" : "left-2"
                                }`}
                        />
                    </button>

                    <div className="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-700" />

                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700 sm:h-10 sm:w-10 dark:bg-teal-950/50 dark:text-teal-400">
                        <Users size={18} className="sm:h-5 sm:w-5" />
                    </div>
                </div>
            </div>
        </header>
    );
}