"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BadgeCheck,
    CalendarDays,
    ClipboardList,
    CreditCard,
    LogOut,
    Menu,
    ShieldCheck,
    Users,
    X,
    type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/logo";
import { signOutFromPortalAction } from "@/actions/auth";
import type { Locale } from "@/lib/i18n/types";

type NavigationItem = {
    label: string;
    href: string;
    icon: LucideIcon;
};

type ReceptionSidebarProps = {
    locale: Locale;
    /**
     * Optional fallback only. The active route is read from usePathname()
     * on every render; this prop is used only if the pathname is unavailable.
     */
    activeHref?: string;
    open: boolean;
    onClose: () => void;
    onQuickAction?: () => void;
};

const routes = {
    dashboard: "/reception",
    appointments: "/reception/appointments",
    patients: "/reception/patients",
    billing: "/reception/billing",
    insurance: "/reception/insurance",
    newAppointment: "/reception/appointments?new=true",
} as const;

const labels = {
    ar: {
        dashboard: "العمليات اليومية",
        appointments: "المواعيد",
        patients: "المرضى",
        billing: "الفوترة والتحصيل",
        insurance: "التأمين ونفيس",
        newAppointment: "موعد جديد",
        navigation: "القائمة الرئيسية",
        systemStatus: "حالة النظام",
        systemOnline: "النظام يعمل بشكل طبيعي",
        logout: "تسجيل الخروج",
        menuClose: "إغلاق القائمة الجانبية",
        version: "Mjdital Reception · 1.0",
    },
    en: {
        dashboard: "Front Desk / Today",
        appointments: "Appointments",
        patients: "Patients",
        billing: "Billing & Invoices",
        insurance: "Insurance & NPHIES",
        newAppointment: "New Appointment",
        navigation: "MAIN NAVIGATION",
        systemStatus: "System Status",
        systemOnline: "All systems operational",
        logout: "Sign out",
        menuClose: "Close sidebar",
        version: "Mjdital Reception · 1.0",
    },
} as const;

function cn(...classes: Array<string | false | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function normalizePath(path: string): string {
    const withoutQuery = path.split(/[?#]/)[0] ?? "";

    if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
        return withoutQuery.slice(0, -1);
    }

    return withoutQuery;
}

/**
 * Finds the best matching reception route.
 * Exact matches win; otherwise the longest matching route wins.
 * A leading locale segment such as /ar/reception is tolerated.
 */
function findActiveHref(
    navigation: NavigationItem[],
    currentPath: string | undefined,
): string | undefined {
    if (!currentPath) return undefined;

    const path = normalizePath(currentPath);
    let best: string | undefined;

    for (const item of navigation) {
        const href = normalizePath(item.href);

        const matches =
            path === href ||
            path.startsWith(`${href}/`) ||
            path.endsWith(href) ||
            path.includes(`${href}/`);

        if (matches && (best === undefined || href.length > best.length)) {
            best = item.href;
        }
    }

    return best;
}

export default function ReceptionSidebar({
    locale,
    activeHref,
    open,
    onClose,
    onQuickAction,
}: ReceptionSidebarProps) {
    const pathname = usePathname();
    const isRtl = locale === "ar";
    const t = labels[locale];

    const navigation: NavigationItem[] = [
        {
            label: t.dashboard,
            href: routes.dashboard,
            icon: ClipboardList,
        },
        {
            label: t.appointments,
            href: routes.appointments,
            icon: CalendarDays,
        },
        {
            label: t.patients,
            href: routes.patients,
            icon: Users,
        },
        {
            label: t.billing,
            href: routes.billing,
            icon: CreditCard,
        },
        {
            label: t.insurance,
            href: routes.insurance,
            icon: ShieldCheck,
        },
    ];

    const currentPath = pathname ?? activeHref;
    const currentActiveHref = findActiveHref(navigation, currentPath);

    const handleQuickAction = () => {
        onClose();
        onQuickAction?.();
    };

    return (
        <>
            {open && (
                <button
                    type="button"
                    aria-label={t.menuClose}
                    onClick={onClose}
                    className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
                />
            )}

            <aside
                id="reception-sidebar"
                dir={isRtl ? "rtl" : "ltr"}
                className={cn(
                    "fixed inset-y-0 z-50 flex h-screen w-[290px] flex-col border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950 lg:sticky lg:top-0 lg:z-20 lg:w-[264px] lg:translate-x-0",
                    isRtl ? "right-0 border-l" : "left-0 border-r",
                    open
                        ? "translate-x-0"
                        : isRtl
                            ? "translate-x-full lg:translate-x-0"
                            : "-translate-x-full lg:translate-x-0",
                )}
            >
                {/* Brand Header */}
                <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5 dark:border-slate-800">
                    <Link
                        href={routes.dashboard}
                        onClick={onClose}
                        aria-label={t.dashboard}
                        className="flex min-w-0 items-center"
                    >
                        <div className="max-w-40">
                            <BrandLogo />
                        </div>
                    </Link>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t.menuClose}
                        className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Quick Action */}
                <div className="px-4 pt-5">
                    {onQuickAction ? (
                        <button
                            type="button"
                            onClick={handleQuickAction}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                        >
                            <CalendarDays size={18} className="shrink-0" />
                            <span>
                                + {t.newAppointment}
                            </span>
                        </button>
                    ) : (
                        <Link
                            href={routes.newAppointment}
                            onClick={onClose}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
                        >
                            <CalendarDays size={18} className="shrink-0" />
                            <span>
                                + {t.newAppointment}
                            </span>
                        </Link>
                    )}
                </div>

                {/* Main Navigation */}
                <div className="px-4 pb-3 pt-5">
                    <p className="mb-3 px-3 text-[11px] font-bold tracking-wider text-slate-400">
                        {t.navigation}
                    </p>

                    <nav
                        aria-label={t.navigation}
                        className="space-y-1.5"
                    >
                        {navigation.map((item) => {
                            const ItemIcon = item.icon;
                            const active = item.href === currentActiveHref;

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                                        active
                                            ? "bg-teal-600 text-white shadow-sm"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-teal-400",
                                    )}
                                >
                                    <ItemIcon
                                        size={19}
                                        className="shrink-0"
                                    />

                                    <span className="flex-1 text-start">
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Footer / System Status / Sign Out */}
                <div className="mt-auto space-y-4 p-4">
                    <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 dark:border-teal-900 dark:from-teal-950/40 dark:to-cyan-950/30">
                        <div className="mb-2 flex items-center gap-2">
                            <BadgeCheck
                                size={18}
                                className="text-teal-600 dark:text-teal-400"
                            />

                            <span className="text-xs font-bold text-slate-800 dark:text-white">
                                {t.systemStatus}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />

                            <span className="text-xs text-slate-600 dark:text-slate-300">
                                {t.systemOnline}
                            </span>
                        </div>
                    </div>

                    <form action={signOutFromPortalAction.bind(null, "reception")}>
                        <button
                            type="submit"
                            className="flex w-full items-center gap-3 rounded-xl border border-rose-100 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-950 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                            <LogOut size={18} />
                            <span>{t.logout}</span>
                        </button>
                    </form>

                    <p className="text-center text-[10px] text-slate-400">
                        {t.version}
                    </p>
                </div>
            </aside>
        </>
    );
}