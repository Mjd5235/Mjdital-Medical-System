"use client";

import { useState } from "react";
import Link from "next/link";
import {
    BadgeCheck,
    BriefcaseMedical,
    Building2,
    CalendarDays,
    ChevronDown,
    CircleDollarSign,
    FileText,
    HandCoins,
    LayoutDashboard,
    LogOut,
    Settings,
    ShieldCheck,
    Stethoscope,
    Users,
    Wallet,
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

type NavigationGroup = {
    id: string;
    label: string;
    icon: LucideIcon;
    items: NavigationItem[];
};

type AdminSidebarProps = {
    locale: Locale;
    activeHref?: string;
    open: boolean;
    onClose: () => void;
};

const routes = {
    dashboard: "/admin/dashboard",
    providers: "/admin/clinical/providers",
    services: "/admin/clinical/services",
    schedules: "/admin/clinical/schedules",
    pricing: "/admin/finance/pricing",
    zatca: "/admin/finance/zatca",
    payers: "/admin/insurance/payers",
    policies: "/admin/insurance/policies",
    users: "/admin/governance/users",
    settings: "/admin/settings",
} as const;

const labels = {
    ar: {
        overview: "الرئيسية",
        clinical: "الهيكل الطبي ونفيس",
        finance: "النظام المالي والزكاة",
        insurance: "إدارة التأمين والعقود",
        governance: "الحوكمة والأمان",
        dashboard: "لوحة التحكم",
        providers: "إدارة الأطباء والممارسين",
        services: "العيادات والخدمات",
        schedules: "جداول الدوام والشفتات",
        pricing: "أسعار الخدمات والضرائب",
        zatcaSettings: "إعدادات ربط الزكاة",
        payers: "شركات التأمين",
        policies: "فئات العقود ونسب التحمل",
        users: "إدارة المستخدمين والصلاحيات",
        centerSettings: "إعدادات المركز",
        navigation: "القائمة الرئيسية",
        systemStatus: "حالة النظام",
        systemOnline: "النظام يعمل بشكل طبيعي",
        logout: "تسجيل الخروج",
        menuClose: "إغلاق القائمة الجانبية",
    },
    en: {
        overview: "Overview",
        clinical: "Clinical Setup & NPHIES",
        finance: "Finance & ZATCA",
        insurance: "Insurance & Contracts",
        governance: "Governance & Security",
        dashboard: "Dashboard",
        providers: "Doctors & Practitioners",
        services: "Clinics & Services",
        schedules: "Schedules & Shifts",
        pricing: "Service Pricing & Taxes",
        zatcaSettings: "ZATCA Integration",
        payers: "Insurance Providers",
        policies: "Contract Tiers & Co-payments",
        users: "Users & Permissions",
        centerSettings: "Center Settings",
        navigation: "MAIN NAVIGATION",
        systemStatus: "System Status",
        systemOnline: "All systems operational",
        logout: "Sign out",
        menuClose: "Close sidebar",
    },
} as const;

function cn(...classes: Array<string | false | undefined>) {
    return classes.filter(Boolean).join(" ");
}

export default function AdminSidebar({
    locale,
    activeHref = routes.services,
    open,
    onClose,
}: AdminSidebarProps) {
    const [expandedGroup, setExpandedGroup] = useState("clinical");
    const isRtl = locale === "ar";
    const t = labels[locale];

    const navigation: NavigationGroup[] = [
        {
            id: "overview",
            label: t.overview,
            icon: LayoutDashboard,
            items: [{ label: t.dashboard, href: routes.dashboard, icon: LayoutDashboard }],
        },
        {
            id: "clinical",
            label: t.clinical,
            icon: Stethoscope,
            items: [
                { label: t.providers, href: routes.providers, icon: Users },
                { label: t.services, href: routes.services, icon: Building2 },
                { label: t.schedules, href: routes.schedules, icon: CalendarDays },
            ],
        },
        {
            id: "finance",
            label: t.finance,
            icon: CircleDollarSign,
            items: [
                { label: t.pricing, href: routes.pricing, icon: Wallet },
                { label: t.zatcaSettings, href: routes.zatca, icon: FileText },
            ],
        },
        {
            id: "insurance",
            label: t.insurance,
            icon: ShieldCheck,
            items: [
                { label: t.payers, href: routes.payers, icon: BriefcaseMedical },
                { label: t.policies, href: routes.policies, icon: HandCoins },
            ],
        },
        {
            id: "governance",
            label: t.governance,
            icon: ShieldCheck,
            items: [
                { label: t.users, href: routes.users, icon: Users },
                { label: t.centerSettings, href: routes.settings, icon: Settings },
            ],
        },
    ];

    return (
        <>
            {open && (
                <button
                    type="button"
                    aria-label={t.menuClose}
                    onClick={onClose}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
                />
            )}

            <aside
                id="admin-sidebar"
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
                        className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="px-4 pb-3 pt-5">
                    <p className="mb-3 px-3 text-[11px] font-bold tracking-wider text-slate-400">
                        {t.navigation}
                    </p>

                    <nav aria-label={t.navigation} className="space-y-1.5">
                        {navigation.map((group) => {
                            const GroupIcon = group.icon;
                            const expanded = expandedGroup === group.id;
                            const containsActive = group.items.some(
                                (item) => item.href === activeHref,
                            );

                            return (
                                <section key={group.id}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedGroup((current) =>
                                                current === group.id ? "" : group.id,
                                            )
                                        }
                                        aria-expanded={expanded}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                                            containsActive
                                                ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                                                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900",
                                        )}
                                    >
                                        <GroupIcon size={19} className="shrink-0" />
                                        <span className="flex-1 text-start">{group.label}</span>
                                        <ChevronDown
                                            size={16}
                                            className={cn(
                                                "shrink-0 transition-transform",
                                                expanded && "rotate-180",
                                            )}
                                        />
                                    </button>

                                    {expanded && (
                                        <div
                                            className={cn(
                                                "mt-1 space-y-1 border-slate-200 dark:border-slate-700",
                                                isRtl
                                                    ? "mr-5 border-r pr-3"
                                                    : "ml-5 border-l pl-3",
                                            )}
                                        >
                                            {group.items.map((item) => {
                                                const ItemIcon = item.icon;
                                                const active = item.href === activeHref;

                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        onClick={onClose}
                                                        aria-current={active ? "page" : undefined}
                                                        className={cn(
                                                            "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs leading-5 transition-colors",
                                                            active
                                                                ? "bg-teal-600 font-bold text-white shadow-sm"
                                                                : "text-slate-500 hover:bg-slate-50 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-teal-400",
                                                        )}
                                                    >
                                                        <ItemIcon size={16} className="shrink-0" />
                                                        <span>{item.label}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </nav>
                </div>

                <div className="mt-auto space-y-4 p-4">
                    <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 dark:border-teal-900 dark:from-teal-950/40 dark:to-cyan-950/30">
                        <div className="mb-2 flex items-center gap-2">
                            <BadgeCheck size={18} className="text-teal-600 dark:text-teal-400" />
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

                    <form action={signOutFromPortalAction.bind(null, "admin")}>
                        <button
                            type="submit"
                            className="flex w-full items-center gap-3 rounded-xl border border-rose-100 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-950 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                            <LogOut size={18} />
                            <span>{t.logout}</span>
                        </button>
                    </form>

                    <p className="text-center text-[10px] text-slate-400">
                        Mjdital Admin · 1.0
                    </p>
                </div>
            </aside>
        </>
    );
}
