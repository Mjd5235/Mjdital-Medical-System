
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpLeft,
  BadgeCheck,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  UserRoundPlus,
  Wallet,
  X,
  Building2,
  BriefcaseMedical,
  HandCoins,
  type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { signOutFromPortalAction } from "@/actions/auth";
import { Locale } from "@/lib/i18n/types";

type PaymentStatus = "paid" | "insured";

type DashboardClientProps = {
  initialLocale: Locale;
};

interface Appointment {
  id: string;
  patient: string;
  doctor: string;
  clinic: string;
  time: string;
  status: PaymentStatus;
}

interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

interface Metric {
  id: string;
  title: string;
  value: string;
  suffix: string;
  description: string;
  icon: LucideIcon;
  trend?: string;
  accent: "blue" | "teal";
}

const translations = {
  ar: {
    greeting: "مرحباً، نورة",
    role: "مدير النظام",
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
    title: "لوحة التحكم الرئيسية",
    subtitle: "نظرة شاملة على أداء المركز ومؤشراته التشغيلية والمالية.",
    home: "الرئيسية",
    weeklySummary: "ملخص الأداء الأسبوعي",
    revenue: "إجمالي إيرادات اليوم",
    appointments: "إجمالي المواعيد اليومية",
    approved: "طلبات نفيس المعتمدة",
    newPatients: "المرضى الجدد هذا الأسبوع",
    vsLastWeek: "مقارنة بالأسبوع الماضي",
    complete: "مكتمل",
    pending: "قيد الانتظار",
    approvalRate: "معدل الموافقة",
    revenueTrend: "اتجاه الإيرادات الأسبوعية",
    revenueSubtitle: "ملخص الإيرادات حسب اليوم",
    zatcaCompliant: "متوافق مع متطلبات ZATCA",
    dailyRevenue: "إجمالي الإيرادات اليومية",
    last7Days: "آخر 7 أيام",
    paymentDistribution: "توزيع طرق الدفع",
    paymentSubtitle: "نسبة التحصيل حسب وسيلة الدفع",
    cash: "نقدي",
    insuranceNphies: "تأمين / نفيس",
    paymentMethods: "إجمالي وسائل الدفع",
    recentAppointments: "المواعيد الأخيرة",
    appointmentsSubtitle: "متابعة مواعيد المرضى وحالة الدفع",
    searchPlaceholder: "ابحث عن مريض أو طبيب...",
    patient: "المريض",
    doctor: "الطبيب",
    clinic: "العيادة",
    time: "الوقت",
    paymentStatus: "حالة الدفع",
    paid: "مدفوع",
    insured: "مؤمن",
    noAppointments: "لا توجد مواعيد تطابق البحث.",
    showing: "عرض",
    of: "من",
    appointmentsCount: "مواعيد",
    viewAll: "عرض جميع المواعيد",
    quickActions: "إجراءات سريعة",
    quickSubtitle: "الوصول المباشر إلى المهام الإدارية",
    addProvider: "إضافة موظف / طبيب",
    providerDescription: "إدارة الكادر الطبي",
    zatcaAction: "إعدادات الزكاة (ZATCA)",
    zatcaDescription: "الفوترة الإلكترونية",
    addInsurance: "إضافة عقد تأمين",
    insuranceDescription: "إدارة عقود التأمين",
    careTitle: "رعاية صحية أكثر كفاءة",
    careDescription:
      "تابع المؤشرات التشغيلية وسهّل إدارة خدمات المركز من مكان واحد.",
    copyright: "جميع الحقوق محفوظة",
    platform: "منصة إدارة الرعاية الصحية",
    menuOpen: "فتح القائمة الجانبية",
    menuClose: "إغلاق القائمة الجانبية",
    notifications: "الإشعارات",
    revenueAxis: "الإيرادات بالريال السعودي",
    days: ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
    clinics: ["القلب", "الأطفال", "الجلدية", "الباطنية"],
    patients: ["سارة العتيبي", "أحمد الشهري", "ريم القحطاني", "محمد الحربي"],
    doctors: [
      "د. نورة العتيبي",
      "د. خالد المطيري",
      "د. سارة القحطاني",
      "د. فهد الدوسري",
    ],
  },
  en: {
    greeting: "Hello, Noura",
    role: "System Administrator",
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
    title: "Admin Dashboard",
    subtitle: "A comprehensive overview of center performance and operations.",
    home: "Home",
    weeklySummary: "Weekly performance",
    revenue: "Today's Revenue",
    appointments: "Today's Appointments",
    approved: "NPHIES Approval Rate",
    newPatients: "New Patients This Week",
    vsLastWeek: "Compared with last week",
    complete: "Completed",
    pending: "Pending",
    approvalRate: "Approval rate",
    revenueTrend: "Weekly Revenue Trend",
    revenueSubtitle: "Daily revenue overview",
    zatcaCompliant: "ZATCA requirements",
    dailyRevenue: "Daily revenue",
    last7Days: "Last 7 days",
    paymentDistribution: "Payment Distribution",
    paymentSubtitle: "Collection by payment method",
    cash: "Cash",
    insuranceNphies: "Insurance / NPHIES",
    paymentMethods: "Payment methods",
    recentAppointments: "Recent Appointments",
    appointmentsSubtitle: "Patient appointments and payment status",
    searchPlaceholder: "Search patients or doctors...",
    patient: "Patient",
    doctor: "Doctor",
    clinic: "Clinic",
    time: "Time",
    paymentStatus: "Payment Status",
    paid: "Paid",
    insured: "Insured",
    noAppointments: "No appointments match your search.",
    showing: "Showing",
    of: "of",
    appointmentsCount: "appointments",
    viewAll: "View all appointments",
    quickActions: "Quick Actions",
    quickSubtitle: "Shortcuts to common administrative tasks",
    addProvider: "Add Employee / Doctor",
    providerDescription: "Manage clinical staff",
    zatcaAction: "ZATCA Settings",
    zatcaDescription: "E-invoicing configuration",
    addInsurance: "Add Insurance Contract",
    insuranceDescription: "Manage insurance contracts",
    careTitle: "More Efficient Healthcare",
    careDescription:
      "Monitor operational metrics and manage your center from one place.",
    copyright: "All rights reserved",
    platform: "Healthcare Management Platform",
    menuOpen: "Open sidebar",
    menuClose: "Close sidebar",
    notifications: "Notifications",
    revenueAxis: "Revenue in Saudi Riyals",
    days: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    clinics: ["Cardiology", "Pediatrics", "Dermatology", "Internal Medicine"],
    patients: ["Sarah Al-Otaibi", "Ahmed Al-Shehri", "Reem Al-Qahtani", "Mohammed Al-Harbi"],
    doctors: [
      "Dr. Noura Al-Otaibi",
      "Dr. Khalid Al-Mutairi",
      "Dr. Sarah Al-Qahtani",
      "Dr. Fahad Al-Dosari",
    ],
  },
} as const;

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

function getNavigation(t: (typeof translations)[Locale]): NavigationGroup[] {
  return [
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
}

const revenueValues = [10000, 8500, 11800, 10200, 12200, 14300, 17600];

const appointmentData: Appointment[] = [
  { id: "APT-001", patient: "", doctor: "", clinic: "", time: "09:00", status: "paid" },
  { id: "APT-002", patient: "", doctor: "", clinic: "", time: "10:30", status: "insured" },
  { id: "APT-003", patient: "", doctor: "", clinic: "", time: "11:15", status: "paid" },
  { id: "APT-004", patient: "", doctor: "", clinic: "", time: "12:00", status: "insured" },
];

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function MetricCard({
  metric,
  locale,
}: {
  metric: Metric;
  locale: Locale;
}) {
  const Icon = metric.icon;

  return (
    <article className="dashboard-card flex min-w-0 flex-col justify-between gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
            {metric.title}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-extrabold tracking-tight sm:text-3xl",
                metric.accent === "teal"
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-blue-600 dark:text-blue-400",
              )}
            >
              {metric.value}
            </span>
            {metric.suffix && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {metric.suffix}
              </span>
            )}
          </div>
        </div>
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
            metric.accent === "teal"
              ? "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
          )}
        >
          <Icon size={23} strokeWidth={1.8} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {metric.trend ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <ArrowUpLeft size={14} />
            {metric.trend}
          </span>
        ) : (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-400">
            {metric.description}
          </span>
        )}
        {metric.trend && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {metric.description}
          </span>
        )}
      </div>
    </article>
  );
}

function RevenueChart({
  locale,
  days,
}: {
  locale: Locale;
  days: readonly string[];
}) {
  const width = 700;
  const height = 180;
  const left = 48;
  const right = 12;
  const top = 14;
  const bottom = 22;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const points = revenueValues.map((value, index) => ({
    x: left + (index / (revenueValues.length - 1)) * plotWidth,
    y: top + plotHeight - (value / 20000) * plotHeight,
    value,
  }));

  const visualPoints = locale === "ar" ? [...points].reverse() : points;
  const visualDays = locale === "ar" ? [...days].reverse() : [...days];

  const linePath = visualPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${visualPoints[visualPoints.length - 1].x} ${top + plotHeight
    } L ${visualPoints[0].x} ${top + plotHeight} Z`;

  return (
    <div className="mt-5 min-w-0">
      <div className="flex gap-2">
        <div className="flex h-[180px] shrink-0 flex-col justify-between pb-4 text-[10px] text-slate-500 sm:text-xs">
          {[20000, 15000, 10000, 5000, 0].map((value) => (
            <span key={value} className="whitespace-nowrap">
              {value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} {locale === "ar" ? "ر.س" : "SAR"}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[180px] w-full"
            role="img"
            aria-label={locale === "ar" ? "اتجاه الإيرادات الأسبوعية" : "Weekly revenue trend"}
          >
            <defs>
              <linearGradient id="revenue-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity=".2" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity=".01" />
              </linearGradient>
            </defs>

            {[0, 5000, 10000, 15000, 20000].map((value) => {
              const y = top + plotHeight - (value / 20000) * plotHeight;
              return (
                <line
                  key={value}
                  x1={left}
                  y1={y}
                  x2={width - right}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity=".09"
                />
              );
            })}

            {visualPoints.map((point) => (
              <line
                key={point.x}
                x1={point.x}
                y1={top}
                x2={point.x}
                y2={top + plotHeight}
                stroke="currentColor"
                strokeOpacity=".06"
              />
            ))}

            <path d={areaPath} fill="url(#revenue-area)" />
            <path
              d={linePath}
              fill="none"
              stroke="#0d9488"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {visualPoints.map((point, index) => (
              <circle
                key={point.x}
                cx={point.x}
                cy={point.y}
                r="4"
                fill="#0d9488"
                stroke="var(--dashboard-card, #ffffff)"
                strokeWidth="2"
              >
                <title>
                  {visualDays[index]}: {point.value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")}
                </title>
              </circle>
            ))}
          </svg>

          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500 sm:text-xs">
            {visualDays.map((day) => (
              <span key={day} className="whitespace-nowrap">
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentDonut({ t }: { t: (typeof translations)[Locale] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 pt-5">
      <div
        className="relative grid h-36 w-36 place-items-center rounded-full sm:h-40 sm:w-40"
        style={{
          background:
            "conic-gradient(#0d9488 0deg 233deg, var(--dashboard-card, #fff) 233deg 236deg, #3b82f6 236deg 360deg)",
        }}
        role="img"
        aria-label={`${t.cash} 35%, ${t.insuranceNphies} 65%`}
      >
        <div className="absolute inset-[25%] grid place-items-center rounded-full bg-white text-lg font-bold text-slate-800 dark:bg-slate-900 dark:text-white">
          100%
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="h-3 w-3 rounded-full bg-blue-500" />
          <span className="text-slate-600 dark:text-slate-300">{t.cash}</span>
          <strong className="text-slate-900 dark:text-white">35%</strong>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="h-3 w-3 rounded-full bg-teal-600" />
          <span className="text-slate-600 dark:text-slate-300">{t.insuranceNphies}</span>
          <strong className="text-slate-900 dark:text-white">65%</strong>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  locale,
  t,
  open,
  onClose,
}: {
  locale: Locale;
  t: (typeof translations)[Locale];
  open: boolean;
  onClose: () => void;
}) {
  // Clinical Setup is deliberately expanded on every initial page load.
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "overview",
    "clinical",
  ]);

  const isRtl = locale === "ar";
  const navigation = getNavigation(t);

  function toggleGroup(id: string) {
    setExpandedGroups((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

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
          open ? "translate-x-0" : isRtl ? "translate-x-full lg:translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-slate-100 px-5 dark:border-slate-800">
          <Link
            href={routes.dashboard}
            className="flex min-w-0 items-center"
            onClick={onClose}
            aria-label={t.dashboard}
          >
            <BrandLogo />
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
              const expanded = expandedGroups.includes(group.id);
              const containsActive = group.items.some(
                (item) => item.href === routes.dashboard,
              );

              return (
                <section key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
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
                      className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
                    />
                  </button>

                  {expanded && (
                    <div
                      className={cn(
                        "mt-1 space-y-1",
                        isRtl
                          ? "mr-5 border-r pr-3"
                          : "ml-5 border-l pl-3",
                        "border-slate-200 dark:border-slate-700",
                      )}
                    >
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = item.href === routes.dashboard;

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

export default function AdminDashboardPage({ initialLocale,
}: DashboardClientProps) {

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    const root = document.documentElement;

    function syncLocale() {
      const nextLocale = root.lang === "en" ? "en" : "ar";
      setLocale(nextLocale);
    }

    // قراءة اللغة الحالية عند تحميل الصفحة.
    syncLocale();

    // LanguageToggle يحدّث lang وdir بنفسه.
    // نراقب التغييرات دون تعديل المكوّن المشترك.
    const observer = new MutationObserver(syncLocale);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["lang", "dir"],
    });

    return () => observer.disconnect();
  }, []);

  const t = translations[locale];
  const isRtl = locale === "ar";

  const metrics: Metric[] = [
    {
      id: "revenue",
      title: t.revenue,
      value: "18,450",
      suffix: isRtl ? "ر.س" : "SAR",
      description: t.vsLastWeek,
      icon: CircleDollarSign,
      trend: "+13%",
      accent: "blue",
    },
    {
      id: "appointments",
      title: t.appointments,
      value: "84",
      suffix: isRtl ? "موعداً" : "appointments",
      description: `52 ${t.complete} · 32 ${t.pending}`,
      icon: CalendarDays,
      accent: "blue",
    },
    {
      id: "nphies",
      title: t.approved,
      value: "92%",
      suffix: "",
      description: t.approvalRate,
      icon: ShieldCheck,
      accent: "teal",
    },
    {
      id: "patients",
      title: t.newPatients,
      value: "36",
      suffix: isRtl ? "مريضاً" : "patients",
      description: t.vsLastWeek,
      icon: UserRoundPlus,
      trend: "+8%",
      accent: "blue",
    },
  ];

  const appointments = appointmentData.map((appointment, index) => ({
    ...appointment,
    patient: t.patients[index],
    doctor: t.doctors[index],
    clinic: t.clinics[index],
  }));

  const filteredAppointments = appointments.filter((appointment) => {
    const query = searchQuery.trim().toLocaleLowerCase(
      locale === "ar" ? "ar" : "en",
    );

    return (
      !query ||
      appointment.patient.toLocaleLowerCase(locale).includes(query) ||
      appointment.doctor.toLocaleLowerCase(locale).includes(query) ||
      appointment.clinic.toLocaleLowerCase(locale).includes(query)
    );
  });

  const quickActions = [
    {
      label: t.addProvider,
      description: t.providerDescription,
      href: routes.providers,
      icon: UserRoundPlus,
      accent: "teal",
    },
    {
      label: t.zatcaAction,
      description: t.zatcaDescription,
      href: routes.zatca,
      icon: FileText,
      accent: "blue",
    },
    {
      label: t.addInsurance,
      description: t.insuranceDescription,
      href: routes.policies,
      icon: ShieldCheck,
      accent: "teal",
    },
  ] as const;

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="flex min-h-screen">
        <Sidebar
          locale={locale}
          t={t}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
            <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 py-3 sm:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={t.menuOpen}
                  aria-controls="admin-sidebar"
                  aria-expanded={sidebarOpen}
                  onClick={() => setSidebarOpen(true)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
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

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                <LanguageToggle
                  locale={locale}
                  variant="header"
                />

                <ThemeToggle
                  lightLabel={locale === "ar" ? "الوضع الفاتح" : "Light mode"}
                  darkLabel={locale === "ar" ? "الوضع الداكن" : "Dark mode"}
                  variant="header"
                />

                <button
                  type="button"
                  aria-label={t.notifications}
                  className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Bell size={20} />

                  <span
                    className={cn(
                      "absolute top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500 dark:border-slate-950",
                      isRtl ? "right-2" : "left-2",
                    )}
                  />
                </button>

                <div className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-slate-700" />

                <div className="hidden h-10 w-10 place-items-center rounded-full bg-teal-50 text-teal-700 sm:grid dark:bg-teal-950/50 dark:text-teal-400">
                  <Users size={20} />
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{t.home}</span>
                  <ChevronLeft
                    size={13}
                    className={cn(!isRtl && "rotate-180")}
                  />
                  <span className="font-medium text-teal-700 dark:text-teal-400">
                    {t.dashboard}
                  </span>
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                  {t.title}
                </h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t.subtitle}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:self-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <CalendarDays size={15} className="text-teal-600" />
                {t.weeklySummary}
              </div>
            </section>

            <section
              aria-label={t.title}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4"
            >
              {metrics.map((metric) => (
                <MetricCard key={metric.id} metric={metric} locale={locale} />
              ))}
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)]">
              <article className="dashboard-card min-w-0 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {t.revenueTrend}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.revenueSubtitle}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <Check size={13} />
                    {t.zatcaCompliant}
                  </span>
                </div>

                <RevenueChart locale={locale} days={t.days} />

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                    {t.dailyRevenue}
                  </div>
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {t.last7Days}
                  </span>
                </div>
              </article>

              <article className="dashboard-card min-w-0 p-4 sm:p-5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.paymentDistribution}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t.paymentSubtitle}
                </p>

                <PaymentDonut t={t} />

                <div className="mt-5 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Activity size={17} className="text-teal-600" />
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {t.paymentMethods}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      100%
                    </span>
                  </div>
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
              <article className="dashboard-card min-w-0 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {t.recentAppointments}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t.appointmentsSubtitle}
                    </p>
                  </div>

                  <label className="relative block w-full sm:max-w-[260px]">
                    <Search
                      aria-hidden="true"
                      size={16}
                      className={cn(
                        "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
                        isRtl ? "right-3" : "left-3",
                      )}
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t.searchPlaceholder}
                      aria-label={t.searchPlaceholder}
                      className={cn(
                        "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white",
                        // Reserve space at the icon side in both directions.
                        isRtl ? "pr-10 pl-3 text-right" : "pl-10 pr-3 text-left",
                      )}
                    />
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-start text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                        <th scope="col" className="px-5 py-3.5">{t.patient}</th>
                        <th scope="col" className="px-4 py-3.5">{t.doctor}</th>
                        <th scope="col" className="px-4 py-3.5">{t.clinic}</th>
                        <th scope="col" className="px-4 py-3.5">{t.time}</th>
                        <th scope="col" className="px-5 py-3.5">{t.paymentStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredAppointments.map((appointment) => (
                        <tr
                          key={appointment.id}
                          className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
                        >
                          <td className="whitespace-nowrap px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
                                {appointment.patient.charAt(0)}
                              </div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {appointment.patient}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
                            {appointment.doctor}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-300">
                            {appointment.clinic}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 size={13} />
                              {appointment.time}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold",
                                appointment.status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                  : "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400",
                              )}
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  appointment.status === "paid" ? "bg-emerald-500" : "bg-cyan-500",
                                )}
                              />
                              {appointment.status === "paid" ? t.paid : t.insured}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {filteredAppointments.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                            {t.noAppointments}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t.showing} {filteredAppointments.length} {t.of} {appointments.length} {t.appointmentsCount}
                  </span>
                  <Link
                    href={routes.schedules}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-800 dark:text-teal-400"
                  >
                    {t.viewAll}
                    <ChevronLeft size={15} className={cn(!isRtl && "rotate-180")} />
                  </Link>
                </div>
              </article>

              <article className="dashboard-card p-4 sm:p-5">
                <div className="mb-5">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {t.quickActions}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t.quickSubtitle}
                  </p>
                </div>

                <div className="space-y-3">
                  {quickActions.map((action) => {
                    const Icon = action.icon;

                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition-all hover:border-teal-200 hover:bg-teal-50/50 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
                      >
                        <div
                          className={cn(
                            "grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-105",
                            action.accent === "blue"
                              ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                              : "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400",
                          )}
                        >
                          <Icon size={23} strokeWidth={1.8} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {action.label}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {action.description}
                          </p>
                        </div>

                        <ChevronLeft
                          size={17}
                          className={cn(
                            "shrink-0 text-slate-400 transition-transform group-hover:text-teal-600",
                            isRtl
                              ? "group-hover:-translate-x-1"
                              : "rotate-180 group-hover:translate-x-1",
                          )}
                        />
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <HeartPulse size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">
                        {t.careTitle}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t.careDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/80 py-5 text-xs text-slate-400 sm:flex-row dark:border-slate-800">
              <span>
                © {new Date().getFullYear()} Mjdital — {t.copyright}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t.platform}
              </span>
            </footer>
          </div>
        </main>
      </div>

      <style jsx global>{`
        .dashboard-card {
          border: 1px solid #e8edf3;
          border-radius: 16px;
          background: var(--dashboard-card, #ffffff);
          box-shadow: 0 1px 2px rgb(15 23 42 / 0.025);
        }

        .dark .dashboard-card {
          border-color: #1e293b;
          background: var(--card, #020617);
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}
