"use client";

/**
 * Policies & Tiers — /admin/insurance/policies/page.tsx
 *
 * Performance notes
 * -----------------
 * - Every mutation (create, duplicate-save, edit, toggle status, delete) changes the UI in the same
 *   frame and syncs with the server in the background. A failure restores the previous state and
 *   shows an error toast.
 * - New rows get their final UUID on the client (the server accepts it), so follow-up actions on a
 *   row that has not reached the server yet are queued in order instead of being blocked.
 * - Server calls touching the same row run strictly in order (per-row queue).
 * - Filtering and pagination are local (the table owns its data) so Reset Filters is instant.
 * - Modals fade/scale in with transition-all duration-200 ease-out; backdrop fades separately.
 *
 * Duplicate workflow
 * ------------------
 * "Duplicate" opens the policy modal pre-filled from the source policy, with:
 *   1. the name suffixed with "(Copy)" / "(نسخة)",
 *   2. an EMPTY policy number highlighted in red (required) — saving is blocked until the admin
 *      enters a new contract number,
 *   3. a per-payer uniqueness check (payer + policy number) both live in the modal and on the server.
 *
 * Note: the modal adds an optional "Contract Expiry" date field next to the policy number because the
 * table's "Contract Expiry" column needs a source of truth for NPHIES contract validity.
 */

import {
    useCallback,
    useDeferredValue,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Copy,
    MoreHorizontal,
    Pencil,
    Plus,
    Power,
    RotateCcw,
    Search,
    ShieldCheck,
    Trash2,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createPolicyAction,
    deletePolicyAction,
    getPoliciesAction,
    setPolicyActiveStatusAction,
    updatePolicyAction,
    type PolicyActionResult,
    type PolicyCopayTypeValue,
    type PolicyInput,
    type PolicyProviderOption,
    type PolicyRow,
} from "./actions";

/* ------------------------------------------------------------------ */
/* constants & types                                                   */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 4;
const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const ANIM_MS = 200;
const REFRESH_AFTER_MS = 60_000;


type PoliciesTiersProps = {
    initialLocale: Locale;
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

type ModalState =
    | { mode: "create" }
    | { mode: "edit"; policy: PolicyRow }
    | { mode: "duplicate"; policy: PolicyRow }
    | null;

type Notice = { kind: "success" | "error"; message: string };
type ToastItem = Notice & { id: number };

type DropdownOption = {
    value: string;
    label: string;
    avatar?: { name: string; logoUrl: string | null };
};

type FormErrors = Partial<
    Record<
        "providerId" | "nameEn" | "policyNumber" | "copayValue" | "maxPatientShare" | "expiryDate",
        string
    >
>;

const en = {
    title: "Policies & Tiers",
    breadcrumbRoot: "Policies & Tiers",
    breadcrumbCurrent: "Insurance Policies",
    subtitle: "Manage insurance plans, patient co-payments, and NPHIES-ready contract details.",
    add: "Create New Policy",
    search: "Search by plan name or policy number",
    allPayers: "All Payers",
    allStatuses: "All Statuses",
    active: "Active",
    inactive: "Inactive",
    resetFilters: "Reset Filters",
    colPlan: "Plan / Tier",
    colNumber: "Policy Number",
    colCopay: "Patient Co-pay",
    colExpiry: "Contract Expiry",
    colStatus: "Status",
    colActions: "Actions",
    showing: (from: number, to: number, total: number) =>
        `Showing ${from}–${to} of ${total} policies`,
    empty: "No policies match your filters.",
    emptyAll: "No insurance policies yet. Create your first policy.",
    fixed: "Fixed",
    max: "max",
    sar: "SAR",
    noExpiry: "—",
    loading: "Loading policies",
    retry: "Try again",
    loadFailed: "Unable to load policies. Please refresh the page and try again.",
    modalCreate: "Create New Insurance Policy",
    modalEdit: "Edit Insurance Policy",
    modalDuplicate: "Duplicate Insurance Policy",
    modalDesc: "Connect an insurance plan to a payer and define patient cost sharing.",
    modalDuplicateDesc:
        "Review the copied details and enter a new, unique contract number before saving.",
    copySuffix: " (Copy)",
    payer: "Insurance Payer",
    payerPlaceholder: "Select a payer",
    noPayers: "No payers available",
    planName: "Plan / Tier Name",
    planPlaceholder: "e.g. Class A VIP",
    policyNumber: "Official Policy / Contract Number",
    policyPlaceholder: "e.g. POL-BUPA-2026-001",
    nphiesHelp: "Required for integration with the NPHIES platform.",
    expiry: "Contract Expiry",
    optional: "Optional",
    financial: "Financial Configuration",
    percentage: "Percentage %",
    fixedAmount: "Fixed Amount SAR",
    copayValue: "Co-pay Value",
    maxShare: "Maximum Patient Share",
    activateNow: "Activate policy immediately",
    activateHelp: "Policy will be available for use in patient registration and claims.",
    cancel: "Cancel",
    save: "Save Policy",
    saveChanges: "Save Changes",
    errProvider: "Select an insurance payer.",
    errName: "Enter a plan / tier name (2–120 characters).",
    errPolicyNumber: "Use 3–60 characters: letters, digits, . _ / -",
    errPolicyNumberRequired: "The policy / contract number is required.",
    errDuplicateNumberRequired:
        "Required: enter a new, unique contract number for this copy.",
    errPolicyDuplicate: "This policy number is already registered for this payer. Please change it.",
    errCopay: "Enter a valid co-pay value.",
    errPercent: "Percentage must be between 0 and 100.",
    errMax: "Enter a valid SAR amount greater than 0.",
    errExpiry: "Enter a valid expiry date.",
    errExpiredActive: "This contract has expired. Extend the expiry date or turn off activation.",
    menuEdit: "Edit policy",
    menuDuplicate: "Duplicate",
    menuActivate: "Activate",
    menuDeactivate: "Deactivate",
    menuDelete: "Delete",
    toggleHintOff: "Click to deactivate",
    toggleHintOn: "Click to activate",
    deleteTitle: "Delete this policy?",
    deleteBody: (name: string) =>
        `“${name}” will be permanently removed. Policies assigned to patients cannot be deleted.`,
    deleteConfirm: "Delete policy",
    created: "Policy created.",
    updated: "Policy updated.",
    activated: "Policy activated.",
    deactivated: "Policy deactivated.",
    deleted: "Policy deleted.",
    failed: "The operation failed and was reverted.",
    expiredCannotActivate: "This contract has expired. Edit the policy and extend its expiry first.",
    close: "Close",
    rowActions: "Row actions",
    page: "Page",
    previous: "Previous page",
    next: "Next page",
};

type Messages = typeof en;

const ar: Messages = {
    title: "الوثائق والفئات",
    breadcrumbRoot: "الوثائق والفئات",
    breadcrumbCurrent: "وثائق التأمين",
    subtitle: "إدارة خطط التأمين ومشاركة المريض في التكلفة وتفاصيل العقود الجاهزة للربط مع نفيس.",
    add: "إنشاء وثيقة جديدة",
    search: "ابحث باسم الخطة أو رقم الوثيقة",
    allPayers: "جميع شركات التأمين",
    allStatuses: "جميع الحالات",
    active: "نشطة",
    inactive: "غير نشطة",
    resetFilters: "إعادة ضبط التصفية",
    colPlan: "الخطة / الفئة",
    colNumber: "رقم الوثيقة",
    colCopay: "مشاركة المريض",
    colExpiry: "انتهاء العقد",
    colStatus: "الحالة",
    colActions: "الإجراءات",
    showing: (from: number, to: number, total: number) =>
        `عرض ${from}–${to} من ${total} وثيقة`,
    empty: "لا توجد وثائق مطابقة للتصفية.",
    emptyAll: "لا توجد وثائق تأمين بعد. أنشئ أول وثيقة.",
    fixed: "ثابت",
    max: "حد أقصى",
    sar: "ر.س",
    noExpiry: "—",
    loading: "جارٍ تحميل الوثائق",
    retry: "إعادة المحاولة",
    loadFailed: "تعذّر تحميل الوثائق. حدّث الصفحة وحاول مرة أخرى.",
    modalCreate: "إنشاء وثيقة تأمين جديدة",
    modalEdit: "تعديل وثيقة التأمين",
    modalDuplicate: "نسخ وثيقة التأمين",
    modalDesc: "اربط خطة تأمين بشركة تأمين وحدّد مشاركة المريض في التكلفة.",
    modalDuplicateDesc: "راجع البيانات المنسوخة وأدخل رقم عقد جديدًا وفريدًا قبل الحفظ.",
    copySuffix: " (نسخة)",
    payer: "شركة التأمين",
    payerPlaceholder: "اختر شركة التأمين",
    noPayers: "لا توجد شركات تأمين",
    planName: "اسم الخطة / الفئة",
    planPlaceholder: "مثال: Class A VIP",
    policyNumber: "رقم الوثيقة / العقد الرسمي",
    policyPlaceholder: "مثال: POL-BUPA-2026-001",
    nphiesHelp: "مطلوب للتكامل مع منصة نفيس.",
    expiry: "انتهاء العقد",
    optional: "اختياري",
    financial: "الإعدادات المالية",
    percentage: "نسبة مئوية %",
    fixedAmount: "مبلغ ثابت ر.س",
    copayValue: "قيمة المشاركة",
    maxShare: "الحد الأقصى لحصة المريض",
    activateNow: "تفعيل الوثيقة فورًا",
    activateHelp: "ستكون الوثيقة متاحة للاستخدام في تسجيل المرضى والمطالبات.",
    cancel: "إلغاء",
    save: "حفظ الوثيقة",
    saveChanges: "حفظ التغييرات",
    errProvider: "اختر شركة التأمين.",
    errName: "أدخل اسم الخطة / الفئة (من 2 إلى 120 حرفًا).",
    errPolicyNumber: "استخدم من 3 إلى 60 حرفًا: أحرف وأرقام و . _ / -",
    errPolicyNumberRequired: "رقم الوثيقة / العقد مطلوب.",
    errDuplicateNumberRequired: "مطلوب: أدخل رقم عقد جديدًا وفريدًا لهذه النسخة.",
    errPolicyDuplicate: "رقم السياسة هذا مسجل مسبقاً لهذه الشركة، يرجى التعديل.",
    errCopay: "أدخل قيمة مشاركة صحيحة.",
    errPercent: "يجب أن تكون النسبة بين 0 و 100.",
    errMax: "أدخل مبلغًا صحيحًا بالريال أكبر من 0.",
    errExpiry: "أدخل تاريخ انتهاء صحيحًا.",
    errExpiredActive: "انتهى هذا العقد. مدّد تاريخ الانتهاء أو أوقف التفعيل.",
    menuEdit: "تعديل الوثيقة",
    menuDuplicate: "نسخ",
    menuActivate: "تفعيل",
    menuDeactivate: "إيقاف",
    menuDelete: "حذف",
    toggleHintOff: "اضغط للإيقاف",
    toggleHintOn: "اضغط للتفعيل",
    deleteTitle: "حذف هذه الوثيقة؟",
    deleteBody: (name: string) =>
        `سيتم حذف «${name}» نهائيًا. لا يمكن حذف الوثائق المرتبطة بمرضى.`,
    deleteConfirm: "حذف الوثيقة",
    created: "تم إنشاء الوثيقة.",
    updated: "تم تحديث الوثيقة.",
    activated: "تم تفعيل الوثيقة.",
    deactivated: "تم إيقاف الوثيقة.",
    deleted: "تم حذف الوثيقة.",
    failed: "فشلت العملية وتمت إعادة الحالة السابقة.",
    expiredCannotActivate: "انتهى هذا العقد. عدّل الوثيقة ومدّد تاريخ الانتهاء أولًا.",
    close: "إغلاق",
    rowActions: "إجراءات الصف",
    page: "صفحة",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
};

const messages: Record<Locale, Messages> = { en, ar } as Record<Locale, Messages>;

const baseInput =
    "h-12 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-150 hover:border-teal-500 hover:text-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------------------------------------------ */
/* pure helpers                                                        */
/* ------------------------------------------------------------------ */

function newId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);

    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function todayInRiyadh(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function isExpired(expiry: string | null): boolean {
    return expiry !== null && expiry < todayInRiyadh();
}

function formatDate(iso: string | null, locale: Locale, fallback: string): string {
    if (!iso) return fallback;

    const date = new Date(`${iso}T00:00:00Z`);

    if (Number.isNaN(date.getTime())) return fallback;

    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: "UTC",
    }).format(date);
}

function formatNumber(value: string): string {
    if (!value.includes(".")) return value;

    return value.replace(/0+$/, "").replace(/\.$/, "");
}

function copayLabel(policy: PolicyRow, t: Messages): string {
    const value = formatNumber(policy.copayValue);

    if (policy.copayType === "FIXED_AMOUNT") {
        return `${t.fixed} ${t.sar} ${value}`;
    }

    return policy.maxPatientShare
        ? `${value}% — ${t.max} ${t.sar} ${formatNumber(policy.maxPatientShare)}`
        : `${value}%`;
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function sanitizeDecimal(value: string): string {
    const cleaned = value.replace(/[^\d.]/g, "");
    const [integer = "", ...rest] = cleaned.split(".");

    if (rest.length === 0) return integer.slice(0, 10);

    return `${integer.slice(0, 10)}.${rest.join("").slice(0, 2)}`;
}

/** Unique-per-payer key used for the live duplicate check. */
function numberKey(providerId: string, policyNumber: string): string {
    return `${providerId}|${policyNumber.trim().toUpperCase()}`;
}

/** Localised message for a failed server result (known codes are translated). */
function serverMessage(result: PolicyActionResult<unknown>, t: Messages): string {
    if (result.code === "DUPLICATE_POLICY_NUMBER") return t.errPolicyDuplicate;
    if (result.code === "POLICY_EXPIRED") return t.expiredCannotActivate;

    return result.error ?? t.failed;
}

function buildRow(
    id: string,
    input: PolicyInput,
    provider: PolicyProviderOption,
    previous?: PolicyRow,
): PolicyRow {
    const isPercentage = input.copayType === "PERCENTAGE";
    const maxText = String(input.maxPatientShare ?? "").trim();

    return {
        id,
        clinicId: provider.clinicId,
        providerId: provider.id,
        providerNameEn: provider.nameEn,
        providerNameAr: provider.nameAr,
        providerLogoUrl: provider.logoUrl,
        nameEn: input.nameEn.trim().replace(/\s+/g, " "),
        nameAr: input.nameAr === undefined ? (previous?.nameAr ?? null) : input.nameAr,
        policyNumber: input.policyNumber.trim().toUpperCase(),
        copayType: input.copayType,
        copayValue: formatNumber(String(input.copayValue)),
        maxPatientShare: isPercentage && maxText ? formatNumber(maxText) : null,
        expiryDate: input.expiryDate ? input.expiryDate : null,
        isActive: input.isActive,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
    };
}

/* ------------------------------------------------------------------ */
/* modal transition hook                                               */
/* ------------------------------------------------------------------ */

function useModalTransition(onClosed: () => void) {
    const [entered, setEntered] = useState(false);
    const closingRef = useRef(false);
    const closeTimerRef = useRef<number | null>(null);
    const onClosedRef = useRef(onClosed);

    useEffect(() => {
        onClosedRef.current = onClosed;
    }, [onClosed]);

    useEffect(() => {
        const timer = window.setTimeout(() => setEntered(true), 16);

        return () => window.clearTimeout(timer);
    }, []);

    useEffect(
        () => () => {
            if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        const previous = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    const requestClose = useCallback(() => {
        if (closingRef.current) return;

        closingRef.current = true;
        setEntered(false);
        closeTimerRef.current = window.setTimeout(() => onClosedRef.current(), ANIM_MS);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [requestClose]);

    return { entered, requestClose };
}

/* ------------------------------------------------------------------ */
/* small presentational components                                     */
/* ------------------------------------------------------------------ */

function PayerAvatar({
    name,
    logoUrl,
    size = "md",
}: {
    name: string;
    logoUrl: string | null;
    size?: "sm" | "md";
}) {
    const [failed, setFailed] = useState(false);
    const dimension = size === "sm" ? "h-7 w-7 text-[10px]" : "h-12 w-12 text-sm";

    if (logoUrl && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={logoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
                className={`${dimension} shrink-0 rounded-full bg-white object-cover`}
            />
        );
    }

    return (
        <span
            aria-hidden="true"
            className={`${dimension} grid shrink-0 place-items-center rounded-full bg-slate-200 font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100`}
        >
            {initialsOf(name)}
        </span>
    );
}

function StatusBadge({
    active,
    t,
    onToggle,
}: {
    active: boolean;
    t: Messages;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            title={active ? t.toggleHintOff : t.toggleHintOn}
            aria-label={`${active ? t.active : t.inactive} — ${active ? t.toggleHintOff : t.toggleHintOn}`}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 ${active
                ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 dark:text-emerald-400"
                : "bg-slate-200/70 text-slate-600 hover:bg-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:hover:bg-slate-500/20"
                }`}
        >
            <span
                className={`h-2.5 w-2.5 rounded-full transition-colors duration-150 ${active ? "bg-emerald-400" : "bg-slate-400"
                    }`}
            />
            {active ? t.active : t.inactive}
        </button>
    );
}

function Field({
    id,
    label,
    error,
    required = false,
    hint,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    required?: boolean;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
                {label}
                {required && (
                    <span className={`ms-1 ${error ? "text-rose-400" : "text-teal-500"}`}>*</span>
                )}
                {hint && (
                    <span className="ms-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                        {hint}
                    </span>
                )}
            </label>
            {children}
            {error && (
                <span role="alert" className="mt-1 block text-xs font-medium text-rose-400">
                    {error}
                </span>
            )}
        </div>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: PAGE_SIZE }, (_, row) => (
                <tr key={row} className="animate-pulse">
                    <td className="px-6 py-5 align-middle">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-2">
                                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                                <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-5 align-middle">
                        <div className="h-10 w-40 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-5 align-middle">
                        <div className="h-10 w-40 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-5 align-middle">
                        <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-5 align-middle">
                        <div className="h-10 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-5 align-middle">
                        <div className="mx-auto h-11 w-11 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                </tr>
            ))}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* dropdown                                                            */
/* ------------------------------------------------------------------ */

function Dropdown({
    id,
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    invalid = false,
    ariaLabel,
    icon: Icon,
    isRtl,
    className = "",
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    placeholder: string;
    disabled?: boolean;
    invalid?: boolean;
    ariaLabel?: string;
    icon: typeof Building2;
    isRtl: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
        null,
    );
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const selectedIndex = options.findIndex((option) => option.value === value);
    const selected = selectedIndex >= 0 ? (options[selectedIndex] ?? null) : null;

    const reposition = useCallback(() => {
        const button = buttonRef.current;
        const menu = menuRef.current;

        if (!button || !menu) return;

        const rect = button.getBoundingClientRect();
        const height = menu.offsetHeight;
        const margin = 8;
        const gap = 6;
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const placeAbove = height + gap > spaceBelow && spaceAbove > spaceBelow;

        let top = placeAbove ? rect.top - height - gap : rect.bottom + gap;

        top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));

        setPosition({ top, left: rect.left, width: rect.width });
    }, []);

    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

            setOpen(false);
        };

        const onScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            reposition();
        };

        const onResize = () => reposition();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onScroll, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        menuRef.current
            ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    function openMenu() {
        if (disabled) return;
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1);
        setOpen(true);
    }

    function choose(index: number) {
        const option = options[index];

        if (!option) return;

        onChange(option.value);
        setOpen(false);
        buttonRef.current?.focus();
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (disabled) return;

        const lastIndex = options.length - 1;

        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();

                if (!open) {
                    openMenu();
                    return;
                }

                const goDown = event.key === "ArrowDown";

                setActiveIndex((current) => {
                    if (lastIndex < 0) return -1;
                    const next = goDown ? current + 1 : current - 1;
                    return Math.min(Math.max(next, 0), lastIndex);
                });
                return;
            }
            case "Home":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(lastIndex < 0 ? -1 : 0);
                }
                return;
            case "End":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(lastIndex);
                }
                return;
            case "Enter":
            case " ":
                event.preventDefault();

                if (!open) openMenu();
                else if (activeIndex >= 0) choose(activeIndex);
                else setOpen(false);
                return;
            case "Escape":
                if (open) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.nativeEvent.stopImmediatePropagation();
                    setOpen(false);
                }
                return;
            case "Tab":
                if (open) setOpen(false);
                return;
            default:
                return;
        }
    }

    return (
        <span className="relative block">
            {selected?.avatar ? (
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
                    <PayerAvatar
                        name={selected.avatar.name}
                        logoUrl={selected.avatar.logoUrl}
                        size="sm"
                    />
                </span>
            ) : (
                <Icon className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
            )}

            <button
                ref={buttonRef}
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openMenu())}
                onKeyDown={handleKeyDown}
                onKeyUp={(event) => {
                    if (event.key === " ") event.preventDefault();
                }}
                className={`${baseInput} flex cursor-pointer items-center text-start ps-12 pe-10 ${open ? "border-teal-500 ring-2 ring-teal-500/20" : ""
                    } ${invalid ? "border-rose-500" : ""} ${className}`}
            >
                <span
                    className={`block min-w-0 flex-1 truncate ${selected ? "" : "text-slate-500 dark:text-slate-400"
                        }`}
                >
                    {selected ? selected.label : placeholder}
                </span>
            </button>

            <ChevronDown
                className={`pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 transition-transform duration-150 dark:text-slate-300 ${open ? "rotate-180" : ""
                    }`}
            />

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel ?? placeholder}
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            width: position?.width ?? buttonRef.current?.offsetWidth,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[160] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-900 shadow-2xl shadow-black/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                        {options.length === 0 && (
                            <div className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                                {placeholder}
                            </div>
                        )}

                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            const isActive = index === activeIndex;

                            return (
                                <div
                                    key={option.value}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    data-index={index}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => choose(index)}
                                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-start font-medium transition-colors duration-150 ${isActive
                                        ? "bg-teal-600 text-white"
                                        : isSelected
                                            ? "text-teal-600 dark:text-teal-400"
                                            : "text-slate-900 dark:text-slate-100"
                                        }`}
                                >
                                    {option.avatar && (
                                        <PayerAvatar
                                            name={option.avatar.name}
                                            logoUrl={option.avatar.logoUrl}
                                            size="sm"
                                        />
                                    )}
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/* row actions menu                                                    */
/* ------------------------------------------------------------------ */

function RowActions({
    policy,
    t,
    isRtl,
    onEdit,
    onDuplicate,
    onToggleStatus,
    onDelete,
}: {
    policy: PolicyRow;
    t: Messages;
    isRtl: boolean;
    onEdit: () => void;
    onDuplicate: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const reposition = useCallback(() => {
        const button = buttonRef.current;
        const menu = menuRef.current;

        if (!button || !menu) return;

        const rect = button.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const margin = 8;
        const gap = 8;

        let left = isRtl ? rect.left : rect.right - width;

        left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        let top =
            height + gap <= spaceBelow || spaceBelow >= spaceAbove
                ? rect.bottom + gap
                : rect.top - height - gap;

        top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));

        setPosition({ top, left });
    }, [isRtl]);

    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

            setOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };

        const onViewportChange = () => reposition();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onViewportChange);
        window.addEventListener("scroll", onViewportChange, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", onViewportChange);
            window.removeEventListener("scroll", onViewportChange, true);
        };
    }, [open, reposition]);

    const choose = (handler: () => void) => {
        setOpen(false);
        handler();
    };

    const itemBase =
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start font-medium transition-colors duration-150 focus:outline-none";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={`grid h-11 w-11 place-items-center rounded-lg border text-slate-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-300 ${open
                    ? "border-teal-500 bg-teal-600/10 text-teal-400"
                    : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className={`z-[150] w-[240px] max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 shadow-2xl shadow-black/50 transition-opacity duration-150 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${position ? "opacity-100" : "opacity-0"
                            }`}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onEdit)}
                            className={`${itemBase} hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:hover:text-teal-400 dark:focus:text-teal-400`}
                        >
                            <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuEdit}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onDuplicate)}
                            className={`${itemBase} hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:hover:text-teal-400 dark:focus:text-teal-400`}
                        >
                            <Copy className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuDuplicate}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onToggleStatus)}
                            className={`${itemBase} ${policy.isActive
                                ? "text-amber-600 hover:bg-amber-500/10 focus:bg-amber-500/10 dark:text-amber-400"
                                : "text-teal-600 hover:bg-teal-600/10 focus:bg-teal-600/10 dark:text-teal-400"
                                }`}
                        >
                            <Power className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {policy.isActive ? t.menuDeactivate : t.menuActivate}
                        </button>

                        <div className="my-2 h-px bg-slate-200 dark:bg-slate-700/70" />

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onDelete)}
                            className={`${itemBase} text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10`}
                        >
                            <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuDelete}
                        </button>
                    </div>,
                    document.body,
                )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* create / edit / duplicate modal                                     */
/* ------------------------------------------------------------------ */

function PolicyModal({
    mode,
    policy,
    providers,
    existingNumbers,
    t,
    isRtl,
    onClosed,
    onSubmit,
}: {
    mode: "create" | "edit" | "duplicate";
    policy: PolicyRow | null;
    providers: PolicyProviderOption[];
    /** Map of `${providerId}|${POLICY_NUMBER}` → policy id (unique per payer). */
    existingNumbers: Map<string, string>;
    t: Messages;
    isRtl: boolean;
    onClosed: () => void;
    onSubmit: (input: PolicyInput) => void;
}) {
    const { entered, requestClose } = useModalTransition(onClosed);
    const baseId = useId();
    const isEdit = mode === "edit";
    const isDuplicate = mode === "duplicate";

    const [providerId, setProviderId] = useState(policy?.providerId ?? "");
    const [nameEn, setNameEn] = useState(
        policy ? (isDuplicate ? `${policy.nameEn.slice(0, 112)}${t.copySuffix}` : policy.nameEn) : "",
    );
    // A duplicate must never inherit the source's contract number.
    const [policyNumber, setPolicyNumber] = useState(isDuplicate ? "" : (policy?.policyNumber ?? ""));
    const [copayType, setCopayType] = useState<PolicyCopayTypeValue>(policy?.copayType ?? "PERCENTAGE");
    const [copayValue, setCopayValue] = useState(policy ? formatNumber(policy.copayValue) : "");
    const [maxShare, setMaxShare] = useState(policy?.maxPatientShare ? formatNumber(policy.maxPatientShare) : "");
    const [expiry, setExpiry] = useState(policy?.expiryDate ?? "");
    // Duplicates start inactive until the admin confirms the new contract.
    const [isActive, setIsActive] = useState(isDuplicate ? false : (policy?.isActive ?? true));
    const [errors, setErrors] = useState<FormErrors>({});

    const nameRef = useRef<HTMLInputElement>(null);
    const numberRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = window.setTimeout(
            () => (isDuplicate ? numberRef.current : nameRef.current)?.focus(),
            60,
        );

        return () => window.clearTimeout(timer);
    }, [isDuplicate]);

    const providerOptions = useMemo<DropdownOption[]>(
        () =>
            providers
                .filter((provider) => provider.isActive || provider.id === policy?.providerId)
                .map((provider) => ({
                    value: provider.id,
                    label: isRtl ? provider.nameAr || provider.nameEn : provider.nameEn,
                    avatar: { name: provider.nameEn, logoUrl: provider.logoUrl },
                })),
        [providers, policy?.providerId, isRtl],
    );

    const clearError = (key: keyof FormErrors) =>
        setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));

    const isPercentage = copayType === "PERCENTAGE";

    // Live checks for the policy number field.
    const trimmedNumber = policyNumber.trim();
    const owner =
        trimmedNumber && providerId ? existingNumbers.get(numberKey(providerId, trimmedNumber)) : undefined;
    const liveDuplicate = owner !== undefined && !(isEdit && owner === policy?.id);
    const duplicateRequired = isDuplicate && trimmedNumber === "";

    const numberError =
        errors.policyNumber ??
        (liveDuplicate
            ? t.errPolicyDuplicate
            : duplicateRequired
                ? t.errDuplicateNumberRequired
                : undefined);
    const numberInvalid = Boolean(numberError);

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const next: FormErrors = {};
        const number = policyNumber.trim().toUpperCase();
        const name = nameEn.trim().replace(/\s+/g, " ");
        const valueText = copayValue.trim();
        const maxText = maxShare.trim();

        if (!providerId || !providers.some((provider) => provider.id === providerId)) {
            next.providerId = t.errProvider;
        }

        if (name.length < 2 || name.length > 120 || /[<>]/.test(name)) next.nameEn = t.errName;

        if (!number) {
            next.policyNumber = isDuplicate ? t.errDuplicateNumberRequired : t.errPolicyNumberRequired;
        } else if (!/^[A-Z0-9][A-Z0-9._/-]{2,59}$/.test(number)) {
            next.policyNumber = t.errPolicyNumber;
        } else if (providerId) {
            const taken = existingNumbers.get(numberKey(providerId, number));

            if (taken !== undefined && !(isEdit && taken === policy?.id)) {
                next.policyNumber = t.errPolicyDuplicate;
            }
        }

        if (!/^\d{1,10}(\.\d{1,2})?$/.test(valueText)) {
            next.copayValue = t.errCopay;
        } else if (isPercentage && Number(valueText) > 100) {
            next.copayValue = t.errPercent;
        }

        if (isPercentage && maxText && (!/^\d{1,10}(\.\d{1,2})?$/.test(maxText) || Number(maxText) <= 0)) {
            next.maxPatientShare = t.errMax;
        }

        if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
            next.expiryDate = t.errExpiry;
        } else if (expiry && isActive && isExpired(expiry)) {
            next.expiryDate = t.errExpiredActive;
        }

        setErrors(next);

        if (Object.values(next).some(Boolean)) {
            if (next.policyNumber && !next.providerId && !next.nameEn) numberRef.current?.focus();
            return;
        }

        onSubmit({
            providerId,
            nameEn: name,
            nameAr: isDuplicate ? (policy?.nameAr ?? null) : (policy?.nameAr ?? undefined),
            policyNumber: number,
            copayType,
            copayValue: valueText,
            maxPatientShare: isPercentage && maxText ? maxText : null,
            expiryDate: expiry || null,
            isActive,
        });

        requestClose();
    }

    const suffixBox =
        "flex h-12 min-w-14 items-center justify-center border-s border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
    const groupBase =
        "flex h-12 w-full overflow-hidden rounded-lg border bg-white transition-colors duration-150 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:bg-slate-950/60";

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none dark:bg-slate-950/80 sm:p-6 ${entered ? "opacity-100" : "opacity-0"
                }`}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${baseId}-title`}
                dir={isRtl ? "rtl" : "ltr"}
                className={`my-auto w-full max-w-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/60 transition-all duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 ${entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
                    }`}
            >
                <form noValidate onSubmit={handleSubmit}>
                    <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
                        <div className="min-w-0">
                            <h2
                                id={`${baseId}-title`}
                                className="text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl"
                            >
                                {isEdit ? t.modalEdit : isDuplicate ? t.modalDuplicate : t.modalCreate}
                            </h2>
                            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                                {isDuplicate ? t.modalDuplicateDesc : t.modalDesc}
                            </p>
                        </div>

                        <button
                            type="button"
                            aria-label={t.close}
                            onClick={requestClose}
                            className="rounded-lg p-2 text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="max-h-[calc(100dvh-220px)] space-y-5 overflow-y-auto px-5 pb-5 pt-2 sm:px-7">
                        <Field id={`${baseId}-payer`} label={t.payer} error={errors.providerId}>
                            <Dropdown
                                id={`${baseId}-payer`}
                                value={providerId}
                                onChange={(value) => {
                                    setProviderId(value);
                                    clearError("providerId");
                                    clearError("policyNumber");
                                }}
                                options={providerOptions}
                                placeholder={providerOptions.length === 0 ? t.noPayers : t.payerPlaceholder}
                                ariaLabel={t.payer}
                                icon={Building2}
                                isRtl={isRtl}
                                invalid={Boolean(errors.providerId)}
                            />
                        </Field>

                        <Field id={`${baseId}-name`} label={t.planName} error={errors.nameEn}>
                            <input
                                ref={nameRef}
                                id={`${baseId}-name`}
                                value={nameEn}
                                onChange={(event) => {
                                    setNameEn(event.target.value);
                                    clearError("nameEn");
                                }}
                                maxLength={120}
                                autoComplete="off"
                                placeholder={t.planPlaceholder}
                                aria-invalid={Boolean(errors.nameEn)}
                                className={`${baseInput} ${errors.nameEn ? "border-rose-500" : ""}`}
                            />
                        </Field>

                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1.6fr_1fr]">
                            <Field
                                id={`${baseId}-number`}
                                label={t.policyNumber}
                                required
                                error={numberError}
                            >
                                <input
                                    ref={numberRef}
                                    id={`${baseId}-number`}
                                    dir="ltr"
                                    value={policyNumber}
                                    onChange={(event) => {
                                        setPolicyNumber(event.target.value.toUpperCase());
                                        clearError("policyNumber");
                                    }}
                                    maxLength={60}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder={t.policyPlaceholder}
                                    aria-invalid={numberInvalid}
                                    aria-required="true"
                                    className={`${baseInput} ${isRtl ? "text-end" : ""} ${numberInvalid
                                        ? "border-rose-500 bg-rose-500/5 focus:border-rose-500 focus:ring-rose-500/20"
                                        : ""
                                        }`}
                                />
                            </Field>

                            <Field
                                id={`${baseId}-expiry`}
                                label={t.expiry}
                                hint={t.optional}
                                error={errors.expiryDate}
                            >
                                <span className="relative block">
                                    <CalendarDays className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                    <input
                                        id={`${baseId}-expiry`}
                                        type="date"
                                        dir="ltr"
                                        value={expiry}
                                        min="2000-01-01"
                                        max="2100-12-31"
                                        onChange={(event) => {
                                            setExpiry(event.target.value);
                                            clearError("expiryDate");
                                        }}
                                        aria-invalid={Boolean(errors.expiryDate)}
                                        className={`${baseInput} pe-9 dark:[color-scheme:dark] ${errors.expiryDate ? "border-rose-500" : ""}`}
                                    />
                                </span>
                            </Field>
                        </div>
                        <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">{t.nphiesHelp}</p>

                        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/70 sm:p-5">
                            <legend className="px-2 text-base font-bold text-slate-900 dark:text-slate-100">
                                {t.financial}
                            </legend>

                            <div role="radiogroup" aria-label={t.financial} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {(
                                    [
                                        { value: "PERCENTAGE", label: t.percentage },
                                        { value: "FIXED_AMOUNT", label: t.fixedAmount },
                                    ] as const
                                ).map((option) => {
                                    const selected = copayType === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            onClick={() => {
                                                setCopayType(option.value);
                                                clearError("copayValue");
                                                clearError("maxPatientShare");
                                            }}
                                            className={`flex h-12 items-center gap-3 rounded-lg border px-4 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 ${selected
                                                ? "border-teal-500 bg-teal-600/10 text-teal-600 dark:text-teal-300"
                                                : "border-slate-200 text-slate-700 hover:border-teal-500/60 dark:border-slate-700 dark:text-slate-300"
                                                }`}
                                        >
                                            <span
                                                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150 ${selected ? "border-teal-500" : "border-slate-400 dark:border-slate-500"
                                                    }`}
                                            >
                                                <span
                                                    className={`h-2.5 w-2.5 rounded-full bg-teal-500 transition-transform duration-150 ${selected ? "scale-100" : "scale-0"
                                                        }`}
                                                />
                                            </span>
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div
                                className={`mt-4 grid grid-cols-1 gap-4 ${isPercentage ? "sm:grid-cols-2" : ""}`}
                            >
                                <Field id={`${baseId}-copay`} label={t.copayValue} error={errors.copayValue}>
                                    <div
                                        dir="ltr"
                                        className={`${groupBase} ${errors.copayValue ? "border-rose-500" : "border-slate-200 dark:border-slate-700"}`}
                                    >
                                        <input
                                            id={`${baseId}-copay`}
                                            inputMode="decimal"
                                            value={copayValue}
                                            onChange={(event) => {
                                                setCopayValue(sanitizeDecimal(event.target.value));
                                                clearError("copayValue");
                                            }}
                                            autoComplete="off"
                                            placeholder="0"
                                            aria-invalid={Boolean(errors.copayValue)}
                                            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100"
                                        />
                                        <span className={suffixBox}>{isPercentage ? "%" : t.sar}</span>
                                    </div>
                                </Field>

                                {isPercentage && (
                                    <Field
                                        id={`${baseId}-max`}
                                        label={t.maxShare}
                                        hint={t.optional}
                                        error={errors.maxPatientShare}
                                    >
                                        <div
                                            dir="ltr"
                                            className={`${groupBase} ${errors.maxPatientShare ? "border-rose-500" : "border-slate-200 dark:border-slate-700"}`}
                                        >
                                            <input
                                                id={`${baseId}-max`}
                                                inputMode="decimal"
                                                value={maxShare}
                                                onChange={(event) => {
                                                    setMaxShare(sanitizeDecimal(event.target.value));
                                                    clearError("maxPatientShare");
                                                }}
                                                autoComplete="off"
                                                placeholder="150"
                                                aria-invalid={Boolean(errors.maxPatientShare)}
                                                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100"
                                            />
                                            <span className={suffixBox}>{t.sar}</span>
                                        </div>
                                    </Field>
                                )}
                            </div>
                        </fieldset>

                        <div className="flex items-start gap-4">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isActive}
                                aria-label={t.activateNow}
                                onClick={() => {
                                    setIsActive((value) => !value);
                                    clearError("expiryDate");
                                }}
                                className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 ${isActive ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
                                    }`}
                            >
                                <span
                                    className={`absolute start-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150 ${isActive ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0"
                                        }`}
                                />
                            </button>

                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {t.activateNow}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {t.activateHelp}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:px-7">
                        <button
                            type="button"
                            onClick={requestClose}
                            className={`${outlineButton} h-11 px-6`}
                        >
                            {t.cancel}
                        </button>
                        <button type="submit" className={`${tealButton} h-11 px-6`}>
                            {isEdit ? t.saveChanges : t.save}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* delete confirmation                                                 */
/* ------------------------------------------------------------------ */

function DeleteDialog({
    policy,
    t,
    isRtl,
    onClosed,
    onConfirm,
}: {
    policy: PolicyRow;
    t: Messages;
    isRtl: boolean;
    onClosed: () => void;
    onConfirm: () => void;
}) {
    const { entered, requestClose } = useModalTransition(onClosed);
    const titleId = useId();

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none dark:bg-slate-950/80 sm:p-6 ${entered ? "opacity-100" : "opacity-0"
                }`}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                className={`my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 transition-all duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 ${entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
                    }`}
            >
                <div className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-400">
                        <Trash2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 id={titleId} className="text-lg font-extrabold text-slate-900 dark:text-white">
                            {t.deleteTitle}
                        </h2>
                        <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">
                            {t.deleteBody(policy.nameEn)}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={requestClose} className={`${outlineButton} h-11 px-6`}>
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onConfirm();
                            requestClose();
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                    >
                        <Trash2 className="h-4 w-4" />
                        {t.deleteConfirm}
                    </button>
                </div>
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function PoliciesTiersPage({ initialLocale,
}: PoliciesTiersProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [policies, setPolicies] = useState<PolicyRow[]>([]);
    const [providers, setProviders] = useState<PolicyProviderOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [query, setQuery] = useState("");
    const [payerFilter, setPayerFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState<ModalState>(null);
    const [deleteTarget, setDeleteTarget] = useState<PolicyRow | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    // Always-fresh mirrors so background tasks never read stale closures.
    const tRef = useRef<Messages>(t);
    const policiesRef = useRef<PolicyRow[]>([]);
    const providersRef = useRef<PolicyProviderOption[]>([]);
    const queueRef = useRef(new Map<string, Promise<void>>());
    const deadIdsRef = useRef(new Set<string>());
    const inflightRef = useRef(false);
    const fetchedAtRef = useRef(0);
    const toastIdRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        providersRef.current = providers;
    }, [providers]);

    useLayoutEffect(() => {
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
        (notice: Notice): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...notice, id }]);
            window.setTimeout(() => dismissNotice(id), TOAST_MS);

            return id;
        },
        [dismissNotice],
    );

    /* ------------------------ local data store ----------------------- */

    // Single entry point for every local change: updates the ref synchronously
    // (so rapid actions see the latest rows) and schedules the React render.
    const updatePolicies = useCallback((updater: (current: PolicyRow[]) => PolicyRow[]) => {
        const next = updater(policiesRef.current);

        policiesRef.current = next;
        setPolicies(next);
    }, []);

    // Server calls touching the same row(s) run strictly in order.
    const enqueue = useCallback((ids: string[], task: () => Promise<void>) => {
        const previous = Promise.all(ids.map((id) => queueRef.current.get(id) ?? Promise.resolve()));
        const next: Promise<void> = previous
            .then(task)
            .catch(() => undefined)
            .then(() => {
                for (const id of ids) {
                    if (queueRef.current.get(id) === next) queueRef.current.delete(id);
                }
            });

        for (const id of ids) queueRef.current.set(id, next);
    }, []);

    /* ----------------------------- loader ---------------------------- */

    const loadPolicies = useCallback(async () => {
        if (inflightRef.current) return;

        inflightRef.current = true;

        const blocking = policiesRef.current.length === 0;

        if (blocking) setLoading(true);
        setLoadError("");

        try {
            const result = await getPoliciesAction();

            if (result.success && result.data) {
                const { policies: rows, providers: providerRows } = result.data;

                fetchedAtRef.current = Date.now();
                providersRef.current = providerRows;
                setProviders(providerRows);

                updatePolicies((current) => {
                    const local = new Map(current.map((row) => [row.id, row]));
                    const serverIds = new Set(rows.map((row) => row.id));
                    const pending = (id: string) => queueRef.current.has(id);

                    const merged = rows.map((row) => (pending(row.id) ? (local.get(row.id) ?? row) : row));
                    const pendingNew = current.filter((row) => pending(row.id) && !serverIds.has(row.id));

                    return [...pendingNew, ...merged];
                });
            } else if (blocking) {
                setLoadError(result.error ?? tRef.current.loadFailed);
            }
        } catch {
            if (blocking) setLoadError(tRef.current.loadFailed);
        } finally {
            inflightRef.current = false;
            setLoading(false);
        }
    }, [updatePolicies]);

    useEffect(() => {
        void loadPolicies();
    }, [loadPolicies]);

    useEffect(() => {
        const onVisible = () => {
            if (
                document.visibilityState === "visible" &&
                Date.now() - fetchedAtRef.current > REFRESH_AFTER_MS
            ) {
                void loadPolicies();
            }
        };

        document.addEventListener("visibilitychange", onVisible);

        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [loadPolicies]);

    /* ------------------------ optimistic helpers --------------------- */

    const replaceIfCurrent = useCallback(
        (optimistic: PolicyRow, server: PolicyRow) => {
            updatePolicies((current) =>
                current.map((row) => (row === optimistic ? server : row)),
            );
        },
        [updatePolicies],
    );

    const rollbackRow = useCallback(
        (optimistic: PolicyRow, previous: PolicyRow, toastId: number, message: string) => {
            dismissNotice(toastId);
            updatePolicies((current) =>
                current.map((row) => (row === optimistic ? previous : row)),
            );
            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, updatePolicies],
    );

    const removeFailedCreate = useCallback(
        (id: string, toastId: number, message: string) => {
            deadIdsRef.current.add(id);
            dismissNotice(toastId);
            updatePolicies((current) => current.filter((row) => row.id !== id));
            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, updatePolicies],
    );

    const restoreDeletedRow = useCallback(
        (snapshot: PolicyRow, index: number, toastId: number, message: string) => {
            dismissNotice(toastId);
            updatePolicies((current) => {
                if (current.some((row) => row.id === snapshot.id)) return current;

                const next = [...current];

                next.splice(Math.min(index, next.length), 0, snapshot);

                return next;
            });
            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, updatePolicies],
    );

    /* ----------------------------- mutations ------------------------- */

    // Used by both "Create New Policy" and the duplicate workflow (the copy is a brand-new policy).
    const createPolicy = useCallback(
        (input: PolicyInput) => {
            const provider = providersRef.current.find((item) => item.id === input.providerId);

            if (!provider) return;

            const id = newId();
            const optimistic = buildRow(id, input, provider);

            updatePolicies((current) => [optimistic, ...current]);
            setPage(1);

            const toastId = pushNotice({ kind: "success", message: tRef.current.created });

            enqueue([id], async () => {
                try {
                    const result = await createPolicyAction({ ...input, id });

                    if (result.success && result.data) {
                        replaceIfCurrent(optimistic, result.data.policy);
                    } else {
                        removeFailedCreate(id, toastId, serverMessage(result, tRef.current));
                    }
                } catch {
                    removeFailedCreate(id, toastId, tRef.current.failed);
                }
            });
        },
        [enqueue, pushNotice, removeFailedCreate, replaceIfCurrent, updatePolicies],
    );

    const editPolicy = useCallback(
        (base: PolicyRow, input: PolicyInput) => {
            const provider = providersRef.current.find((item) => item.id === input.providerId);
            const current = policiesRef.current.find((row) => row.id === base.id);

            if (!provider || !current) return;

            const optimistic = buildRow(base.id, input, provider, current);

            updatePolicies((rows) => rows.map((row) => (row.id === base.id ? optimistic : row)));

            const toastId = pushNotice({ kind: "success", message: tRef.current.updated });

            enqueue([base.id], async () => {
                if (deadIdsRef.current.has(base.id)) return;

                try {
                    const result = await updatePolicyAction({ ...input, policyId: base.id });

                    if (result.success && result.data) {
                        replaceIfCurrent(optimistic, result.data.policy);
                    } else {
                        rollbackRow(optimistic, current, toastId, serverMessage(result, tRef.current));
                    }
                } catch {
                    rollbackRow(optimistic, current, toastId, tRef.current.failed);
                }
            });
        },
        [enqueue, pushNotice, replaceIfCurrent, rollbackRow, updatePolicies],
    );

    const toggleStatus = useCallback(
        (id: string) => {
            const current = policiesRef.current.find((row) => row.id === id);

            if (!current) return;

            const nextActive = !current.isActive;

            if (nextActive && isExpired(current.expiryDate)) {
                pushNotice({ kind: "error", message: tRef.current.expiredCannotActivate });
                return;
            }

            const optimistic: PolicyRow = { ...current, isActive: nextActive };

            updatePolicies((rows) => rows.map((row) => (row.id === id ? optimistic : row)));

            const toastId = pushNotice({
                kind: "success",
                message: nextActive ? tRef.current.activated : tRef.current.deactivated,
            });

            enqueue([id], async () => {
                if (deadIdsRef.current.has(id)) return;

                try {
                    const result = await setPolicyActiveStatusAction(id, nextActive);

                    if (result.success && result.data) {
                        replaceIfCurrent(optimistic, result.data.policy);
                    } else {
                        rollbackRow(optimistic, current, toastId, serverMessage(result, tRef.current));
                    }
                } catch {
                    rollbackRow(optimistic, current, toastId, tRef.current.failed);
                }
            });
        },
        [enqueue, pushNotice, replaceIfCurrent, rollbackRow, updatePolicies],
    );

    const deletePolicy = useCallback(
        (target: PolicyRow) => {
            const index = policiesRef.current.findIndex((row) => row.id === target.id);

            if (index < 0) return;

            const snapshot = policiesRef.current[index]!;

            updatePolicies((rows) => rows.filter((row) => row.id !== target.id));

            const toastId = pushNotice({ kind: "success", message: tRef.current.deleted });

            enqueue([target.id], async () => {
                if (deadIdsRef.current.has(target.id)) return;

                try {
                    const result = await deletePolicyAction(target.id);

                    if (!result.success) {
                        restoreDeletedRow(snapshot, index, toastId, serverMessage(result, tRef.current));
                    }
                } catch {
                    restoreDeletedRow(snapshot, index, toastId, tRef.current.failed);
                }
            });
        },
        [enqueue, pushNotice, restoreDeletedRow, updatePolicies],
    );

    /* ------------------------- filters & paging ---------------------- */

    const deferredQuery = useDeferredValue(query);
    // Reset must be instant, so an empty query bypasses the deferred value.
    const effectiveQuery = query.trim() === "" ? "" : deferredQuery.trim().toLowerCase();

    const hasActiveFilters = query.trim() !== "" || payerFilter !== "ALL" || statusFilter !== "ALL";

    const filtered = useMemo(
        () =>
            policies.filter((policy) => {
                if (payerFilter !== "ALL" && policy.providerId !== payerFilter) return false;
                if (statusFilter === "ACTIVE" && !policy.isActive) return false;
                if (statusFilter === "INACTIVE" && policy.isActive) return false;

                if (effectiveQuery) {
                    const haystack = `${policy.nameEn} ${policy.nameAr ?? ""} ${policy.policyNumber} ${policy.providerNameEn} ${policy.providerNameAr}`.toLowerCase();

                    if (!haystack.includes(effectiveQuery)) return false;
                }

                return true;
            }),
        [policies, payerFilter, statusFilter, effectiveQuery],
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visible = useMemo(
        () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filtered, currentPage],
    );

    const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);

    const pageWindow = useMemo(() => {
        const size = 5;
        let end = Math.min(totalPages, Math.max(1, currentPage - 2) + size - 1);
        const start = Math.max(1, end - size + 1);

        end = Math.min(totalPages, start + size - 1);

        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }, [currentPage, totalPages]);

    const payerFilterOptions = useMemo<DropdownOption[]>(
        () => [
            { value: "ALL", label: t.allPayers },
            ...providers.map((provider) => ({
                value: provider.id,
                label: isRtl ? provider.nameAr || provider.nameEn : provider.nameEn,
            })),
        ],
        [providers, t.allPayers, isRtl],
    );

    const statusFilterOptions = useMemo<DropdownOption[]>(
        () => [
            { value: "ALL", label: t.allStatuses },
            { value: "ACTIVE", label: t.active },
            { value: "INACTIVE", label: t.inactive },
        ],
        [t.allStatuses, t.active, t.inactive],
    );

    // Policy numbers are unique per payer, so the key combines payer + number.
    const existingNumbers = useMemo(
        () => new Map(policies.map((policy) => [numberKey(policy.providerId, policy.policyNumber), policy.id])),
        [policies],
    );

    function resetFilters() {
        setQuery("");
        setPayerFilter("ALL");
        setStatusFilter("ALL");
        setPage(1);
    }

    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    const pageButton =
        "grid h-10 min-w-10 place-items-center rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-40";

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref="/admin/insurance/policies"
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <main className="min-w-0 flex-1">
                    <AdminHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <span>/</span>
                                    <span>{t.breadcrumbCurrent}</span>
                                </div>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{t.subtitle}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setModal({ mode: "create" })}
                                disabled={loading || providers.length === 0}
                                className={`${tealButton} h-12 shrink-0 px-6 text-base`}
                            >
                                <Plus className="h-5 w-5" />
                                {t.add}
                            </button>
                        </header>

                        <section className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(220px,1.7fr)_minmax(180px,1fr)_minmax(180px,.95fr)_auto]">
                            <label className="relative block">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                                <input
                                    value={query}
                                    onChange={(event) => {
                                        setQuery(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t.search}
                                    aria-label={t.search}
                                    maxLength={120}
                                    className={`${baseInput} h-[54px] bg-white ps-12 dark:bg-slate-900/60`}
                                />
                            </label>

                            <Dropdown
                                value={payerFilter}
                                onChange={(value) => {
                                    setPayerFilter(value);
                                    setPage(1);
                                }}
                                options={payerFilterOptions}
                                placeholder={t.allPayers}
                                ariaLabel={t.allPayers}
                                icon={Building2}
                                isRtl={isRtl}
                                className="h-[54px] bg-white dark:bg-slate-900/60"
                            />

                            <Dropdown
                                value={statusFilter}
                                onChange={(value) => {
                                    setStatusFilter(value as StatusFilter);
                                    setPage(1);
                                }}
                                options={statusFilterOptions}
                                placeholder={t.allStatuses}
                                ariaLabel={t.allStatuses}
                                icon={ShieldCheck}
                                isRtl={isRtl}
                                className="h-[54px] bg-white dark:bg-slate-900/60"
                            />

                            {/* Always rendered at its full size/style; only enabled once a filter is applied. */}
                            <button
                                type="button"
                                onClick={resetFilters}
                                disabled={!hasActiveFilters}
                                className={`${outlineButton} h-[54px] w-full shrink-0 whitespace-nowrap bg-white px-6 dark:bg-slate-900/60 md:w-auto ${hasActiveFilters
                                    ? "border-teal-600/50 text-teal-600 dark:text-teal-300"
                                    : "disabled:hover:border-slate-200 disabled:hover:text-slate-900 dark:disabled:hover:border-slate-700 dark:disabled:hover:text-slate-100"
                                    }`}
                            >
                                <RotateCcw className="h-4 w-4 shrink-0" />
                                {t.resetFilters}
                            </button>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/20 dark:border-slate-800 dark:bg-slate-900/60">
                            {loadError ? (
                                <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                                    <CircleAlert className="h-8 w-8 text-teal-500" />
                                    <p className="text-sm">{loadError}</p>
                                    <button type="button" onClick={() => void loadPolicies()} className={tealButton}>
                                        {t.retry}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[980px] table-fixed border-collapse text-start">
                                            <caption className="sr-only">{loading ? t.loading : t.title}</caption>
                                            <colgroup>
                                                <col className="w-[28%]" />
                                                <col className="w-[22%]" />
                                                <col className="w-[20%]" />
                                                <col className="w-[13%]" />
                                                <col className="w-[11%]" />
                                                <col className="w-[6%]" />
                                            </colgroup>
                                            <thead>
                                                <tr className="border-b border-slate-200 bg-white text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                                                    <th className="px-6 py-5 text-start align-middle">{t.colPlan}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colNumber}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colCopay}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colExpiry}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colStatus}</th>
                                                    <th className="px-4 py-5 text-center align-middle">{t.colActions}</th>
                                                </tr>
                                            </thead>

                                            <tbody
                                                aria-busy={loading}
                                                className="divide-y divide-slate-200 dark:divide-slate-800"
                                            >
                                                {loading ? (
                                                    <SkeletonRows />
                                                ) : visible.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={6}
                                                            className="h-56 text-center align-middle text-sm text-slate-500 dark:text-slate-400"
                                                        >
                                                            {policies.length === 0 ? t.emptyAll : t.empty}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    visible.map((policy) => {
                                                        const expired = isExpired(policy.expiryDate);

                                                        return (
                                                            <tr
                                                                key={policy.id}
                                                                className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                                            >
                                                                <td className="px-6 py-5 align-middle">
                                                                    <div className="flex min-w-0 items-center gap-4">
                                                                        <PayerAvatar
                                                                            name={policy.providerNameEn}
                                                                            logoUrl={policy.providerLogoUrl}
                                                                        />
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-base font-bold text-slate-900 dark:text-white">
                                                                                {policy.nameEn}
                                                                            </p>
                                                                            <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                                                                                {isRtl
                                                                                    ? policy.providerNameAr || policy.providerNameEn
                                                                                    : policy.providerNameEn}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle">
                                                                    <span
                                                                        dir="ltr"
                                                                        className="inline-block max-w-full truncate rounded-lg border border-teal-600/20 bg-teal-600/10 px-3.5 py-2.5 align-middle text-sm font-semibold text-teal-600 dark:text-teal-300"
                                                                    >
                                                                        {policy.policyNumber}
                                                                    </span>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle">
                                                                    <span
                                                                        dir="ltr"
                                                                        className="inline-block max-w-full truncate rounded-lg border border-slate-300 px-3.5 py-2.5 align-middle text-sm font-semibold text-slate-900 dark:border-teal-600/40 dark:text-slate-100"
                                                                    >
                                                                        {copayLabel(policy, t)}
                                                                    </span>
                                                                </td>

                                                                <td
                                                                    className={`px-4 py-5 align-middle text-sm font-medium ${expired
                                                                        ? "text-rose-400"
                                                                        : "text-slate-700 dark:text-slate-200"
                                                                        }`}
                                                                >
                                                                    <span dir="ltr">
                                                                        {formatDate(policy.expiryDate, locale, t.noExpiry)}
                                                                    </span>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle">
                                                                    <StatusBadge
                                                                        active={policy.isActive}
                                                                        t={t}
                                                                        onToggle={() => toggleStatus(policy.id)}
                                                                    />
                                                                </td>

                                                                <td className="px-4 py-5 text-center align-middle">
                                                                    <RowActions
                                                                        policy={policy}
                                                                        t={t}
                                                                        isRtl={isRtl}
                                                                        onEdit={() => setModal({ mode: "edit", policy })}
                                                                        onDuplicate={() => setModal({ mode: "duplicate", policy })}
                                                                        onToggleStatus={() => toggleStatus(policy.id)}
                                                                        onDelete={() => setDeleteTarget(policy)}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:flex-row sm:items-center">
                                        <p className="text-sm text-slate-600 dark:text-slate-300">
                                            {loading ? (
                                                <span className="inline-block h-4 w-44 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                                            ) : (
                                                t.showing(showingFrom, showingTo, filtered.length)
                                            )}
                                        </p>

                                        <nav aria-label={t.page} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={t.previous}
                                                disabled={loading || currentPage <= 1}
                                                onClick={() => setPage(Math.max(1, currentPage - 1))}
                                                className={`${pageButton} border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200`}
                                            >
                                                <PrevIcon className="h-4 w-4" />
                                            </button>

                                            {pageWindow.map((number) => (
                                                <button
                                                    key={number}
                                                    type="button"
                                                    aria-label={`${t.page} ${number}`}
                                                    aria-current={number === currentPage ? "page" : undefined}
                                                    disabled={loading}
                                                    onClick={() => setPage(number)}
                                                    className={`${pageButton} ${number === currentPage
                                                        ? "border-teal-600 bg-teal-600 text-white hover:bg-teal-500"
                                                        : "border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200"
                                                        }`}
                                                >
                                                    {number}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                aria-label={t.next}
                                                disabled={loading || currentPage >= totalPages}
                                                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                                                className={`${pageButton} border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200`}
                                            >
                                                <NextIcon className="h-4 w-4" />
                                            </button>
                                        </nav>
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                </main>
            </div>

            {modal && (
                <PolicyModal
                    key={modal.mode === "create" ? "create" : `${modal.mode}-${modal.policy.id}`}
                    mode={modal.mode}
                    policy={modal.mode === "create" ? null : modal.policy}
                    providers={providers}
                    existingNumbers={existingNumbers}
                    t={t}
                    isRtl={isRtl}
                    onClosed={() => setModal(null)}
                    onSubmit={(input) => {
                        if (modal.mode === "edit") editPolicy(modal.policy, input);
                        else createPolicy(input);
                    }}
                />
            )}

            {deleteTarget && (
                <DeleteDialog
                    key={deleteTarget.id}
                    policy={deleteTarget}
                    t={t}
                    isRtl={isRtl}
                    onClosed={() => setDeleteTarget(null)}
                    onConfirm={() => deletePolicy(deleteTarget)}
                />
            )}

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
                            {toast.message}
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