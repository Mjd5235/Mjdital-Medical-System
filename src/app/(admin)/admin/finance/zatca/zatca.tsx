"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type ClipboardEvent,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
    Building2,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Copy,
    Eye,
    Info,
    Lock,
    MoreHorizontal,
    ShieldCheck,
    Table2,
    X,
} from "lucide-react";

import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    generateZatcaCsidAction,
    getZatcaOverviewAction,
    getZatcaTransmissionsAction,
    setZatcaEnvironmentAction,
    type ZatcaCredentialView,
    type ZatcaEnvironmentValue,
    type ZatcaProfileField,
    type ZatcaRange,
    type ZatcaResponseStatusValue,
    type ZatcaTaxProfile,
    type ZatcaTransmissionRow,
} from "./actions";

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

const ZATCA_HREF = "/admin/finance/zatca";
const SETTINGS_HREF = "/admin/settings";
const PAGE_SIZE = 10;
const OTP_LENGTH = 6;
const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const POLL_MS = 30_000;
const LOG_STALE_MS = 15_000;
const SKELETON_ROWS = 5;
const DEFAULT_RANGE: ZatcaRange = "7D";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<ZatcaRange, number> = {
    "24H": DAY_MS,
    "7D": 7 * DAY_MS,
    "30D": 30 * DAY_MS,
    "90D": 90 * DAY_MS,
};
const RANGE_ORDER: ZatcaRange[] = ["24H", "7D", "30D", "90D"];

const KEEP_OTP_CODES = new Set([
    "PROFILE_INCOMPLETE",
    "INVALID_OTP_FORMAT",
    "ENCRYPTION_NOT_CONFIGURED",
    "CSR_GENERATION_FAILED",
]);

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type ZatcaIntegrationProps = {
    initialLocale: Locale;
};

type Env = ZatcaEnvironmentValue;
type RowsByEnv = Record<Env, ZatcaTransmissionRow[]>;
type LogMeta = Record<string, { at: number; truncated: boolean }>;
type CertState = "none" | "active" | "expired";
type ToastItem = { id: number; kind: "success" | "error"; message: string };
type ToastInput = Omit<ToastItem, "id">;

const EMPTY_PROFILE: ZatcaTaxProfile = {
    taxRegistrationNumber: "",
    legalEntityName: "",
    streetName: "",
    district: "",
    city: "",
    postalCode: "",
    complete: false,
    missing: [],
};

const EMPTY_ROWS: RowsByEnv = { SIMULATION: [], PRODUCTION: [] };
const EMPTY_CREDENTIALS: Record<Env, ZatcaCredentialView | null> = {
    SIMULATION: null,
    PRODUCTION: null,
};

/* -------------------------------------------------------------------------- */
/*                                  Messages                                  */
/* -------------------------------------------------------------------------- */

const en = {
    breadcrumbRoot: "Finance & ZATCA",
    title: "ZATCA Integration",
    subtitle: "Manage Phase 2 e-invoicing certificates and monitor EGS device connectivity.",
    connected: "Connected & Certified",
    notConnected: "Not Connected",
    expiredBadge: "Certificate Expired",
    envTitle: "Environment & Tax Profile",
    envSubtitle: "Select your ZATCA environment and view your registered tax profile.",
    envLabel: "ZATCA environment",
    sandbox: "Simulation Sandbox",
    production: "Production",
    tax: "Tax Registration Number",
    legal: "Legal Entity Name",
    street: "Street Name",
    district: "District",
    city: "City",
    postal: "Postal Code",
    lockedHint: "Managed in Center Settings",
    profileIncomplete: "Complete these fields in Center Settings to enable certification:",
    openSettings: "Open Center Settings",
    fieldLabels: {
        taxRegistrationNumber: "Tax Registration Number",
        legalEntityName: "Legal Entity Name",
        streetName: "Street Name",
        district: "District",
        city: "City",
        postalCode: "Postal Code",
    } as Record<ZatcaProfileField, string>,
    credTitle: "ZATCA Cryptographic Credentials",
    credSubtitle: "Generate and manage your EGS cryptographic stamp identifier (CSID).",
    otpLabel: "One-Time Password (OTP)",
    otpHelp: "Retrieve this code from the ZATCA Fatoora portal to onboard this EGS device.",
    otpDigit: (n: number) => `OTP digit ${n}`,
    generate: "Generate & Certify CSID",
    certifyingButton: "Certifying…",
    activeCert: "Active Certificate",
    expiredCert: "Certificate Expired",
    issued: "Issued",
    expires: "Expires",
    expiresIn: (days: number) => `Expires in ${days} ${days === 1 ? "day" : "days"}`,
    egsSerial: "EGS Device Serial",
    noCert: "No certificate issued",
    noCertHint: "Enter the OTP from Fatoora and generate a CSID to start reporting invoices in this environment.",
    certifyingTitle: "Certifying with ZATCA…",
    certifyingHint: "Creating the key pair and requesting your certificates. This can take a few seconds.",
    logTitle: "ZATCA Transmission Log",
    logSubtitle: "Recent invoice submissions and authority responses.",
    colInvoice: "Invoice Ref / UUID",
    colType: "Invoice Type",
    colSubmitted: "Submitted At",
    colResponse: "ZATCA Response",
    colDetails: "Details",
    typeSimplified: "Simplified B2C",
    typeTax: "Tax Invoice B2B",
    typeCredit: "Credit Note",
    typeDebit: "Debit Note",
    insurance: "Insurance",
    statusReported: "REPORTED",
    statusCleared: "CLEARED",
    statusRejected: "REJECTED",
    statusPending: "PENDING",
    viewError: "View Error",
    viewDetails: "View details",
    moreActions: "More actions",
    copyUuid: "Copy invoice UUID",
    copyRef: "Copy invoice reference",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy to clipboard",
    ranges: {
        "24H": "Last 24 hours",
        "7D": "Last 7 days",
        "30D": "Last 30 days",
        "90D": "Last 90 days",
    } as Record<ZatcaRange, string>,
    periodLabel: "Period",
    resetFilters: "Reset Filters",
    empty: "No transmissions in this period",
    emptyHint: "Invoices reported to ZATCA from this environment will appear here.",
    emptyFiltered: "No transmissions match the selected period",
    loadFailed: "Unable to load data. Please try again.",
    retry: "Retry",
    showing: (from: number, to: number, total: number) => `Showing ${from}–${to} of ${total}`,
    truncated: (n: number) => `Showing the latest ${n} submissions.`,
    previous: "Previous",
    next: "Next",
    errorTitle: "ZATCA Rejection Details",
    detailsTitle: "Transmission Details",
    invoiceUuid: "Invoice UUID",
    requestId: "ZATCA request ID",
    httpStatus: "HTTP status",
    payer: "Payer",
    environmentLabel: "Environment",
    messagesTitle: "Authority messages",
    noMessages: "No response messages were recorded for this submission.",
    levelError: "Error",
    levelWarning: "Warning",
    levelInfo: "Info",
    close: "Close",
    confirmTitle: "Switch to Production?",
    confirmBody: "Invoices will be reported to the live ZATCA platform and carry legal effect. Make sure the Production certificate is issued and the tax profile is correct.",
    cancel: "Cancel",
    confirmSwitch: "Switch to Production",
    envFailed: "Could not switch the environment. The previous environment was restored.",
    csidSuccess: "CSID certified successfully by ZATCA.",
    csidFailed: "CSID generation failed. Please try again.",
    otpRequired: "Enter the 6-digit OTP first.",
    technicalDetails: "Technical details",
    copyDetails: "Copy details",
};

type Messages = typeof en;

const ar: Messages = {
    breadcrumbRoot: "النظام المالي والزكاة",
    title: "إعدادات ربط الزكاة",
    subtitle: "إدارة شهادات الفوترة الإلكترونية (المرحلة الثانية) ومتابعة اتصال أجهزة EGS.",
    connected: "متصل ومعتمد",
    notConnected: "غير متصل",
    expiredBadge: "الشهادة منتهية",
    envTitle: "البيئة والملف الضريبي",
    envSubtitle: "اختر بيئة هيئة الزكاة واطّلع على ملفك الضريبي المسجّل.",
    envLabel: "بيئة هيئة الزكاة",
    sandbox: "بيئة المحاكاة",
    production: "الإنتاج",
    tax: "الرقم الضريبي",
    legal: "اسم المنشأة القانوني",
    street: "اسم الشارع",
    district: "الحي",
    city: "المدينة",
    postal: "الرمز البريدي",
    lockedHint: "يُدار من إعدادات المركز",
    profileIncomplete: "أكمل هذه الحقول في إعدادات المركز لتفعيل الاعتماد:",
    openSettings: "فتح إعدادات المركز",
    fieldLabels: {
        taxRegistrationNumber: "الرقم الضريبي",
        legalEntityName: "اسم المنشأة القانوني",
        streetName: "اسم الشارع",
        district: "الحي",
        city: "المدينة",
        postalCode: "الرمز البريدي",
    },
    credTitle: "بيانات الاعتماد التشفيرية للزكاة",
    credSubtitle: "أنشئ وأدِر معرّف ختم التشفير (CSID) لجهاز EGS.",
    otpLabel: "كلمة المرور لمرة واحدة (OTP)",
    otpHelp: "احصل على هذا الرمز من بوابة فاتورة (Fatoora) التابعة للهيئة لتسجيل جهاز EGS هذا.",
    otpDigit: (n: number) => `الخانة ${n} من رمز OTP`,
    generate: "إنشاء واعتماد CSID",
    certifyingButton: "جارٍ الاعتماد…",
    activeCert: "شهادة سارية",
    expiredCert: "شهادة منتهية",
    issued: "تاريخ الإصدار",
    expires: "تاريخ الانتهاء",
    expiresIn: (days: number) => `تنتهي خلال ${days} ${days === 1 ? "يوم" : "أيام"}`,
    egsSerial: "الرقم التسلسلي لجهاز EGS",
    noCert: "لا توجد شهادة صادرة",
    noCertHint: "أدخل رمز OTP من بوابة فاتورة ثم أنشئ CSID لبدء إبلاغ الفواتير في هذه البيئة.",
    certifyingTitle: "جارٍ الاعتماد لدى هيئة الزكاة…",
    certifyingHint: "يتم إنشاء زوج المفاتيح وطلب الشهادات. قد يستغرق ذلك بضع ثوانٍ.",
    logTitle: "سجل إرسال الفواتير إلى الزكاة",
    logSubtitle: "أحدث الفواتير المرسلة وردود الهيئة.",
    colInvoice: "رقم الفاتورة / UUID",
    colType: "نوع الفاتورة",
    colSubmitted: "وقت الإرسال",
    colResponse: "رد الهيئة",
    colDetails: "التفاصيل",
    typeSimplified: "فاتورة مبسطة B2C",
    typeTax: "فاتورة ضريبية B2B",
    typeCredit: "إشعار دائن",
    typeDebit: "إشعار مدين",
    insurance: "تأمين",
    statusReported: "تم الإبلاغ",
    statusCleared: "تم الاعتماد",
    statusRejected: "مرفوضة",
    statusPending: "قيد المعالجة",
    viewError: "عرض الخطأ",
    viewDetails: "عرض التفاصيل",
    moreActions: "المزيد من الإجراءات",
    copyUuid: "نسخ UUID الفاتورة",
    copyRef: "نسخ رقم الفاتورة",
    copied: "تم النسخ إلى الحافظة",
    copyFailed: "تعذّر النسخ إلى الحافظة",
    ranges: {
        "24H": "آخر 24 ساعة",
        "7D": "آخر 7 أيام",
        "30D": "آخر 30 يوماً",
        "90D": "آخر 90 يوماً",
    },
    periodLabel: "الفترة",
    resetFilters: "إعادة ضبط الفلاتر",
    empty: "لا توجد عمليات إرسال في هذه الفترة",
    emptyHint: "ستظهر هنا الفواتير المبلَّغ عنها إلى الهيئة من هذه البيئة.",
    emptyFiltered: "لا توجد عمليات إرسال ضمن الفترة المحددة",
    loadFailed: "تعذّر تحميل البيانات. حاول مرة أخرى.",
    retry: "إعادة المحاولة",
    showing: (from: number, to: number, total: number) => `عرض ${from}–${to} من ${total}`,
    truncated: (n: number) => `يتم عرض آخر ${n} عملية إرسال.`,
    previous: "السابق",
    next: "التالي",
    errorTitle: "تفاصيل رفض الهيئة",
    detailsTitle: "تفاصيل الإرسال",
    invoiceUuid: "UUID الفاتورة",
    requestId: "معرّف الطلب لدى الهيئة",
    httpStatus: "حالة HTTP",
    payer: "شركة التأمين",
    environmentLabel: "البيئة",
    messagesTitle: "رسائل الهيئة",
    noMessages: "لم يتم تسجيل رسائل رد لهذه العملية.",
    levelError: "خطأ",
    levelWarning: "تحذير",
    levelInfo: "معلومة",
    close: "إغلاق",
    confirmTitle: "التبديل إلى بيئة الإنتاج؟",
    confirmBody: "ستُبلَّغ الفواتير إلى منصة الهيئة الفعلية وتترتب عليها آثار نظامية. تأكد من إصدار شهادة الإنتاج وصحة الملف الضريبي.",
    cancel: "إلغاء",
    confirmSwitch: "التبديل إلى الإنتاج",
    envFailed: "تعذّر تبديل البيئة. تمت استعادة البيئة السابقة.",
    csidSuccess: "تم اعتماد CSID بنجاح من هيئة الزكاة.",
    csidFailed: "فشل إنشاء CSID. حاول مرة أخرى.",
    otpRequired: "أدخل رمز OTP المكوّن من 6 أرقام أولاً.",
    technicalDetails: "تفاصيل تقنية",
    copyDetails: "نسخ التفاصيل",
};

const messages: Record<Locale, Messages> = { en, ar };

/* -------------------------------------------------------------------------- */
/*                                Style tokens                                */
/* -------------------------------------------------------------------------- */

const cardClass =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-6";

const fieldClass =
    "h-12 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 ps-10 pe-3 text-start text-sm text-slate-700 outline-none transition-colors duration-150 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-slate-200";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-all duration-200 ease-out hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition-colors duration-150 hover:border-teal-500 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:text-teal-400";

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                 */
/* -------------------------------------------------------------------------- */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: Locale, kind: "date" | "time"): Intl.DateTimeFormat {
    const cacheKey = `${locale}:${kind}`;
    const cached = formatterCache.get(cacheKey);

    if (cached) return cached;

    const tag = locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US";
    const formatter =
        kind === "date"
            ? new Intl.DateTimeFormat(tag, {
                timeZone: "Asia/Riyadh",
                month: "short",
                day: "2-digit",
                year: "numeric",
            })
            : new Intl.DateTimeFormat(tag, {
                timeZone: "Asia/Riyadh",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23",
            });

    formatterCache.set(cacheKey, formatter);

    return formatter;
}

function formatDate(iso: string, locale: Locale): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : getFormatter(locale, "date").format(date);
}

function formatTime(iso: string, locale: Locale): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : getFormatter(locale, "time").format(date);
}

function formatDateTime(iso: string, locale: Locale): string {
    return `${formatDate(iso, locale)} · ${formatTime(iso, locale)}`;
}

/**
 * Server messages arrive as "English \u2014 Arabic", optionally followed by a diagnostics line
 * ("[HTTP 400 /path] {json}"). The user sees only the half for the current page language; the
 * diagnostics are returned separately so the UI can tuck them into a collapsible section.
 */
function splitError(message: string, locale: Locale): { text: string; details: string } {
    const [main, ...rest] = message.split("\n");
    const index = main.lastIndexOf(" \u2014 ");
    const text =
        index === -1 ? main : locale === "ar" ? main.slice(index + 3) : main.slice(0, index);

    return { text, details: prettyDetails(rest.join("\n").trim()) };
}

function prettyDetails(raw: string): string {
    const start = raw.indexOf("{");

    if (start === -1) return raw;

    try {
        return `${raw.slice(0, start).trim()}\n${JSON.stringify(JSON.parse(raw.slice(start)), null, 2)}`;
    } catch {
        return raw;
    }
}

function localizeError(message: string, locale: Locale): string {
    return splitError(message, locale).text;
}

function mergeRows(
    current: ZatcaTransmissionRow[],
    incoming: ZatcaTransmissionRow[],
): ZatcaTransmissionRow[] {
    const map = new Map<string, ZatcaTransmissionRow>();

    for (const row of current) map.set(row.id, row);
    for (const row of incoming) map.set(row.id, row);

    return Array.from(map.values()).sort((a, b) => {
        if (a.submittedAt === b.submittedAt) return a.id < b.id ? -1 : 1;
        return a.submittedAt < b.submittedAt ? 1 : -1;
    });
}

function isCovered(meta: LogMeta, env: Env, range: ZatcaRange): boolean {
    const needed = RANGE_ORDER.indexOf(range);

    return RANGE_ORDER.some(
        (candidate, index) => index >= needed && Boolean(meta[`${env}:${candidate}`]),
    );
}

function typeLabel(row: ZatcaTransmissionRow, t: Messages): string {
    const base =
        row.invoiceType === "SIMPLIFIED_B2C"
            ? t.typeSimplified
            : row.invoiceType === "TAX_B2B"
                ? t.typeTax
                : row.invoiceType === "CREDIT_NOTE"
                    ? t.typeCredit
                    : t.typeDebit;

    return row.isInsurance ? `${base} · ${t.insurance}` : base;
}

function statusLabel(status: ZatcaResponseStatusValue, t: Messages): string {
    switch (status) {
        case "REPORTED":
            return t.statusReported;
        case "CLEARED":
            return t.statusCleared;
        case "REJECTED":
            return t.statusRejected;
        default:
            return t.statusPending;
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Hooks                                    */
/* -------------------------------------------------------------------------- */

function useMountTransition(open: boolean, ms = 200) {
    const [mounted, setMounted] = useState(open);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);

            let inner = 0;
            const outer = requestAnimationFrame(() => {
                inner = requestAnimationFrame(() => setVisible(true));
            });

            return () => {
                cancelAnimationFrame(outer);
                cancelAnimationFrame(inner);
            };
        }

        setVisible(false);

        const timer = window.setTimeout(() => setMounted(false), ms);

        return () => window.clearTimeout(timer);
    }, [open, ms]);

    return { mounted, visible };
}

function useFadeIn(key: string): boolean {
    const [shown, setShown] = useState(true);

    useEffect(() => {
        setShown(false);

        const id = requestAnimationFrame(() => setShown(true));

        return () => cancelAnimationFrame(id);
    }, [key]);

    return shown;
}

/* -------------------------------------------------------------------------- */
/*                              Presentational UI                             */
/* -------------------------------------------------------------------------- */

function Modal({
    open,
    onClose,
    labelledBy,
    children,
    widthClass = "max-w-2xl",
}: {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    children: ReactNode;
    widthClass?: string;
}) {
    const { mounted, visible } = useMountTransition(open);

    useEffect(() => {
        if (!open) return;

        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    if (!mounted) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={`fixed inset-0 z-[150] flex items-center justify-center p-4 transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"
                }`}
        >
            <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={onClose}
                className="absolute inset-0 cursor-default bg-slate-950/70 -sm"
            />

            <div
                className={`relative max-h-[90vh] w-full ${widthClass} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/50 transition-all duration-200 ease-out dark:border-slate-700 dark:bg-slate-900 ${visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
                    }`}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}

function StatusBadge({
    status,
    t,
}: {
    status: ZatcaResponseStatusValue;
    t: Messages;
}) {
    const styles: Record<ZatcaResponseStatusValue, { wrap: string; dot: string }> = {
        REPORTED: {
            wrap: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
            dot: "bg-emerald-500 dark:bg-emerald-400",
        },
        CLEARED: {
            wrap: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
            dot: "bg-teal-500 dark:bg-teal-400",
        },
        REJECTED: {
            wrap: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
            dot: "bg-rose-500 dark:bg-rose-400",
        },
        PENDING: {
            wrap: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
            dot: "bg-amber-500 dark:bg-amber-400",
        },
    };

    const style = styles[status];

    return (
        <span
            className={`inline-flex h-10 items-center gap-2.5 rounded-lg px-4 text-sm font-semibold tracking-wide transition-colors duration-150 ${style.wrap}`}
        >
            <span
                className={`h-3 w-3 rounded-full ${style.dot} ${status === "PENDING" ? "animate-pulse" : ""
                    }`}
            />
            {statusLabel(status, t)}
        </span>
    );
}

function ConnectionBadge({
    state,
    t,
}: {
    state: "loading" | "connected" | "expired" | "none";
    t: Messages;
}) {
    if (state === "loading") {
        return (
            <div className="h-[60px] w-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        );
    }

    const tones = {
        connected: {
            wrap: "border-emerald-500/60 bg-emerald-50 text-emerald-700 shadow-[0_0_24px_-8px_rgba(16,185,129,0.6)] dark:bg-emerald-500/10 dark:text-emerald-300",
            dot: "bg-emerald-500 dark:bg-emerald-400",
            ping: "bg-emerald-400",
            label: t.connected,
        },
        expired: {
            wrap: "border-rose-500/60 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
            dot: "bg-rose-500 dark:bg-rose-400",
            ping: "",
            label: t.expiredBadge,
        },
        none: {
            wrap: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
            dot: "bg-slate-400 dark:bg-slate-500",
            ping: "",
            label: t.notConnected,
        },
    }[state];

    return (
        <div
            role="status"
            className={`inline-flex h-[60px] items-center gap-4 rounded-xl border px-6 text-lg font-semibold transition-all duration-200 ease-out ${tones.wrap}`}
        >
            <span className="relative flex h-3.5 w-3.5">
                {tones.ping ? (
                    <span
                        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tones.ping}`}
                    />
                ) : null}
                <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${tones.dot}`} />
            </span>
            {tones.label}
        </div>
    );
}

function LockedField({
    label,
    value,
    loading,
    hint,
    isRtl,
}: {
    label: string;
    value: string;
    loading: boolean;
    hint: string;
    isRtl: boolean;
}) {
    return (
        <div className="min-w-0">
            <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {label}
            </span>

            {loading ? (
                <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ) : (
                <div className="relative" dir={isRtl ? "rtl" : "ltr"}>
                    <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                        readOnly
                        value={value}
                        aria-label={label}
                        aria-readonly="true"
                        title={hint}
                        className={fieldClass}
                    />
                </div>
            )}
        </div>
    );
}

function OtpInput({
    value,
    onChange,
    onSubmit,
    disabled,
    invalid,
    t,
}: {
    value: string;
    onChange: (next: string) => void;
    onSubmit: () => void;
    disabled: boolean;
    invalid: boolean;
    t: Messages;
}) {
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    // Always holds the latest value synchronously (state updates are async, which caused the
    // "focus bounces back and the digit must be typed twice" bug).
    const valueRef = useRef(value);
    valueRef.current = value;

    const commit = useCallback(
        (next: string) => {
            valueRef.current = next;
            onChange(next);
        },
        [onChange],
    );

    const focusAt = useCallback((index: number) => {
        const target = Math.max(0, Math.min(OTP_LENGTH - 1, index));

        refs.current[target]?.focus();
    }, []);

    /** Inserts digits at `index` (replacing what is there) and moves focus after the last digit. */
    const insertDigits = useCallback(
        (index: number, raw: string) => {
            const digits = raw.replace(/\D/g, "");

            if (!digits) return;

            const current = valueRef.current;
            // A full code (paste / autofill) always starts at the first box.
            const start = digits.length >= OTP_LENGTH ? 0 : Math.min(index, current.length);
            const next = (
                current.slice(0, start) +
                digits +
                current.slice(start + digits.length)
            ).slice(0, OTP_LENGTH);

            commit(next);
            focusAt(Math.min(start + digits.length, OTP_LENGTH - 1));
        },
        [commit, focusAt],
    );

    const removeAt = useCallback(
        (index: number) => {
            const current = valueRef.current;

            if (current[index]) {
                // Clear the current box, then step back.
                commit(current.slice(0, index) + current.slice(index + 1));
                focusAt(index > 0 ? index - 1 : 0);
            } else if (index > 0) {
                // Empty box: clear the previous one and step back.
                commit(current.slice(0, index - 1) + current.slice(index));
                focusAt(index - 1);
            }
        },
        [commit, focusAt],
    );

    const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (/^\d$/.test(event.key)) {
            // Desktop path: one keystroke = one digit, no selection / maxLength race.
            event.preventDefault();
            insertDigits(index, event.key);
            return;
        }

        switch (event.key) {
            case "Backspace":
                event.preventDefault();
                removeAt(index);
                break;
            case "Delete":
                event.preventDefault();
                if (valueRef.current[index]) {
                    commit(valueRef.current.slice(0, index) + valueRef.current.slice(index + 1));
                }
                break;
            case "ArrowLeft":
                event.preventDefault();
                focusAt(index + (isRtlDocument() ? 1 : -1));
                break;
            case "ArrowRight":
                event.preventDefault();
                focusAt(index + (isRtlDocument() ? -1 : 1));
                break;
            case "Enter":
                event.preventDefault();
                onSubmit();
                break;
            default:
                // Block any other printable character; allow Tab and function keys.
                if (event.key.length === 1) event.preventDefault();
        }
    };

    // Fallback for mobile keyboards / autofill (they often fire "Unidentified" keydown events).
    const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value;
        const digits = raw.replace(/\D/g, "");

        if (!digits) {
            if (valueRef.current[index]) removeAt(index);
            else event.target.value = "";
            return;
        }

        const existing = valueRef.current[index] ?? "";
        // When a digit is already in the box, the browser appends the new one: keep only the new one.
        const incoming = digits.length > 1 && digits.length < OTP_LENGTH && existing
            ? digits.replace(existing, "").slice(-1) || digits.slice(-1)
            : digits;

        insertDigits(index, incoming);
    };

    const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        insertDigits(index, event.clipboardData.getData("text"));
    };

    return (
        <div dir="ltr" className="flex items-center gap-2 sm:gap-3">
            {Array.from({ length: OTP_LENGTH }, (_, index) => {
                const digit = value[index] ?? "";

                return (
                    <input
                        key={index}
                        ref={(element) => {
                            refs.current[index] = element;
                        }}
                        value={digit}
                        disabled={disabled}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={OTP_LENGTH}
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        aria-label={t.otpDigit(index + 1)}
                        aria-invalid={invalid}
                        onChange={(event) => handleChange(index, event)}
                        onKeyDown={(event) => handleKeyDown(index, event)}
                        onPaste={(event) => handlePaste(index, event)}
                        onFocus={() => {
                            // Never select text on focus. Only prevent skipping over empty boxes,
                            // using the synchronous ref so freshly typed digits are respected.
                            const filled = valueRef.current.length;

                            if (index > filled) focusAt(filled);
                        }}
                        className={`h-14 min-w-0 flex-1 rounded-lg border bg-white text-center text-2xl font-semibold text-slate-900 caret-transparent outline-none transition-all duration-200 ease-out selection:bg-transparent focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950/60 dark:text-white ${invalid
                            ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/25"
                            : digit
                                ? "border-teal-600/70 focus:border-teal-500 focus:ring-teal-500/25"
                                : "border-slate-200 focus:border-teal-500 focus:ring-teal-500/25 dark:border-slate-700"
                            }`}
                    />
                );
            })}
        </div>
    );
}

/** The OTP row is forced LTR, but arrow keys follow the page direction for natural navigation. */
function isRtlDocument(): boolean {
    return typeof document !== "undefined" && document.documentElement.dir === "rtl";
}

function Dropdown<T extends string>({
    value,
    options,
    onChange,
    ariaLabel,
}: {
    value: T;
    options: Array<{ value: T; label: string }>;
    onChange: (next: T) => void;
    ariaLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const current = options.find((option) => option.value === value);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => setOpen((state) => !state)}
                className="inline-flex h-11 min-w-[190px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition-colors duration-150 hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
                <span className="inline-flex items-center gap-2.5">
                    <CalendarDays className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    {current?.label}
                </span>
                <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform duration-200 ease-out dark:text-slate-400 ${open ? "rotate-180" : ""
                        }`}
                />
            </button>

            <div
                role="listbox"
                aria-label={ariaLabel}
                className={`absolute end-0 top-full z-30 mt-2 w-full min-w-[200px] origin-top overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-2xl shadow-black/30 transition-all duration-150 ease-out dark:border-slate-700 dark:bg-slate-900 ${open
                    ? "visible translate-y-0 scale-100 opacity-100"
                    : "invisible -translate-y-1 scale-95 opacity-0"
                    }`}
            >
                {options.map((option) => {
                    const selected = option.value === value;

                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            tabIndex={open ? 0 : -1}
                            onClick={() => {
                                setOpen(false);
                                onChange(option.value);
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition-colors duration-150 ${selected
                                ? "bg-teal-600/10 font-semibold text-teal-700 dark:text-teal-300"
                                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                }`}
                        >
                            {option.label}
                            {selected ? <CheckCircle2 className="h-4 w-4 text-teal-500" /> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function RowMenu({
    row,
    t,
    isRtl,
    onDetails,
    onCopy,
}: {
    row: ZatcaTransmissionRow;
    t: Messages;
    isRtl: boolean;
    onDetails: (row: ZatcaTransmissionRow) => void;
    onCopy: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { mounted, visible } = useMountTransition(open, 150);

    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const width = 224;
        const height = 150;

        let left = isRtl ? rect.left : rect.right - width;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

        let top = rect.bottom + 6;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);

        setPosition({ top, left });
    }, [open, isRtl]);

    useEffect(() => {
        if (!open) return;

        const close = () => setOpen(false);
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;

            if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
                setOpen(false);
            }
        };
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", close);
            window.removeEventListener("scroll", close, true);
        };
    }, [open]);

    const itemClass =
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.moreActions}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((state) => !state)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {mounted
                ? createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        style={{ top: position.top, left: position.left }}
                        dir={isRtl ? "rtl" : "ltr"}
                        className={`fixed z-[140] w-56 origin-top rounded-xl border border-slate-200 bg-white p-1 shadow-2xl shadow-black/40 transition-all duration-150 ease-out dark:border-slate-700 dark:bg-slate-900 ${visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-95 opacity-0"
                            }`}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className={itemClass}
                            onClick={() => {
                                setOpen(false);
                                onDetails(row);
                            }}
                        >
                            <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            {t.viewDetails}
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemClass}
                            onClick={() => {
                                setOpen(false);
                                onCopy(row.invoiceUuid);
                            }}
                        >
                            <Copy className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            {t.copyUuid}
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className={itemClass}
                            onClick={() => {
                                setOpen(false);
                                onCopy(row.invoiceRef);
                            }}
                        >
                            <Copy className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            {t.copyRef}
                        </button>
                    </div>,
                    document.body,
                )
                : null}
        </>
    );
}

function CertificateCard({
    t,
    locale,
    loading,
    state,
    certifying,
    credential,
}: {
    t: Messages;
    locale: Locale;
    loading: boolean;
    state: CertState;
    certifying: boolean;
    credential: ZatcaCredentialView | null;
}) {
    if (loading) {
        return <div className="h-[112px] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />;
    }

    if (certifying) {
        return (
            <div
                role="status"
                className="flex min-h-[112px] items-center gap-4 rounded-xl border border-amber-500/50 bg-amber-50 p-5 transition-all duration-200 ease-out dark:bg-amber-500/5"
            >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                    <span className="absolute h-3 w-3 animate-ping rounded-full bg-amber-400 opacity-70" />
                    <span className="relative h-3 w-3 rounded-full bg-amber-500" />
                </span>
                <div className="min-w-0">
                    <p className="text-base font-semibold text-amber-700 dark:text-amber-300">
                        {t.certifyingTitle}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.certifyingHint}</p>
                </div>
            </div>
        );
    }

    if (!credential || state === "none") {
        return (
            <div className="flex min-h-[112px] items-center gap-4 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Info className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </span>
                <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.noCert}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t.noCertHint}</p>
                </div>
            </div>
        );
    }

    const expired = state === "expired";
    const daysLeft = Math.ceil((Date.parse(credential.expiresAt) - Date.now()) / DAY_MS);

    return (
        <div
            className={`flex flex-col gap-4 rounded-xl border p-5 transition-all duration-200 ease-out sm:flex-row sm:items-center ${expired
                ? "border-rose-500/50 bg-rose-50 dark:bg-rose-500/5"
                : "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5"
                }`}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                    <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${expired ? "bg-rose-500/15" : "bg-emerald-500/15"
                            }`}
                    >
                        <span
                            className={`h-3.5 w-3.5 rounded-full ${expired ? "bg-rose-500" : "bg-emerald-500 dark:bg-emerald-400"
                                }`}
                        />
                    </span>
                    <p
                        className={`text-lg font-semibold ${expired
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-emerald-700 dark:text-emerald-300"
                            }`}
                    >
                        {expired ? t.expiredCert : t.activeCert}
                    </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <span>
                        {t.issued}:{" "}
                        <span className="font-medium text-slate-900 dark:text-white">
                            {formatDate(credential.issuedAt, locale)}
                        </span>
                    </span>
                    <span>
                        {t.expires}:{" "}
                        <span className="font-medium text-slate-900 dark:text-white">
                            {formatDate(credential.expiresAt, locale)}
                        </span>
                    </span>
                </div>

                {!expired && daysLeft <= 30 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                        {t.expiresIn(Math.max(daysLeft, 0))}
                    </p>
                ) : null}
            </div>

            <div className="border-slate-300 sm:border-s sm:ps-5 dark:border-slate-700/80">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t.egsSerial}</p>
                <p
                    dir="ltr"
                    className="mt-1 text-start text-lg font-semibold tracking-wide text-slate-900 dark:text-white"
                >
                    {credential.egsSerial}
                </p>
            </div>
        </div>
    );
}

function SkeletonRows({ count }: { count: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, index) => (
                <tr key={index} className="animate-pulse">
                    <td className="px-6 py-4">
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="mt-2.5 h-3 w-48 rounded bg-slate-200/80 dark:bg-slate-800/70" />
                    </td>
                    <td className="px-6 py-4">
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                        <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                        <div className="h-10 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
                            <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
                        </div>
                    </td>
                </tr>
            ))}
        </>
    );
}

function TransmissionDetails({
    row,
    t,
    locale,
    onClose,
    onCopy,
}: {
    row: ZatcaTransmissionRow;
    t: Messages;
    locale: Locale;
    onClose: () => void;
    onCopy: (value: string) => void;
}) {
    const rejected = row.status === "REJECTED";

    const levelStyle = {
        ERROR: {
            wrap: "border-rose-500/40 bg-rose-50 dark:bg-rose-500/5",
            text: "text-rose-700 dark:text-rose-300",
            label: t.levelError,
        },
        WARNING: {
            wrap: "border-amber-500/40 bg-amber-50 dark:bg-amber-500/5",
            text: "text-amber-700 dark:text-amber-300",
            label: t.levelWarning,
        },
        INFO: {
            wrap: "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40",
            text: "text-slate-700 dark:text-slate-300",
            label: t.levelInfo,
        },
    } as const;

    const meta: Array<{ label: string; value: string; mono?: boolean }> = [
        { label: t.colType, value: typeLabel(row, t) },
        { label: t.colSubmitted, value: formatDateTime(row.submittedAt, locale) },
        {
            label: t.environmentLabel,
            value: row.environment === "PRODUCTION" ? t.production : t.sandbox,
        },
        ...(row.payerName ? [{ label: t.payer, value: row.payerName }] : []),
        ...(row.httpStatus ? [{ label: t.httpStatus, value: String(row.httpStatus), mono: true }] : []),
        ...(row.zatcaRequestId
            ? [{ label: t.requestId, value: row.zatcaRequestId, mono: true }]
            : []),
    ];

    return (
        <>
            <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2
                        id="zatca-details-title"
                        className="text-xl font-bold text-slate-900 dark:text-white"
                    >
                        {rejected ? t.errorTitle : t.detailsTitle}
                    </h2>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {row.invoiceRef}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <StatusBadge status={row.status} t={t} />
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t.close}
                        className="rounded-lg p-2 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </header>

            <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t.invoiceUuid}
                        </p>
                        <p
                            dir="ltr"
                            className="mt-1 break-all text-start text-sm font-medium text-slate-900 dark:text-white"
                        >
                            {row.invoiceUuid}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onCopy(row.invoiceUuid)}
                        aria-label={t.copyUuid}
                        className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-400"
                    >
                        <Copy className="h-4 w-4" />
                    </button>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    {meta.map((item) => (
                        <div key={item.label} className="min-w-0">
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {item.label}
                            </dt>
                            <dd
                                dir={item.mono ? "ltr" : undefined}
                                className={`mt-1 break-words text-sm text-slate-900 dark:text-white ${item.mono ? "text-start" : ""
                                    }`}
                            >
                                {item.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t.messagesTitle}
            </h3>

            {row.messages.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                    {t.noMessages}
                </p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {row.messages.map((message, index) => {
                        const style = levelStyle[message.level];

                        return (
                            <li
                                key={`${message.code}-${index}`}
                                className={`rounded-xl border p-4 ${style.wrap}`}
                            >
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span
                                        className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${style.text}`}
                                    >
                                        <CircleAlert className="h-4 w-4" />
                                        {style.label}
                                    </span>
                                    {message.code ? (
                                        <span
                                            dir="ltr"
                                            className="rounded bg-slate-900/5 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
                                        >
                                            {message.code}
                                        </span>
                                    ) : null}
                                    {message.category ? (
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {message.category}
                                        </span>
                                    ) : null}
                                </div>
                                <p
                                    dir="auto"
                                    className="mt-2 break-words text-sm text-slate-800 dark:text-slate-100"
                                >
                                    {message.message}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <footer className="mt-6 flex justify-end">
                <button type="button" onClick={onClose} className={`${outlineButton} h-11`}>
                    {t.close}
                </button>
            </footer>
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export default function ZatcaIntegrationPage({ initialLocale }: ZatcaIntegrationProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [environment, setEnvironment] = useState<Env>("SIMULATION");
    const [profile, setProfile] = useState<ZatcaTaxProfile>(EMPTY_PROFILE);
    const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
    const [rowsByEnv, setRowsByEnv] = useState<RowsByEnv>(EMPTY_ROWS);
    const [logMeta, setLogMeta] = useState<LogMeta>({});
    const [range, setRange] = useState<ZatcaRange>(DEFAULT_RANGE);
    const [page, setPage] = useState(1);

    const [booting, setBooting] = useState(true);
    const [bootError, setBootError] = useState("");
    const [logFetching, setLogFetching] = useState(false);
    const [logError, setLogError] = useState("");

    const [otp, setOtp] = useState("");
    const [otpError, setOtpError] = useState("");
    const [certifyingEnv, setCertifyingEnv] = useState<Env | null>(null);

    const [detailRow, setDetailRow] = useState<ZatcaTransmissionRow | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    const tRef = useRef<Messages>(t);
    const envRef = useRef<Env>("SIMULATION");
    const rangeRef = useRef<ZatcaRange>(DEFAULT_RANGE);
    const logMetaRef = useRef<LogMeta>({});
    const inflightRef = useRef(new Set<string>());
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const certifyingRef = useRef<Env | null>(null);
    const toastIdRef = useRef(0);
    const mountedRef = useRef(false);
    const bootedRef = useRef(false);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        const root = document.documentElement;
        const syncLocale = () => setLocale(root.lang === "en" ? "en" : "ar");

        syncLocale();

        const observer = new MutationObserver(syncLocale);
        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    /* ---------------------------- toasts ---------------------------- */

    const dismissNotice = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushNotice = useCallback(
        (notice: ToastInput): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...notice, id }]);
            window.setTimeout(() => dismissNotice(id), TOAST_MS);

            return id;
        },
        [dismissNotice],
    );

    const copyText = useCallback(
        async (value: string) => {
            try {
                await navigator.clipboard.writeText(value);
                pushNotice({ kind: "success", message: tRef.current.copied });
            } catch {
                pushNotice({ kind: "error", message: tRef.current.copyFailed });
            }
        },
        [pushNotice],
    );

    /* ------------------------- transmission log ------------------------- */

    const loadLog = useCallback(
        async (env: Env, rng: ZatcaRange, options: { force?: boolean; silent?: boolean } = {}) => {
            const key = `${env}:${rng}`;
            const last = logMetaRef.current[key];

            if (!options.force && last && Date.now() - last.at < LOG_STALE_MS) return;
            if (inflightRef.current.has(key)) return;

            inflightRef.current.add(key);

            if (envRef.current === env && rangeRef.current === rng) setLogFetching(true);

            try {
                const result = await getZatcaTransmissionsAction({ environment: env, range: rng });

                if (!mountedRef.current) return;

                if (result.success && result.data) {
                    const data = result.data;

                    setRowsByEnv((current) => ({
                        ...current,
                        [env]: mergeRows(current[env], data.rows),
                    }));

                    logMetaRef.current = {
                        ...logMetaRef.current,
                        [key]: { at: Date.now(), truncated: data.truncated },
                    };
                    setLogMeta(logMetaRef.current);

                    if (envRef.current === env && rangeRef.current === rng) setLogError("");
                } else if (!options.silent && envRef.current === env && rangeRef.current === rng) {
                    setLogError(result.error ?? tRef.current.loadFailed);
                }
            } catch {
                if (mountedRef.current && !options.silent && envRef.current === env) {
                    setLogError(tRef.current.loadFailed);
                }
            } finally {
                inflightRef.current.delete(key);

                if (mountedRef.current) {
                    setLogFetching(inflightRef.current.has(`${envRef.current}:${rangeRef.current}`));
                }
            }
        },
        [],
    );

    /* ------------------------------- boot ------------------------------- */

    const boot = useCallback(async () => {
        setBooting(true);
        setBootError("");

        try {
            const result = await getZatcaOverviewAction();

            if (!mountedRef.current) return;

            if (!result.success || !result.data) {
                setBootError(result.error ?? tRef.current.loadFailed);
                return;
            }

            const data = result.data;

            envRef.current = data.environment;
            setEnvironment(data.environment);
            setProfile(data.profile);
            setCredentials(data.credentials);
            setRowsByEnv((current) => ({
                ...current,
                [data.environment]: mergeRows(current[data.environment], data.transmissions.rows),
            }));

            logMetaRef.current = {
                ...logMetaRef.current,
                [`${data.environment}:${data.transmissions.range}`]: {
                    at: Date.now(),
                    truncated: data.transmissions.truncated,
                },
            };
            setLogMeta(logMetaRef.current);
            bootedRef.current = true;
        } catch {
            if (mountedRef.current) setBootError(tRef.current.loadFailed);
        } finally {
            if (mountedRef.current) setBooting(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void boot();

        return () => {
            mountedRef.current = false;
        };
    }, [boot]);

    // Background status refresh (PENDING → REPORTED / REJECTED) without any visible loading state.
    useEffect(() => {
        const id = window.setInterval(() => {
            if (!bootedRef.current || document.visibilityState !== "visible") return;

            void loadLog(envRef.current, rangeRef.current, { force: true, silent: true });
        }, POLL_MS);

        return () => window.clearInterval(id);
    }, [loadLog]);

    /* ------------------------- environment switch ------------------------ */

    const applyEnvironment = useCallback(
        (next: Env) => {
            const previous = envRef.current;

            if (previous === next) return;

            envRef.current = next;
            setEnvironment(next);
            setPage(1);
            setLogError("");
            setOtpError("");
            void loadLog(next, rangeRef.current);

            queueRef.current = queueRef.current.then(async () => {
                try {
                    const result = await setZatcaEnvironmentAction({ environment: next });

                    if (!result.success) throw new Error(result.error ?? "");
                } catch (error) {
                    if (!mountedRef.current) return;

                    if (envRef.current === next) {
                        envRef.current = previous;
                        setEnvironment(previous);
                        void loadLog(previous, rangeRef.current);
                    }

                    pushNotice({
                        kind: "error",
                        message:
                            error instanceof Error && error.message
                                ? error.message
                                : tRef.current.envFailed,
                    });
                }
            });
        },
        [loadLog, pushNotice],
    );

    const selectEnvironment = useCallback(
        (next: Env) => {
            if (next === envRef.current) return;

            if (next === "PRODUCTION") {
                setConfirmOpen(true);
                return;
            }

            applyEnvironment(next);
        },
        [applyEnvironment],
    );

    /* ----------------------------- filters ----------------------------- */

    const changeRange = useCallback(
        (next: ZatcaRange) => {
            rangeRef.current = next;
            setRange(next);
            setPage(1);
            setLogError("");
            void loadLog(envRef.current, next);
        },
        [loadLog],
    );

    const resetFilters = useCallback(() => changeRange(DEFAULT_RANGE), [changeRange]);

    /* ------------------------------- CSID ------------------------------- */

    const handleOtpChange = useCallback((next: string) => {
        setOtp(next);
        setOtpError((current) => (current ? "" : current));
    }, []);

    const handleGenerate = useCallback(() => {
        if (certifyingRef.current) return;

        if (!/^\d{6}$/.test(otp)) {
            setOtpError(tRef.current.otpRequired);
            return;
        }

        const env = envRef.current;
        const code = otp;

        certifyingRef.current = env;
        setCertifyingEnv(env);
        setOtpError("");

        generateZatcaCsidAction({ environment: env, otp: code })
            .then((result) => {
                if (!mountedRef.current) return;

                if (result.success && result.data) {
                    const credential = result.data;

                    setCredentials((current) => ({ ...current, [env]: credential }));
                    setOtp("");
                    pushNotice({ kind: "success", message: tRef.current.csidSuccess });
                    return;
                }

                const message = result.error ?? tRef.current.csidFailed;

                setOtpError(message);
                if (!result.code || !KEEP_OTP_CODES.has(result.code)) setOtp("");
                pushNotice({ kind: "error", message });
            })
            .catch(() => {
                if (!mountedRef.current) return;

                setOtpError(tRef.current.csidFailed);
                setOtp("");
                pushNotice({ kind: "error", message: tRef.current.csidFailed });
            })
            .finally(() => {
                certifyingRef.current = null;

                if (mountedRef.current) setCertifyingEnv(null);
            });
    }, [otp, pushNotice]);

    /* ------------------------------ details ------------------------------ */

    const openDetails = useCallback((row: ZatcaTransmissionRow) => {
        setDetailRow(row);
        setDetailOpen(true);
    }, []);

    const closeDetails = useCallback(() => setDetailOpen(false), []);
    const closeConfirm = useCallback(() => setConfirmOpen(false), []);

    /* ------------------------------ derived ------------------------------ */

    const credential = credentials[environment];
    const certState: CertState = !credential
        ? "none"
        : Date.parse(credential.expiresAt) > Date.now()
            ? "active"
            : "expired";
    const isCertifying = certifyingEnv === environment;

    const connectionState: "loading" | "connected" | "expired" | "none" = booting
        ? "loading"
        : certState === "active"
            ? "connected"
            : certState === "expired"
                ? "expired"
                : "none";

    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        setNow(Date.now());
    }, []);

    const displayRows = useMemo(() => {
        if (!now) return [];
        const cutoff = now - RANGE_MS[range];

        return rowsByEnv[environment].filter((row) => Date.parse(row.submittedAt) >= cutoff);
    }, [rowsByEnv, environment, range, now]);

    const covered = isCovered(logMeta, environment, range);
    const showSkeleton = booting || (!covered && displayRows.length === 0 && !logError);
    const showError = !booting && !covered && displayRows.length === 0 && Boolean(logError);
    const showEmpty = !showSkeleton && !showError && displayRows.length === 0;
    const isFiltered = range !== DEFAULT_RANGE;

    const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = displayRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const showingFrom = displayRows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, displayRows.length);
    const anyTruncated = RANGE_ORDER.some((candidate, index) => {
        return (
            index >= RANGE_ORDER.indexOf(range) &&
            Boolean(logMeta[`${environment}:${candidate}`]?.truncated)
        );
    });

    const certFade = useFadeIn(environment);
    const logFade = useFadeIn(`${environment}:${range}`);

    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    const rangeOptions = useMemo(
        () => RANGE_ORDER.map((value) => ({ value, label: t.ranges[value] })),
        [t],
    );

    const columns = [
        { key: "invoice", label: t.colInvoice, width: "30%" },
        { key: "type", label: t.colType, width: "20%" },
        { key: "submitted", label: t.colSubmitted, width: "20%" },
        { key: "response", label: t.colResponse, width: "16%" },
        { key: "details", label: t.colDetails, width: "14%" },
    ];

    const profileFields: Array<{ label: string; value: string }> = [
        { label: t.tax, value: profile.taxRegistrationNumber },
        { label: t.legal, value: profile.legalEntityName },
        { label: t.street, value: profile.streetName },
        { label: t.district, value: profile.district },
        { label: t.city, value: profile.city },
        { label: t.postal, value: profile.postalCode },
    ];

    const otpParts = otpError ? splitError(otpError, locale) : null;
    const otpDetails = otpParts?.details ?? "";

    const generateDisabled =
        isCertifying || booting || otp.length !== OTP_LENGTH || !profile.complete;

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref={ZATCA_HREF}
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <main className="min-w-0 flex-1">
                    <AdminHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        {/* ----------------------------- header ----------------------------- */}
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                            <div className="min-w-0">
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <span>/</span>
                                    <span className="font-medium text-teal-700 dark:text-teal-400">{t.title}</span>
                                </div>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
                                    {t.subtitle}
                                </p>
                            </div>

                            <ConnectionBadge state={connectionState} t={t} />
                        </header>

                        {bootError ? (
                            <div
                                role="alert"
                                className="flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <span className="flex items-center gap-2">
                                    <CircleAlert className="h-5 w-5 shrink-0" />
                                    {localizeError(bootError, locale)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void boot()}
                                    className={`${outlineButton} h-10`}
                                >
                                    {t.retry}
                                </button>
                            </div>
                        ) : null}

                        {/* ------------------------------ cards ------------------------------ */}
                        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Environment & Tax Profile */}
                            <article className={cardClass}>
                                <div className="flex items-start gap-4">
                                    <Building2 className="mt-0.5 h-8 w-8 shrink-0 text-teal-600 dark:text-teal-400" />
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            {t.envTitle}
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                            {t.envSubtitle}
                                        </p>
                                    </div>
                                </div>

                                {/* sliding segmented toggle (kept LTR so the thumb math is identical in RTL) */}
                                <div
                                    dir="ltr"
                                    role="radiogroup"
                                    aria-label={t.envLabel}
                                    className="relative mt-5 grid h-[52px] grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-950/60"
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`absolute inset-y-1 start-1 w-[calc(50%-4px)] rounded-md bg-teal-600 shadow-md shadow-teal-900/30 transition-transform duration-200 ease-out ${environment === "PRODUCTION" ? "translate-x-full" : "translate-x-0"
                                            }`}
                                    />
                                    {(
                                        [
                                            { value: "SIMULATION", label: t.sandbox },
                                            { value: "PRODUCTION", label: t.production },
                                        ] as Array<{ value: Env; label: string }>
                                    ).map((option) => {
                                        const selected = environment === option.value;

                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={selected}
                                                disabled={booting}
                                                onClick={() => selectEnvironment(option.value)}
                                                className={`relative z-10 rounded-md text-base font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:cursor-not-allowed ${selected
                                                    ? "text-white"
                                                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {profileFields.map((field) => (
                                        <LockedField
                                            key={field.label}
                                            label={field.label}
                                            value={field.value}
                                            loading={booting}
                                            hint={t.lockedHint}
                                            isRtl={isRtl}
                                        />
                                    ))}
                                </div>

                                {!booting && !profile.complete && !bootError ? (
                                    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 text-amber-800 dark:text-amber-200">
                                            <p className="font-semibold">{t.profileIncomplete}</p>
                                            <p className="mt-1">
                                                {profile.missing
                                                    .map((field) => t.fieldLabels[field])
                                                    .join(isRtl ? "، " : ", ")}
                                            </p>
                                        </div>
                                        <Link
                                            href={SETTINGS_HREF}
                                            className={`${outlineButton} h-10 shrink-0`}
                                        >
                                            {t.openSettings}
                                        </Link>
                                    </div>
                                ) : null}
                            </article>

                            {/* Cryptographic Credentials */}
                            <article className={cardClass}>
                                <div className="flex items-start gap-4">
                                    <ShieldCheck className="mt-0.5 h-8 w-8 shrink-0 text-teal-600 dark:text-teal-400" />
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            {t.credTitle}
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                            {t.credSubtitle}
                                        </p>
                                    </div>
                                </div>

                                <p className="mt-5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {t.otpLabel}
                                </p>

                                <div className="mt-2">
                                    <OtpInput
                                        value={otp}
                                        onChange={handleOtpChange}
                                        onSubmit={handleGenerate}
                                        disabled={isCertifying || booting}
                                        invalid={Boolean(otpError)}
                                        t={t}
                                    />
                                </div>

                                <p
                                    className={`mt-3 min-h-[20px] text-sm transition-colors duration-150 ${otpError
                                        ? "font-medium text-rose-600 dark:text-rose-400"
                                        : "text-slate-600 dark:text-slate-400"
                                        }`}
                                    role={otpError ? "alert" : undefined}
                                >
                                    {otpParts ? otpParts.text : t.otpHelp}
                                </p>
                                {otpDetails ? (
                                    <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                                        <summary className="cursor-pointer select-none font-semibold">
                                            {t.technicalDetails}
                                        </summary>
                                        <pre
                                            dir="ltr"
                                            className="mt-2 whitespace-pre-wrap break-all text-start font-mono"
                                        >
                                            {otpDetails}
                                        </pre>
                                        <button
                                            type="button"
                                            onClick={() => void copyText(otpDetails)}
                                            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-teal-600 hover:underline dark:text-teal-400"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            {t.copyDetails}
                                        </button>
                                    </details>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={generateDisabled}
                                    className={`${tealButton} mt-4 h-14 w-full text-lg`}
                                >
                                    <ShieldCheck className="h-6 w-6" />
                                    {isCertifying ? t.certifyingButton : t.generate}
                                </button>

                                <div
                                    className={`mt-4 transition-all duration-200 ease-out ${certFade ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                                        }`}
                                >
                                    <CertificateCard
                                        t={t}
                                        locale={locale}
                                        loading={booting}
                                        state={certState}
                                        certifying={isCertifying}
                                        credential={credential}
                                    />
                                </div>
                            </article>
                        </section>

                        {/* ------------------------ transmission log ------------------------ */}
                        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                                <div className="flex min-w-0 items-start gap-4">
                                    <Table2 className="mt-0.5 h-8 w-8 shrink-0 text-teal-600 dark:text-teal-400" />
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            {t.logTitle}
                                        </h2>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                            {t.logSubtitle}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div
                                        aria-hidden={!isFiltered}
                                        className={`overflow-hidden transition-all duration-200 ease-out ${isFiltered
                                            ? "max-w-[220px] scale-100 opacity-100"
                                            : "pointer-events-none max-w-0 scale-95 opacity-0"
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={resetFilters}
                                            disabled={!isFiltered}
                                            tabIndex={isFiltered ? 0 : -1}
                                            className={`${outlineButton} h-11 whitespace-nowrap`}
                                        >
                                            <X className="h-4 w-4" />
                                            {t.resetFilters}
                                        </button>
                                    </div>

                                    <Dropdown<ZatcaRange>
                                        value={range}
                                        options={rangeOptions}
                                        onChange={changeRange}
                                        ariaLabel={t.periodLabel}
                                    />
                                </div>
                            </div>

                            {/* thin refresh indicator (fixed height → no layout shift) */}
                            <div className="h-0.5 overflow-hidden bg-transparent" aria-hidden="true">
                                <div
                                    className={`h-full w-1/3 animate-pulse bg-teal-500 transition-opacity duration-200 ${logFetching && !showSkeleton ? "opacity-100" : "opacity-0"
                                        }`}
                                />
                            </div>

                            <div className="overflow-x-auto rounded-b-2xl">
                                <table className="w-full min-w-[880px] table-fixed border-collapse text-start">
                                    <colgroup>
                                        {columns.map((column) => (
                                            <col key={column.key} style={{ width: column.width }} />
                                        ))}
                                    </colgroup>

                                    <thead>
                                        <tr className="border-y border-slate-200 dark:border-slate-800">
                                            {columns.map((column) => (
                                                <th
                                                    key={column.key}
                                                    scope="col"
                                                    className="px-6 py-4 text-start text-sm font-semibold text-slate-600 dark:text-slate-300"
                                                >
                                                    {column.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody
                                        className={`divide-y divide-slate-200 transition-opacity duration-150 ease-out dark:divide-slate-800 ${logFade ? "opacity-100" : "opacity-0"
                                            }`}
                                    >
                                        {showSkeleton ? <SkeletonRows count={SKELETON_ROWS} /> : null}

                                        {showError ? (
                                            <tr>
                                                <td colSpan={columns.length} className="px-6 py-14 text-center">
                                                    <CircleAlert className="mx-auto h-8 w-8 text-rose-500" />
                                                    <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                        {localizeError(logError, locale)}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void loadLog(environment, range, { force: true })
                                                        }
                                                        className={`${outlineButton} mt-4 h-10`}
                                                    >
                                                        {t.retry}
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : null}

                                        {showEmpty ? (
                                            <tr>
                                                <td colSpan={columns.length} className="px-6 py-14 text-center">
                                                    <Table2 className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600" />
                                                    <p className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100">
                                                        {isFiltered ? t.emptyFiltered : t.empty}
                                                    </p>
                                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                                        {t.emptyHint}
                                                    </p>
                                                    {isFiltered ? (
                                                        <button
                                                            type="button"
                                                            onClick={resetFilters}
                                                            className={`${outlineButton} mt-4 h-10`}
                                                        >
                                                            <X className="h-4 w-4" />
                                                            {t.resetFilters}
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ) : null}

                                        {!showSkeleton && !showError
                                            ? pageRows.map((row) => {
                                                const rejected = row.status === "REJECTED";

                                                return (
                                                    <tr
                                                        key={row.id}
                                                        className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                                    >
                                                        <td className="px-6 py-4 align-middle">
                                                            <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                                                                {row.invoiceRef}
                                                            </p>
                                                            <p
                                                                dir="ltr"
                                                                title={row.invoiceUuid}
                                                                className="mt-1 truncate text-start text-sm text-slate-500 dark:text-slate-400"
                                                            >
                                                                {row.invoiceUuid}
                                                            </p>
                                                        </td>

                                                        <td
                                                            className="px-6 py-4 align-middle text-sm text-slate-700 dark:text-slate-200"
                                                            title={row.payerName ?? undefined}
                                                        >
                                                            {typeLabel(row, t)}
                                                        </td>

                                                        <td className="px-6 py-4 align-middle text-sm text-slate-700 dark:text-slate-200">
                                                            {formatDateTime(row.submittedAt, locale)}
                                                        </td>

                                                        <td className="px-6 py-4 align-middle">
                                                            <StatusBadge status={row.status} t={t} />
                                                        </td>

                                                        <td className="px-6 py-4 align-middle">
                                                            <div className="flex items-center justify-between gap-3">
                                                                {rejected ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openDetails(row)}
                                                                        className="inline-flex h-10 items-center rounded-lg border border-rose-500 px-4 text-sm font-semibold text-rose-600 transition-colors duration-150 hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-500/40 dark:text-rose-300"
                                                                    >
                                                                        {t.viewError}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openDetails(row)}
                                                                        aria-label={t.viewDetails}
                                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-teal-600 transition-colors duration-150 hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:text-teal-400"
                                                                    >
                                                                        <Eye className="h-5 w-5" />
                                                                    </button>
                                                                )}

                                                                <RowMenu
                                                                    row={row}
                                                                    t={t}
                                                                    isRtl={isRtl}
                                                                    onDetails={openDetails}
                                                                    onCopy={(value) => void copyText(value)}
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                            : null}
                                    </tbody>
                                </table>
                            </div>

                            {!showSkeleton && !showError && (displayRows.length > PAGE_SIZE || anyTruncated) ? (
                                <footer className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1">
                                        <p>{t.showing(showingFrom, showingTo, displayRows.length)}</p>
                                        {anyTruncated ? (
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {t.truncated(displayRows.length)}
                                            </p>
                                        ) : null}
                                    </div>

                                    {displayRows.length > PAGE_SIZE ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={currentPage <= 1}
                                                onClick={() => setPage(currentPage - 1)}
                                                className={`${outlineButton} h-10`}
                                            >
                                                <PrevIcon className="h-4 w-4" />
                                                {t.previous}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={currentPage >= totalPages}
                                                onClick={() => setPage(currentPage + 1)}
                                                className={`${outlineButton} h-10`}
                                            >
                                                {t.next}
                                                <NextIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : null}
                                </footer>
                            ) : null}
                        </section>
                    </div>
                </main>
            </div>

            {/* ------------------------------ details modal ------------------------------ */}
            <Modal open={detailOpen} onClose={closeDetails} labelledBy="zatca-details-title">
                {detailRow ? (
                    <TransmissionDetails
                        row={detailRow}
                        t={t}
                        locale={locale}
                        onClose={closeDetails}
                        onCopy={(value) => void copyText(value)}
                    />
                ) : null}
            </Modal>

            {/* ------------------------ production confirmation modal ------------------------ */}
            <Modal
                open={confirmOpen}
                onClose={closeConfirm}
                labelledBy="zatca-confirm-title"
                widthClass="max-w-md"
            >
                <h2 id="zatca-confirm-title" className="text-xl font-bold text-slate-900 dark:text-white">
                    {t.confirmTitle}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {t.confirmBody}
                </p>
                <footer className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={closeConfirm} className={`${outlineButton} h-11`}>
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            closeConfirm();
                            applyEnvironment("PRODUCTION");
                        }}
                        className={`${tealButton} h-11`}
                    >
                        {t.confirmSwitch}
                    </button>
                </footer>
            </Modal>

            {/* --------------------------------- toasts --------------------------------- */}
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed bottom-6 end-6 z-[200] flex flex-col items-end gap-3"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/50 dark:bg-slate-900 ${toast.kind === "success" ? "border-teal-600/40" : "border-rose-500/40"
                            }`}
                    >
                        {toast.kind === "success" ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                        ) : (
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                        )}

                        <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">
                            {localizeError(toast.message, locale)}
                        </p>

                        <button
                            type="button"
                            onClick={() => dismissNotice(toast.id)}
                            aria-label={t.close}
                            className="rounded-md p-1 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}