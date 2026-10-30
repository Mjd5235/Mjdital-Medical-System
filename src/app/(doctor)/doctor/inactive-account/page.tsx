"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headset, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import type { Locale } from "@/lib/i18n/types";

const LOGIN_PATH = "/doctor/login";
const SUPPORT_EMAIL =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@mjdital.com";

const translations = {
    en: {
        title: "Account Temporarily Inactive",
        subtitle: "الحساب معطل مؤقتاً",
        description:
            "Sorry, your account has been temporarily deactivated or suspended by the system administration. You cannot access the dashboard at the moment. Please contact the System Administrator at your medical center to lift the suspension and restore access.",
        back: "Return to Sign In",
        backSecondary: "العودة لصفحة تسجيل الدخول",
        support: "Contact Support",
        supportSecondary: "التواصل مع الدعم الفني",
        supportSubject: "Account temporarily inactive",
        supportBody:
            "Hello,\n\nMy Mjdital account appears to be temporarily inactive. Please help me restore access.\n\nThank you.",
        statusLabel: "Account suspended",
        lightMode: "Light mode",
        darkMode: "Dark mode",
    },
    ar: {
        title: "الحساب معطل مؤقتاً",
        subtitle: "Account Temporarily Inactive",
        description:
            "عذراً، تم تعطيل حسابك أو إيقافه مؤقتاً من قبل إدارة النظام. لا يمكنك الوصول إلى لوحة التحكم حالياً. يرجى التواصل مع مسؤول النظام (System Administrator) في مركزك الطبي لرفع التعطيل واستعادة الصلاحية.",
        back: "العودة لصفحة تسجيل الدخول",
        backSecondary: "Return to Sign In",
        support: "التواصل مع الدعم الفني",
        supportSecondary: "Contact Support",
        supportSubject: "الحساب معطل مؤقتاً",
        supportBody:
            "مرحباً،\n\nيبدو أن حسابي في مجديتال معطل مؤقتاً. أرجو المساعدة في استعادة الوصول.\n\nشكراً لكم.",
        statusLabel: "الحساب موقوف",
        lightMode: "الوضع الفاتح",
        darkMode: "الوضع الداكن",
    },
} as const;

function StatusIcon({ label }: { label: string }) {
    return (
        <div
            role="img"
            aria-label={label}
            className="relative mx-auto grid h-[132px] w-[132px] place-items-center rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800/60 sm:h-[144px] sm:w-[144px]"
        >
            <UserRound
                size={64}
                strokeWidth={1.4}
                className="text-slate-500 dark:text-slate-300"
                aria-hidden="true"
            />

            <span
                aria-hidden="true"
                className="absolute bottom-[34px] end-[28px] grid h-11 w-11 place-items-center rounded-full border-[3px] border-amber-400 bg-slate-100 dark:bg-[#111d33] sm:end-[30px]"
            >
                <span className="flex items-center gap-[5px]">
                    <span className="h-[15px] w-[4px] rounded-full bg-amber-400" />
                    <span className="h-[15px] w-[4px] rounded-full bg-amber-400" />
                </span>
            </span>
        </div>
    );
}

export default function AccountInactivePage() {
    const router = useRouter();
    const [locale, setLocale] = useState<Locale>("ar");
    const [navigating, setNavigating] = useState(false);

    useEffect(() => {
        const root = document.documentElement;

        function syncLocale() {
            setLocale(root.lang === "en" ? "en" : "ar");
        }

        syncLocale();

        const observer = new MutationObserver(syncLocale);

        observer.observe(root, {
            attributes: true,
            attributeFilter: ["lang", "dir"],
        });

        return () => observer.disconnect();
    }, []);

    const t = translations[locale];
    const isRtl = locale === "ar";

    // The secondary line is always the opposite language.
    const secondaryDir = isRtl ? "ltr" : "rtl";
    const secondaryLang = isRtl ? "en" : "ar";

    const supportHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        t.supportSubject,
    )}&body=${encodeURIComponent(t.supportBody)}`;

    function handleBack(): void {
        if (navigating) return;

        setNavigating(true);
        router.push(LOGIN_PATH);
    }

    return (
        <main
            lang={locale}
            dir={isRtl ? "rtl" : "ltr"}
            className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100 sm:px-6 sm:py-12"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 hidden dark:block"
                style={{
                    background:
                        "radial-gradient(ellipse at 50% 45%, rgba(17,39,65,0.38) 0%, rgba(2,6,23,0) 70%)",
                }}
            />

            <section
                aria-labelledby="inactive-title"
                className="relative z-10 w-full max-w-[680px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 sm:p-8"
            >
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="w-40">
                        <BrandLogo />
                    </div>

                    <div className="flex items-center gap-3">
                        <LanguageToggle locale={locale} variant="header" />
                        <ThemeToggle
                            lightLabel={t.lightMode}
                            darkLabel={t.darkMode}
                            variant="header"
                        />
                    </div>
                </header>

                <div className="mt-8 text-center sm:mt-9">
                    <StatusIcon label={t.statusLabel} />

                    <h1
                        id="inactive-title"
                        className="mt-5 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[38px]"
                    >
                        {t.title}
                    </h1>

                    <p
                        lang={secondaryLang}
                        dir={secondaryDir}
                        className="mt-2 text-base text-slate-500 dark:text-[#b5c9e5] sm:text-xl"
                    >
                        {t.subtitle}
                    </p>

                    <p className="mx-auto mt-6 max-w-[600px] text-sm leading-8 text-slate-600 dark:text-[#b5c9e5] sm:text-[17px]">
                        {t.description}
                    </p>
                </div>

                <div className="mt-8 space-y-6">
                    <button
                        type="button"
                        onClick={handleBack}
                        disabled={navigating}
                        aria-busy={navigating}
                        className={`flex h-[58px] w-full items-center justify-center gap-4 rounded-xl bg-teal-600 px-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-65 sm:text-[19px] ${isRtl ? "flex-row-reverse" : ""
                            }`}
                    >
                        <ArrowLeft size={24} strokeWidth={2} aria-hidden="true" />
                        <span>{t.back}</span>
                    </button>

                    <div className="text-center">
                        <a
                            href={supportHref}
                            className="group inline-flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                        >
                            <span className="inline-flex items-center gap-3 text-base font-semibold text-teal-600 transition-colors group-hover:text-teal-500 dark:text-teal-400 dark:group-hover:text-teal-300 sm:text-[19px]">
                                <Headset size={26} strokeWidth={1.7} aria-hidden="true" />
                                {t.support}
                            </span>

                            <span
                                lang={secondaryLang}
                                dir={secondaryDir}
                                className="text-sm text-slate-500 dark:text-[#98afce]"
                            >
                                {t.supportSecondary}
                            </span>
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}