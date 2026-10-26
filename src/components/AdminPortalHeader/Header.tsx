"use client";

import {
    Bell,
    Menu,
    Users,
} from "lucide-react";

import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import type { Locale } from "@/lib/i18n/types";

type AdminHeaderProps = {
    locale: Locale;
    onMenuOpen: () => void;
};

const translations = {
    ar: {
        greeting: "مرحباً، نورة",
        role: "مدير النظام",
        menuOpen: "فتح القائمة الجانبية",
        notifications: "الإشعارات",
        lightMode: "الوضع الفاتح",
        darkMode: "الوضع الداكن",
    },
    en: {
        greeting: "Hello, Noura",
        role: "System Administrator",
        menuOpen: "Open sidebar",
        notifications: "Notifications",
        lightMode: "Light mode",
        darkMode: "Dark mode",
    },
} as const;

export default function AdminHeader({
    locale,
    onMenuOpen,
}: AdminHeaderProps) {
    const isRtl = locale === "ar";
    const t = translations[locale];

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 py-3 sm:px-6 xl:px-8">
                {/* Greeting and mobile sidebar button */}
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        aria-label={t.menuOpen}
                        aria-controls="admin-sidebar"
                        onClick={onMenuOpen}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                        <Menu size={21} />
                    </button>

                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                            {t.greeting}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {t.role}
                        </p>
                    </div>
                </div>

                {/* Header actions */}
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                    <LanguageToggle
                        locale={locale}
                        variant="header"
                    />

                    <ThemeToggle
                        lightLabel={t.lightMode}
                        darkLabel={t.darkMode}
                        variant="header"
                    />

                    <button
                        type="button"
                        aria-label={t.notifications}
                        className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <Bell size={20} />

                        <span
                            className={`absolute top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500 dark:border-slate-950 ${isRtl ? "right-2" : "left-2"
                                }`}
                        />
                    </button>

                    <div className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-slate-700" />

                    <div className="hidden h-10 w-10 place-items-center rounded-full bg-teal-50 text-teal-700 sm:grid dark:bg-teal-950/50 dark:text-teal-400">
                        <Users size={20} />
                    </div>
                </div>
            </div>
        </header>
    );
}