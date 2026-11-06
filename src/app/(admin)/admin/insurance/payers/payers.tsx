"use client";

/**
 * Performance & motion notes
 * --------------------------
 * - Every mutation (create, edit, toggle status, delete) updates the UI in the same frame and
 *   syncs with the server in the background. Per-row queues keep server calls in order.
 *   On failure the previous state is restored, an error toast appears, and (for create/edit)
 *   the form reopens with the user's input and any server field errors, so nothing is lost.
 * - No router.refresh() and no blocking spinners.
 * - Modals, the delete dialog, dropdown menus, rows and toasts animate in and out using
 *   Tailwind transitions only (no extra dependencies) and respect `prefers-reduced-motion`.
 * - Optional server-side win: remove `revalidatePath(MANAGEMENT_PATH)` from ./actions.ts.
 *   This page owns its data, and each revalidation makes every Server Action response
 *   heavier and slower.
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
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Check,
    Filter,
    MoreHorizontal,
    Pencil,
    Plus,
    Power,
    PowerOff,
    Search,
    Trash2,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createPayerAction,
    deletePayerAction,
    getPayersAction,
    setPayerActiveStatusAction,
    updatePayerAction,
    type PayerFieldErrors,
    type PayerFormInput,
    type PayerRow,
    type PayerStatusFilter,
} from "./actions";

/* -------------------------------------------------------------------------- */
/* Constants & types                                                          */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 4;
/** Server maximum page size; the full list is fetched once and filtered locally. */
const FETCH_PAGE_SIZE = 100;
const ACTIVE_HREF = "/admin/insurance/payers";

/** Animation timings (ms). Keep in sync with the Tailwind duration classes below. */
const MODAL_MS = 200;
const MENU_MS = 150;
const ROW_EXIT_MS = 200;
const TOAST_MS = 6000;
const TOAST_EXIT_MS = 200;
const MAX_TOASTS = 3;

const TEMP_ID_PREFIX = "tmp-";

/** Mirrors the server-side ZATCA rule: 15 digits, starts and ends with 3. */
const TAX_NUMBER_PATTERN = /^3\d{13}3$/;
const NPHIES_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;

type InsurancePayersProps = {
    initialLocale: Locale;
};

type ModalDraft = {
    /** Values to restore in the form (used when a background save fails). */
    draft?: PayerFormInput;
    fieldErrors?: PayerFieldErrors;
    formError?: string;
};

type ModalRequest =
    | ({ mode: "create" } & ModalDraft)
    | ({ mode: "edit"; payer: PayerRow } & ModalDraft);

type ModalState = (ModalRequest & { nonce: number }) | null;

type Notice = {
    kind: "success" | "error";
    message: string;
};

type ToastItem = Notice & { id: number; leaving: boolean };

const messages = {
    en: {
        breadcrumbRoot: "Payers",
        title: "Insurance Payers",
        subtitle:
            "Configure and manage insurance providers, NPHIES identifiers, and official tax records.",
        add: "Add New Payer",
        search: "Search by company name or NPHIES code",
        allStatuses: "All statuses",
        active: "Active",
        inactive: "Inactive",
        filter: "Filter",
        resetFilters: "Reset filters",
        colCompany: "Company",
        colNphies: "NPHIES Payer ID",
        colTax: "Tax Registration Number",
        colStatus: "Status",
        colActions: "Actions",
        showing: "Showing",
        of: "of",
        payers: "payers",
        previous: "Previous page",
        next: "Next page",
        pagination: "Payers pagination",
        loading: "Loading payers…",
        empty: "No insurance payers match your search.",
        emptyFirst: "No insurance payers have been added yet.",
        retry: "Try again",
        loadFailed: "Unable to load insurance payers. Please try again.",
        rowActions: "Row actions",
        menuEdit: "Edit Payer",
        menuActivate: "Activate Payer",
        menuDeactivate: "Deactivate Payer",
        menuDelete: "Delete Payer",
        modalAddTitle: "Add New Insurance Payer",
        modalEditTitle: "Edit Insurance Payer",
        modalSubtitle: "Enter payer details to configure NPHIES and e-invoicing.",
        modalEditSubtitle: "Update the payer details used for NPHIES and e-invoicing.",
        nameAr: "Insurance Company Name (Arabic)",
        nameEn: "Insurance Company Name (English)",
        nameArPlaceholder: "e.g. بوبا العربية",
        nameEnPlaceholder: "e.g. Bupa Arabia",
        nphiesLabel: "Official NPHIES Payer ID",
        nphiesPlaceholder: "NPH-BUPA-01",
        nphiesHelp: "The official identifier registered with the NPHIES platform.",
        taxLabel: "Tax Registration Number",
        taxPlaceholder: "15 digits",
        taxHelp: "Enter the 15-digit ZATCA tax registration number.",
        activeImmediately: "Active immediately",
        activeLabel: "Active",
        cancel: "Cancel",
        save: "Save Payer",
        saveChanges: "Save Changes",
        saving: "Saving…",
        close: "Close",
        errNameRequired: "Enter the insurance company name in Arabic or English.",
        errNphiesRequired: "The NPHIES Payer ID is required.",
        errNphiesInvalid:
            "Use 2–40 letters, digits, dots, dashes or underscores (e.g. NPH-BUPA-01).",
        errTaxRequired: "The tax registration number is required.",
        errTaxInvalid: "Enter a valid 15-digit ZATCA number starting and ending with 3.",
        created: "Insurance payer added successfully.",
        updated: "Insurance payer updated successfully.",
        activated: "Insurance payer activated.",
        deactivated: "Insurance payer deactivated.",
        deleted: "Insurance payer deleted.",
        failed: "The operation failed. Please try again.",
        deleteTitle: "Delete insurance payer?",
        deleteBody:
            "This permanently removes the payer and its NPHIES and tax records. This action cannot be undone.",
        deleteBlocked: (count: number) =>
            `This payer is assigned to ${count} patient${count === 1 ? "" : "s"}. Deactivate it instead of deleting it.`,
        deleteConfirm: "Delete Payer",
        deleting: "Deleting…",
    },
    ar: {
        breadcrumbRoot: "شركات التأمين",
        title: "شركات التأمين",
        subtitle:
            "إعداد وإدارة شركات التأمين ومعرّفات نفيس والسجلات الضريبية الرسمية.",
        add: "إضافة شركة تأمين",
        search: "ابحث باسم الشركة أو رمز نفيس",
        allStatuses: "جميع الحالات",
        active: "نشط",
        inactive: "غير نشط",
        filter: "تصفية",
        resetFilters: "إعادة ضبط التصفية",
        colCompany: "الشركة",
        colNphies: "معرّف نفيس للجهة الدافعة",
        colTax: "رقم التسجيل الضريبي",
        colStatus: "الحالة",
        colActions: "الإجراءات",
        showing: "عرض",
        of: "من",
        payers: "شركة",
        previous: "الصفحة السابقة",
        next: "الصفحة التالية",
        pagination: "ترقيم صفحات شركات التأمين",
        loading: "جارٍ تحميل شركات التأمين…",
        empty: "لا توجد شركات تأمين تطابق البحث.",
        emptyFirst: "لم تتم إضافة أي شركة تأمين بعد.",
        retry: "إعادة المحاولة",
        loadFailed: "تعذر تحميل شركات التأمين. حاول مرة أخرى.",
        rowActions: "إجراءات الصف",
        menuEdit: "تعديل الشركة",
        menuActivate: "تفعيل الشركة",
        menuDeactivate: "إيقاف الشركة",
        menuDelete: "حذف الشركة",
        modalAddTitle: "إضافة شركة تأمين جديدة",
        modalEditTitle: "تعديل شركة التأمين",
        modalSubtitle: "أدخل بيانات الشركة لإعداد الربط مع نفيس والفوترة الإلكترونية.",
        modalEditSubtitle: "حدّث بيانات الشركة المستخدمة في نفيس والفوترة الإلكترونية.",
        nameAr: "اسم شركة التأمين (بالعربية)",
        nameEn: "اسم شركة التأمين (بالإنجليزية)",
        nameArPlaceholder: "مثال: بوبا العربية",
        nameEnPlaceholder: "e.g. Bupa Arabia",
        nphiesLabel: "المعرّف الرسمي لنفيس",
        nphiesPlaceholder: "NPH-BUPA-01",
        nphiesHelp: "المعرّف الرسمي المسجل لدى منصة نفيس.",
        taxLabel: "رقم التسجيل الضريبي",
        taxPlaceholder: "15 رقماً",
        taxHelp: "أدخل رقم التسجيل الضريبي المكوّن من 15 رقماً (هيئة الزكاة).",
        activeImmediately: "تفعيل فوري",
        activeLabel: "نشط",
        cancel: "إلغاء",
        save: "حفظ الشركة",
        saveChanges: "حفظ التغييرات",
        saving: "جارٍ الحفظ…",
        close: "إغلاق",
        errNameRequired: "أدخل اسم شركة التأمين بالعربية أو الإنجليزية.",
        errNphiesRequired: "معرّف نفيس مطلوب.",
        errNphiesInvalid:
            "استخدم من 2 إلى 40 حرفاً أو رقماً أو نقطة أو شرطة (مثال: NPH-BUPA-01).",
        errTaxRequired: "رقم التسجيل الضريبي مطلوب.",
        errTaxInvalid: "أدخل رقماً ضريبياً صحيحاً من 15 رقماً يبدأ وينتهي بالرقم 3.",
        created: "تمت إضافة شركة التأمين بنجاح.",
        updated: "تم تحديث شركة التأمين بنجاح.",
        activated: "تم تفعيل شركة التأمين.",
        deactivated: "تم إيقاف شركة التأمين.",
        deleted: "تم حذف شركة التأمين.",
        failed: "تعذر إتمام العملية. حاول مرة أخرى.",
        deleteTitle: "حذف شركة التأمين؟",
        deleteBody:
            "سيتم حذف الشركة وسجلات نفيس والضريبة الخاصة بها نهائياً. لا يمكن التراجع عن هذا الإجراء.",
        deleteBlocked: (count: number) =>
            `هذه الشركة مرتبطة بعدد ${count} من المرضى. قم بإيقافها بدلاً من حذفها.`,
        deleteConfirm: "حذف الشركة",
        deleting: "جارٍ الحذف…",
    },
} as const;

type Messages = (typeof messages)[Locale];

/* -------------------------------------------------------------------------- */
/* Shared class names (brand accent: teal)                                    */
/* -------------------------------------------------------------------------- */

const baseInput =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition duration-150 ease-out motion-reduce:transition-none placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition duration-150 ease-out motion-reduce:transition-none hover:bg-teal-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition duration-150 ease-out motion-reduce:transition-none hover:border-teal-500 hover:text-teal-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-offset-slate-950";

const AVATAR_COLORS = [
    "bg-sky-600",
    "bg-violet-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-cyan-600",
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function displayName(payer: PayerRow, locale: Locale): string {
    return locale === "ar"
        ? payer.nameAr || payer.nameEn
        : payer.nameEn || payer.nameAr;
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) return "?";

    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function colorFor(value: string): string {
    let hash = 0;

    for (let index = 0; index < value.length; index++) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function normalizeDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (digit) =>
            String(digit.charCodeAt(0) - 0x0660),
        )
        .replace(/[\u06F0-\u06F9]/g, (digit) =>
            String(digit.charCodeAt(0) - 0x06f0),
        );
}

function pageWindow(current: number, total: number): number[] {
    const size = Math.min(5, total);
    let start = Math.max(1, current - Math.floor(size / 2));
    const end = Math.min(total, start + size - 1);

    start = Math.max(1, end - size + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/** Newest first, matching the server ordering. */
function sortPayers(rows: PayerRow[]): PayerRow[] {
    return [...rows].sort((a, b) => {
        if (a.createdAt !== b.createdAt) {
            return a.createdAt < b.createdAt ? 1 : -1;
        }

        return a.id < b.id ? -1 : 1;
    });
}

function makeTempId(): string {
    const random =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${TEMP_ID_PREFIX}${random}`;
}

function isTempId(id: string): boolean {
    return id.startsWith(TEMP_ID_PREFIX);
}

function normalizeCompanyName(value: string): string {
    return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Builds the row shown instantly, before the server confirms the change. */
function buildOptimisticPayer(
    input: PayerFormInput,
    base: PayerRow | null,
    id: string,
): PayerRow {
    let nameAr = normalizeCompanyName(input.nameAr);
    let nameEn = normalizeCompanyName(input.nameEn);

    // Same fallback the server applies when only one name is provided.
    if (!nameAr) nameAr = nameEn;
    if (!nameEn) nameEn = nameAr;

    return {
        id,
        nameAr,
        nameEn,
        nphiesPayerId: input.nphiesPayerId,
        taxNumber: input.taxNumber,
        logoUrl: base?.logoUrl ?? null,
        isActive: input.isActive ?? base?.isActive ?? true,
        patientCount: base?.patientCount ?? 0,
        createdAt: base?.createdAt ?? new Date().toISOString(),
    };
}

async function fetchAllPayers(): Promise<
    { rows: PayerRow[] } | { error: string | null }
> {
    const first = await getPayersAction({ page: 1, pageSize: FETCH_PAGE_SIZE });

    if (!first.success || !first.data) {
        return { error: first.error ?? null };
    }

    const rows: PayerRow[] = Array.isArray(first.data.payers)
        ? [...first.data.payers]
        : [];
    const remaining = Math.max(0, (first.data.totalPages ?? 1) - 1);

    if (remaining > 0) {
        const rest = await Promise.all(
            Array.from({ length: remaining }, (_, index) =>
                getPayersAction({ page: index + 2, pageSize: FETCH_PAGE_SIZE }),
            ),
        );

        for (const result of rest) {
            if (!result.success || !result.data) {
                return { error: result.error ?? null };
            }

            rows.push(...result.data.payers);
        }
    }

    return { rows };
}

/* -------------------------------------------------------------------------- */
/* Animation hooks (Tailwind transitions, no extra dependencies)              */
/* -------------------------------------------------------------------------- */

/**
 * Keeps an element mounted while its exit transition plays.
 * - `mounted`: render the element.
 * - `visible`: apply the "shown" classes (flips one frame after mounting so the
 *   enter transition actually runs, and flips back immediately on close).
 */
function usePresence(open: boolean, duration: number) {
    const [lingering, setLingering] = useState(false);
    const [visible, setVisible] = useState(false);
    const [prevOpen, setPrevOpen] = useState(open);

    if (prevOpen !== open) {
        setPrevOpen(open);
        setLingering(!open);
    }

    useEffect(() => {
        if (open) {
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

        const timer = window.setTimeout(() => setLingering(false), duration);

        return () => window.clearTimeout(timer);
    }, [open, duration]);

    return { mounted: open || lingering, visible: open && visible };
}

/**
 * Same idea for content-bearing dialogs: keeps the last non-null value around
 * while the exit transition plays, so the dialog never empties mid-animation.
 */
function useHeldValue<T>(value: T | null, duration: number) {
    const [held, setHeld] = useState<T | null>(value);
    const [visible, setVisible] = useState(false);

    if (value !== null && held !== value) {
        setHeld(value);
    }

    useEffect(() => {
        if (value !== null) {
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

        const timer = window.setTimeout(() => setHeld(null), duration);

        return () => window.clearTimeout(timer);
    }, [value, duration]);

    return { held: value ?? held, visible: value !== null && visible };
}

/* -------------------------------------------------------------------------- */
/* Small UI components                                                        */
/* -------------------------------------------------------------------------- */

function PayerAvatar({ payer, name }: { payer: PayerRow; name: string }) {
    const [failed, setFailed] = useState(false);

    if (payer.logoUrl && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={payer.logoUrl}
                alt=""
                onError={() => setFailed(true)}
                className="h-12 w-12 shrink-0 rounded-full bg-white object-cover"
            />
        );
    }

    return (
        <div
            aria-hidden="true"
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${colorFor(
                payer.nameEn || payer.id,
            )}`}
        >
            {initials(name)}
        </div>
    );
}

function StatusBadge({ isActive, t }: { isActive: boolean; t: Messages }) {
    return (
        <span
            className={`inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 ease-out motion-reduce:transition-none ${isActive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-slate-500/10 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400"
                }`}
        >
            <span
                className={`h-2.5 w-2.5 rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none ${isActive
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : "bg-slate-400 dark:bg-slate-500"
                    }`}
            />
            {isActive ? t.active : t.inactive}
        </span>
    );
}

function Toggle({
    checked,
    onChange,
    label,
    disabled,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-900 ${checked ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
        >
            <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out motion-reduce:transition-none ${checked
                    ? "translate-x-6 rtl:-translate-x-6"
                    : "translate-x-1 rtl:-translate-x-1"
                    }`}
            />
        </button>
    );
}

function Field({
    label,
    htmlFor,
    required,
    error,
    help,
    children,
}: {
    label: string;
    htmlFor: string;
    required?: boolean;
    error?: string;
    help?: string;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <label
                htmlFor={htmlFor}
                className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100"
            >
                {required && (
                    <span aria-hidden="true" className="text-teal-500">
                        ★
                    </span>
                )}
                {label}
            </label>
            {children}
            {error ? (
                <p
                    id={`${htmlFor}-error`}
                    role="alert"
                    className="mt-2 flex items-start gap-1.5 text-xs text-rose-500 dark:text-rose-400"
                >
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                    {error}
                </p>
            ) : help ? (
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {help}
                </p>
            ) : null}
        </div>
    );
}

function StatusFilterSelect({
    value,
    onChange,
    options,
    isRtl,
    ariaLabel,
}: {
    value: PayerStatusFilter;
    onChange: (next: PayerStatusFilter) => void;
    options: ReadonlyArray<{ value: PayerStatusFilter; label: string }>;
    isRtl: boolean;
    ariaLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const { mounted, visible } = usePresence(open, MENU_MS);

    const selectedIndex = Math.max(
        0,
        options.findIndex((option) => option.value === value),
    );
    const selected = options[selectedIndex];

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
        };
    }, [open]);

    function choose(index: number) {
        const option = options[index];

        if (option) onChange(option.value);

        setOpen(false);
    }

    function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (!open) {
                setHighlight(selectedIndex);
                setOpen(true);
                return;
            }

            setHighlight((current) =>
                event.key === "ArrowDown"
                    ? (current + 1) % options.length
                    : (current - 1 + options.length) % options.length,
            );
            return;
        }

        if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            choose(highlight);
        }
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                onKeyDown={onKeyDown}
                onClick={() => {
                    setHighlight(selectedIndex);
                    setOpen((current) => !current);
                }}
                className="flex h-[54px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 text-start text-sm font-medium text-slate-900 transition duration-150 ease-out motion-reduce:transition-none hover:border-teal-500 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
            >
                <span className="truncate">{selected?.label}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ease-out motion-reduce:transition-none dark:text-slate-300 ${open ? "rotate-180" : ""
                        }`}
                />
            </button>

            {mounted && (
                <ul
                    id={listId}
                    role="listbox"
                    dir={isRtl ? "rtl" : "ltr"}
                    aria-label={ariaLabel}
                    className={`absolute inset-x-0 top-full z-40 mt-2 origin-top overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/40 transition duration-150 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 ${visible
                        ? "translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none -translate-y-1 scale-95 opacity-0"
                        }`}
                >
                    {options.map((option, index) => {
                        const isSelected = option.value === value;

                        return (
                            <li
                                key={option.value}
                                role="option"
                                aria-selected={isSelected}
                                onMouseEnter={() => setHighlight(index)}
                                onClick={() => choose(index)}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out motion-reduce:transition-none ${index === highlight
                                    ? "bg-teal-600/10 text-teal-600 dark:text-teal-400"
                                    : "text-slate-900 dark:text-slate-100"
                                    }`}
                            >
                                {option.label}
                                {isSelected && <Check className="h-4 w-4 text-teal-500" />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function RowActions({
    payer,
    t,
    isRtl,
    disabled,
    onEdit,
    onToggleStatus,
    onDelete,
}: {
    payer: PayerRow;
    t: Messages;
    isRtl: boolean;
    disabled: boolean;
    onEdit: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
        above: boolean;
    } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const { mounted, visible } = usePresence(open, MENU_MS);

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
        left = Math.min(
            Math.max(margin, left),
            window.innerWidth - width - margin,
        );

        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const above = !(height + gap <= spaceBelow || spaceBelow >= spaceAbove);

        let top = above ? rect.top - height - gap : rect.bottom + gap;

        top = Math.min(
            Math.max(margin, top),
            Math.max(margin, window.innerHeight - height - margin),
        );

        setPosition({ top, left, above });
    }, [isRtl]);

    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    // Reset only after the exit transition has finished, so the menu does not
    // vanish mid-animation.
    useEffect(() => {
        if (!mounted) setPosition(null);
    }, [mounted]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (
                menuRef.current?.contains(target) ||
                buttonRef.current?.contains(target)
            ) {
                return;
            }

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
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition-colors duration-150 ease-out motion-reduce:transition-none focus:outline-none";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((value) => !value)}
                className={`grid h-11 w-11 place-items-center rounded-lg border text-slate-600 transition duration-150 ease-out motion-reduce:transition-none active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 dark:text-slate-300 ${open
                    ? "border-teal-500 bg-teal-600/10 text-teal-500"
                    : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {mounted &&
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
                            transformOrigin: `${isRtl ? "left" : "right"} ${position?.above ? "bottom" : "top"
                                }`,
                        }}
                        className={`z-[150] w-60 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 shadow-2xl shadow-black/50 transition duration-150 ease-out motion-reduce:transition-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${visible
                            ? "scale-100 opacity-100"
                            : "pointer-events-none scale-95 opacity-0"
                            }`}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onEdit)}
                            className={`${itemBase} text-slate-900 hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400 dark:focus:text-teal-400`}
                        >
                            <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuEdit}
                        </button>

                        {payer.isActive ? (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => choose(onToggleStatus)}
                                className={`${itemBase} text-amber-600 hover:bg-amber-500/10 focus:bg-amber-500/10 dark:text-amber-400`}
                            >
                                <PowerOff className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                {t.menuDeactivate}
                            </button>
                        ) : (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => choose(onToggleStatus)}
                                className={`${itemBase} text-teal-600 hover:bg-teal-600/10 focus:bg-teal-600/10 dark:text-teal-400`}
                            >
                                <Power className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                {t.menuActivate}
                            </button>
                        )}

                        <div className="my-1.5 h-px bg-slate-200 dark:bg-slate-700/70" />

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onDelete)}
                            className={`${itemBase} text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 dark:text-rose-400`}
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

/** Placeholder rows shown only during the very first load. */
function SkeletonRows({ count }: { count: number }) {
    return (
        <>
            {Array.from({ length: count }, (_, index) => (
                <tr key={index} aria-hidden="true" className="animate-pulse">
                    <td className="px-6 py-4 align-middle">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                            <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-9 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-9 w-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                </tr>
            ))}
        </>
    );
}

/**
 * Table row with a fade-in on mount (new rows, page changes, first load) and a
 * fade-out while it is being removed.
 */
function AnimatedRow({
    leaving,
    pending,
    children,
}: {
    leaving: boolean;
    pending: boolean;
    children: ReactNode;
}) {
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => setEntered(true));
        });

        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, []);

    return (
        <tr
            className={`transition-[opacity,background-color] duration-200 ease-out motion-reduce:transition-none hover:bg-slate-100 dark:hover:bg-slate-800/30 ${leaving
                ? "pointer-events-none opacity-0"
                : entered
                    ? pending
                        ? "opacity-70"
                        : "opacity-100"
                    : "opacity-0"
                }`}
        >
            {children}
        </tr>
    );
}

function ToastView({
    toast,
    closeLabel,
    onDismiss,
}: {
    toast: ToastItem;
    closeLabel: string;
    onDismiss: (id: number) => void;
}) {
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => setEntered(true));
        });

        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, []);

    const shown = entered && !toast.leaving;

    return (
        <div
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/50 transition duration-200 ease-out motion-reduce:transition-none dark:bg-slate-900 ${toast.kind === "success" ? "border-teal-600/40" : "border-rose-500/40"
                } ${shown
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-2 scale-95 opacity-0"
                }`}
        >
            {toast.kind === "success" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
            ) : (
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500 dark:text-rose-400" />
            )}

            <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">
                {toast.message}
            </p>

            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={closeLabel}
                className="rounded-md p-1 text-slate-500 transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Add / Edit modal                                                           */
/* -------------------------------------------------------------------------- */

function validateForm(
    values: {
        nameAr: string;
        nameEn: string;
        nphiesPayerId: string;
        taxNumber: string;
    },
    t: Messages,
): PayerFieldErrors {
    const errors: PayerFieldErrors = {};

    if (!values.nameAr.trim() && !values.nameEn.trim()) {
        errors.nameEn = t.errNameRequired;
        errors.nameAr = t.errNameRequired;
    }

    const nphies = values.nphiesPayerId.replace(/\s+/g, "").toUpperCase();

    if (!nphies) {
        errors.nphiesPayerId = t.errNphiesRequired;
    } else if (!NPHIES_ID_PATTERN.test(nphies)) {
        errors.nphiesPayerId = t.errNphiesInvalid;
    }

    const tax = normalizeDigits(values.taxNumber).replace(/[\s-]/g, "");

    if (!tax) {
        errors.taxNumber = t.errTaxRequired;
    } else if (!TAX_NUMBER_PATTERN.test(tax)) {
        errors.taxNumber = t.errTaxInvalid;
    }

    return errors;
}

function PayerFormModal({
    payer,
    draft,
    initialErrors,
    initialFormError,
    visible,
    t,
    isRtl,
    onClose,
    onSubmit,
}: {
    payer: PayerRow | null;
    draft?: PayerFormInput;
    initialErrors?: PayerFieldErrors;
    initialFormError?: string;
    visible: boolean;
    t: Messages;
    isRtl: boolean;
    onClose: () => void;
    onSubmit: (input: PayerFormInput) => void;
}) {
    const isEdit = payer !== null;
    const uid = useId();
    const ids = {
        nameAr: `${uid}-name-ar`,
        nameEn: `${uid}-name-en`,
        nphies: `${uid}-nphies`,
        tax: `${uid}-tax`,
    };

    const [nameAr, setNameAr] = useState(draft?.nameAr ?? payer?.nameAr ?? "");
    const [nameEn, setNameEn] = useState(draft?.nameEn ?? payer?.nameEn ?? "");
    const [nphiesPayerId, setNphiesPayerId] = useState(
        draft?.nphiesPayerId ?? payer?.nphiesPayerId ?? "",
    );
    const [taxNumber, setTaxNumber] = useState(
        draft?.taxNumber ?? payer?.taxNumber ?? "",
    );
    const [isActive, setIsActive] = useState(
        draft?.isActive ?? payer?.isActive ?? true,
    );
    const [errors, setErrors] = useState<PayerFieldErrors>(initialErrors ?? {});
    const [formError, setFormError] = useState(initialFormError ?? "");
    const firstRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        firstRef.current?.focus({ preventScroll: true });

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && visible) onClose();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose, visible]);

    function clearError(field: keyof PayerFieldErrors) {
        setErrors((current) => {
            if (!current[field]) return current;

            const next = { ...current };
            delete next[field];
            return next;
        });
    }

    // Validation stays synchronous. Once it passes, the page applies the change
    // optimistically and this dialog animates out in the same frame.
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!visible) return;

        setFormError("");

        const clientErrors = validateForm(
            { nameAr, nameEn, nphiesPayerId, taxNumber },
            t,
        );

        if (Object.keys(clientErrors).length > 0) {
            setErrors(clientErrors);
            return;
        }

        setErrors({});

        onSubmit({
            nameAr: nameAr.trim(),
            nameEn: nameEn.trim(),
            nphiesPayerId: nphiesPayerId.replace(/\s+/g, "").toUpperCase(),
            taxNumber: normalizeDigits(taxNumber).replace(/[\s-]/g, ""),
            isActive,
        });
    }

    const titleId = `${uid}-title`;

    return (
        <div
            aria-hidden={!visible}
            className={`fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto p-4 transition duration-200 ease-out motion-reduce:transition-none ${visible
                ? "bg-slate-900/40 backdrop-blur-sm dark:bg-slate-950/80"
                : "pointer-events-none bg-slate-900/0 backdrop-blur-none dark:bg-slate-950/0"
                }`}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                className={`relative my-auto w-full max-w-[740px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 transition duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 sm:p-8 ${visible
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-3 scale-95 opacity-0"
                    }`}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t.close}
                    className="absolute end-5 top-5 rounded-lg p-1.5 text-slate-500 transition duration-150 ease-out motion-reduce:transition-none hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <X className="h-5 w-5" />
                </button>

                <h2
                    id={titleId}
                    className="pe-10 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                >
                    {isEdit ? t.modalEditTitle : t.modalAddTitle}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {isEdit ? t.modalEditSubtitle : t.modalSubtitle}
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-7">
                    <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">
                        <Field
                            label={t.nameAr}
                            htmlFor={ids.nameAr}
                            error={errors.nameAr}
                        >
                            <input
                                ref={firstRef}
                                id={ids.nameAr}
                                dir="rtl"
                                value={nameAr}
                                maxLength={120}
                                placeholder={t.nameArPlaceholder}
                                aria-invalid={Boolean(errors.nameAr)}
                                aria-describedby={errors.nameAr ? `${ids.nameAr}-error` : undefined}
                                onChange={(event) => {
                                    setNameAr(event.target.value);
                                    clearError("nameAr");
                                    clearError("nameEn");
                                }}
                                className={`${baseInput} ${errors.nameAr ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : ""
                                    }`}
                            />
                        </Field>

                        <Field
                            label={t.nameEn}
                            htmlFor={ids.nameEn}
                            error={errors.nameEn}
                        >
                            <input
                                id={ids.nameEn}
                                dir="ltr"
                                value={nameEn}
                                maxLength={120}
                                placeholder={t.nameEnPlaceholder}
                                aria-invalid={Boolean(errors.nameEn)}
                                aria-describedby={errors.nameEn ? `${ids.nameEn}-error` : undefined}
                                onChange={(event) => {
                                    setNameEn(event.target.value);
                                    clearError("nameEn");
                                    clearError("nameAr");
                                }}
                                className={`${baseInput} ${errors.nameEn ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : ""
                                    }`}
                            />
                        </Field>

                        <Field
                            label={t.nphiesLabel}
                            htmlFor={ids.nphies}
                            required
                            error={errors.nphiesPayerId}
                            help={t.nphiesHelp}
                        >
                            <input
                                id={ids.nphies}
                                dir="ltr"
                                value={nphiesPayerId}
                                maxLength={40}
                                placeholder={t.nphiesPlaceholder}
                                autoCapitalize="characters"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={Boolean(errors.nphiesPayerId)}
                                aria-describedby={
                                    errors.nphiesPayerId ? `${ids.nphies}-error` : undefined
                                }
                                onChange={(event) => {
                                    setNphiesPayerId(event.target.value.toUpperCase());
                                    clearError("nphiesPayerId");
                                }}
                                className={`${baseInput} ${errors.nphiesPayerId
                                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20"
                                    : ""
                                    }`}
                            />
                        </Field>

                        <Field
                            label={t.taxLabel}
                            htmlFor={ids.tax}
                            required
                            error={errors.taxNumber}
                            help={t.taxHelp}
                        >
                            <input
                                id={ids.tax}
                                dir="ltr"
                                inputMode="numeric"
                                value={taxNumber}
                                maxLength={15}
                                placeholder={t.taxPlaceholder}
                                autoComplete="off"
                                aria-invalid={Boolean(errors.taxNumber)}
                                aria-describedby={errors.taxNumber ? `${ids.tax}-error` : undefined}
                                onChange={(event) => {
                                    setTaxNumber(
                                        normalizeDigits(event.target.value)
                                            .replace(/\D/g, "")
                                            .slice(0, 15),
                                    );
                                    clearError("taxNumber");
                                }}
                                className={`${baseInput} ${errors.taxNumber ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : ""
                                    }`}
                            />
                        </Field>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-4">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {isEdit ? t.activeLabel : t.activeImmediately}
                        </span>
                        <Toggle
                            checked={isActive}
                            onChange={setIsActive}
                            label={isEdit ? t.activeLabel : t.activeImmediately}
                        />
                    </div>

                    {formError && (
                        <div
                            role="alert"
                            className="mt-5 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500 dark:text-rose-400"
                        >
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{formError}</p>
                        </div>
                    )}

                    <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-700/70">
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className={`${outlineButton} h-12 px-8`}
                            >
                                {t.cancel}
                            </button>

                            <button
                                type="submit"
                                className={`${tealButton} h-12 px-8`}
                            >
                                {isEdit ? t.saveChanges : t.save}
                            </button>
                        </div>
                    </div>
                </form>
            </section>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function InsurancePayersPage({ initialLocale,
}: InsurancePayersProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    /**
     * The complete payer list lives in memory. Search, status filtering and
     * pagination are derived from it locally, so they are instant and never
     * hit the server or show loading states.
     */
    const [allPayers, setAllPayers] = useState<PayerRow[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<PayerStatusFilter>("ALL");
    const [page, setPage] = useState(1);

    const [modal, setModal] = useState<ModalState>(null);
    const [deleteTarget, setDeleteTarget] = useState<PayerRow | null>(null);
    const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(
        () => new Set<string>(),
    );
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    // Always-fresh mirrors so background tasks never read stale closures.
    const tRef = useRef<Messages>(t);
    const payersRef = useRef<PayerRow[]>([]);
    const modalRef = useRef<ModalState>(null);
    const modalSeq = useRef(0);
    const requestCounter = useRef(0);
    const toastIdRef = useRef(0);
    const queueRef = useRef(new Map<string, Promise<void>>());
    const removalTimers = useRef(new Map<string, number>());
    // Keeps a row's React key stable when its temporary id becomes the real id,
    // so a freshly created row does not re-mount (and re-fade) on confirmation.
    const rowKeysRef = useRef(new Map<string, string>());

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    // Keeps typing responsive: the input updates immediately while the (cheap)
    // list filtering is allowed to lag a frame behind when needed.
    const deferredQuery = useDeferredValue(query);

    const modalPresence = useHeldValue(modal, MODAL_MS);
    const deletePresence = useHeldValue(deleteTarget, MODAL_MS);

    /* Locale sync (same approach as the dashboard) ------------------------- */
    useEffect(() => {
        const root = document.documentElement;

        const syncLocale = () => {
            setLocale(root.lang === "en" ? "en" : "ar");
        };

        syncLocale();

        const observer = new MutationObserver(syncLocale);
        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    /* Toasts ---------------------------------------------------------------- */
    const dismissNotice = useCallback((id: number) => {
        setToasts((current) =>
            current.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
        );
        window.setTimeout(() => {
            setToasts((current) => current.filter((item) => item.id !== id));
        }, TOAST_EXIT_MS);
    }, []);

    const pushNotice = useCallback(
        (notice: Notice): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [
                ...current.filter((item) => !item.leaving).slice(-(MAX_TOASTS - 1)),
                { ...notice, id, leaving: false },
            ]);
            window.setTimeout(() => dismissNotice(id), TOAST_MS);

            return id;
        },
        [dismissNotice],
    );

    /* Local data store ------------------------------------------------------ */

    // Single entry point for every local change: updates the ref synchronously
    // (so rapid actions always see the latest rows) and schedules the render.
    const updatePayers = useCallback(
        (updater: (current: PayerRow[]) => PayerRow[]): PayerRow[] => {
            const next = updater(payersRef.current);

            payersRef.current = next;
            setAllPayers(next);

            return next;
        },
        [],
    );

    // Server calls for the same row run strictly in order.
    const enqueue = useCallback((id: string, task: () => Promise<void>) => {
        const previous = queueRef.current.get(id) ?? Promise.resolve();
        const next: Promise<void> = previous
            .then(task)
            .catch(() => undefined)
            .then(() => {
                if (queueRef.current.get(id) === next) queueRef.current.delete(id);
            });

        queueRef.current.set(id, next);
    }, []);

    const setRemoving = useCallback((id: string, on: boolean) => {
        setRemovingIds((current) => {
            const next = new Set(current);

            if (on) next.add(id);
            else next.delete(id);

            return next;
        });
    }, []);

    /* Loading --------------------------------------------------------------- */
    const loadAll = useCallback(async () => {
        const requestId = ++requestCounter.current;

        setInitialLoading(true);
        setLoadError("");

        try {
            const result = await fetchAllPayers();

            if (requestId !== requestCounter.current) return;

            if ("rows" in result) {
                updatePayers((current) =>
                    sortPayers([
                        ...current.filter((item) => isTempId(item.id)),
                        ...result.rows,
                    ]),
                );
            } else {
                setLoadError(result.error ?? tRef.current.loadFailed);
                updatePayers(() => []);
            }
        } catch {
            if (requestId !== requestCounter.current) return;

            setLoadError(tRef.current.loadFailed);
            updatePayers(() => []);
        } finally {
            if (requestId === requestCounter.current) setInitialLoading(false);
        }
    }, [updatePayers]);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    // Silent reconciliation with the server, used only after a conflicting rollback.
    const resyncPayers = useCallback(async () => {
        try {
            const result = await fetchAllPayers();

            if ("rows" in result) {
                updatePayers((current) =>
                    sortPayers([
                        ...current.filter((item) => isTempId(item.id)),
                        ...result.rows,
                    ]),
                );
            }
        } catch {
            // Keep the current local state if the background sync fails.
        }
    }, [updatePayers]);

    /* Client-side search / filter / pagination ----------------------------- */
    const searchIndex = useMemo(
        () =>
            allPayers.map((payer) => ({
                payer,
                text: [
                    payer.nameEn,
                    payer.nameAr,
                    payer.nphiesPayerId ?? "",
                    payer.taxNumber ?? "",
                ]
                    .join(" ")
                    .toLocaleLowerCase(),
            })),
        [allPayers],
    );

    const filteredPayers = useMemo(() => {
        const needle = deferredQuery.trim().toLocaleLowerCase();
        const digitNeedle = normalizeDigits(needle);

        return searchIndex
            .filter(({ payer, text }) => {
                if (statusFilter === "ACTIVE" && !payer.isActive) return false;
                if (statusFilter === "INACTIVE" && payer.isActive) return false;

                if (!needle) return true;

                return text.includes(needle) || text.includes(digitNeedle);
            })
            .map(({ payer }) => payer);
    }, [searchIndex, deferredQuery, statusFilter]);

    const total = filteredPayers.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);

    const visiblePayers = useMemo(
        () =>
            filteredPayers.slice(
                (currentPage - 1) * PAGE_SIZE,
                currentPage * PAGE_SIZE,
            ),
        [filteredPayers, currentPage],
    );

    const statusOptions = useMemo(
        () =>
            [
                { value: "ALL", label: t.allStatuses },
                { value: "ACTIVE", label: t.active },
                { value: "INACTIVE", label: t.inactive },
            ] as const,
        [t.allStatuses, t.active, t.inactive],
    );

    const hasFilters = query.trim() !== "" || statusFilter !== "ALL";

    function resetFilters() {
        setQuery("");
        setStatusFilter("ALL");
        setPage(1);
    }

    /* Modal control --------------------------------------------------------- */
    const applyModal = useCallback((next: ModalState) => {
        modalRef.current = next;
        setModal(next);
    }, []);

    const openModal = useCallback(
        (request: ModalRequest) => {
            applyModal({ ...request, nonce: ++modalSeq.current } as NonNullable<ModalState>);
        },
        [applyModal],
    );

    const closeModal = useCallback(() => applyModal(null), [applyModal]);

    // After a failed background save the form comes back with the user's input and
    // the server's field errors, unless the user already opened something else.
    const reopenModal = useCallback(
        (request: ModalRequest) => {
            if (modalRef.current === null) openModal(request);
        },
        [openModal],
    );

    /* Optimistic mutations -------------------------------------------------- */
    function submitPayer(input: PayerFormInput) {
        const current = modalRef.current;

        // Dialog animates out immediately; the table is already updated below.
        closeModal();

        if (current?.mode === "edit") {
            const base =
                payersRef.current.find((item) => item.id === current.payer.id) ??
                current.payer;
            const optimistic = buildOptimisticPayer(input, base, base.id);

            updatePayers((list) =>
                list.map((item) => (item.id === base.id ? optimistic : item)),
            );

            const toastId = pushNotice({ kind: "success", message: t.updated });

            const failEdit = (message: string, fieldErrors?: PayerFieldErrors) => {
                dismissNotice(toastId);

                const next = updatePayers((list) =>
                    list.map((item) => (item === optimistic ? base : item)),
                );

                // A newer local change superseded this one: reconcile with the server.
                if (!next.includes(base)) void resyncPayers();

                pushNotice({ kind: "error", message });
                reopenModal({
                    mode: "edit",
                    payer: base,
                    draft: input,
                    fieldErrors,
                    formError: message,
                });
            };

            enqueue(base.id, async () => {
                try {
                    const result = await updatePayerAction({
                        ...input,
                        payerId: base.id,
                    });

                    if (!result.success || !result.data) {
                        failEdit(result.error ?? tRef.current.failed, result.fieldErrors);
                        return;
                    }

                    const confirmed = result.data.payer;

                    // Only replace the row if no newer optimistic change superseded it.
                    updatePayers((list) =>
                        list.map((item) => (item === optimistic ? confirmed : item)),
                    );
                } catch {
                    failEdit(tRef.current.failed);
                }
            });

            return;
        }

        const tempId = makeTempId();
        const optimistic = buildOptimisticPayer(input, null, tempId);

        updatePayers((list) => sortPayers([optimistic, ...list]));

        // Make sure the new row is visible even when filters would hide it.
        setQuery("");
        setStatusFilter("ALL");
        setPage(1);

        const toastId = pushNotice({ kind: "success", message: t.created });

        const failCreate = (message: string, fieldErrors?: PayerFieldErrors) => {
            dismissNotice(toastId);
            updatePayers((list) => list.filter((item) => item.id !== tempId));
            pushNotice({ kind: "error", message });
            reopenModal({
                mode: "create",
                draft: input,
                fieldErrors,
                formError: message,
            });
        };

        enqueue(tempId, async () => {
            try {
                const result = await createPayerAction(input);

                if (!result.success || !result.data) {
                    failCreate(result.error ?? tRef.current.failed, result.fieldErrors);
                    return;
                }

                const created = result.data.payer;

                rowKeysRef.current.set(created.id, tempId);
                updatePayers((list) =>
                    sortPayers(list.map((item) => (item.id === tempId ? created : item))),
                );
            } catch {
                failCreate(tRef.current.failed);
            }
        });
    }

    function handleToggleStatus(payer: PayerRow) {
        if (isTempId(payer.id)) return;

        const current = payersRef.current.find((item) => item.id === payer.id) ?? payer;
        const nextActive = !current.isActive;
        const optimistic: PayerRow = { ...current, isActive: nextActive };

        // The badge flips right away.
        updatePayers((list) =>
            list.map((item) => (item.id === current.id ? optimistic : item)),
        );

        const toastId = pushNotice({
            kind: "success",
            message: nextActive ? t.activated : t.deactivated,
        });

        const failToggle = (message: string) => {
            dismissNotice(toastId);

            const next = updatePayers((list) =>
                list.map((item) => (item === optimistic ? current : item)),
            );

            if (!next.includes(current)) void resyncPayers();

            pushNotice({ kind: "error", message });
        };

        enqueue(current.id, async () => {
            try {
                const result = await setPayerActiveStatusAction(current.id, nextActive);

                if (!result.success || !result.data) {
                    failToggle(result.error ?? tRef.current.failed);
                    return;
                }

                const confirmed = result.data.payer;

                updatePayers((list) =>
                    list.map((item) => (item === optimistic ? confirmed : item)),
                );
            } catch {
                failToggle(tRef.current.failed);
            }
        });
    }

    function confirmDelete() {
        const target = deleteTarget;

        if (!target || target.patientCount > 0) return;

        const snapshot =
            payersRef.current.find((item) => item.id === target.id) ?? target;

        // Dialog animates out and the row fades out immediately.
        setDeleteTarget(null);
        setRemoving(target.id, true);

        const toastId = pushNotice({ kind: "success", message: t.deleted });

        const timer = window.setTimeout(() => {
            removalTimers.current.delete(target.id);
            updatePayers((list) => list.filter((item) => item.id !== target.id));
            setRemoving(target.id, false);
        }, ROW_EXIT_MS);

        removalTimers.current.set(target.id, timer);

        const restore = (message: string) => {
            dismissNotice(toastId);

            const pending = removalTimers.current.get(target.id);

            if (pending !== undefined) {
                window.clearTimeout(pending);
                removalTimers.current.delete(target.id);
            }

            setRemoving(target.id, false);
            updatePayers((list) =>
                list.some((item) => item.id === snapshot.id)
                    ? list
                    : sortPayers([...list, snapshot]),
            );
            pushNotice({ kind: "error", message });
        };

        enqueue(target.id, async () => {
            try {
                const result = await deletePayerAction(target.id);

                // A record that is already gone on the server is the outcome we wanted.
                if (!result.success && result.code !== "RECORD_NOT_FOUND") {
                    restore(result.error ?? tRef.current.failed);
                }
            } catch {
                restore(tRef.current.failed);
            }
        });
    }

    /* Delete dialog: Escape ------------------------------------------------- */
    useEffect(() => {
        if (!deleteTarget) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setDeleteTarget(null);
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [deleteTarget]);

    /* Derived values -------------------------------------------------------- */
    const showingFrom = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, total);
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;
    const heldModal = modalPresence.held;
    const heldDelete = deletePresence.held;
    const deleteBlocked = (heldDelete?.patientCount ?? 0) > 0;

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref={ACTIVE_HREF}
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <main className="min-w-0 flex-1">
                    <AdminHeader
                        locale={locale}
                        onMenuOpen={() => setSidebarOpen(true)}
                    />

                    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <span>/</span>
                                    <span>{t.title}</span>
                                </div>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                                    {t.subtitle}
                                </p>
                            </div>

                            <button
                                type="button"
                                disabled={initialLoading}
                                onClick={() => openModal({ mode: "create" })}
                                className={`${tealButton} h-12 shrink-0 px-6 text-base`}
                            >
                                <Plus className="h-5 w-5" />
                                {t.add}
                            </button>
                        </header>

                        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1.9fr)_minmax(200px,1fr)_auto]">
                            <label className="relative block">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-300" />
                                <input
                                    value={query}
                                    onChange={(event) => {
                                        setQuery(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t.search}
                                    aria-label={t.search}
                                    className={`${baseInput} h-[54px] bg-white ps-12 dark:bg-slate-900/60`}
                                />
                            </label>

                            <StatusFilterSelect
                                value={statusFilter}
                                onChange={(next) => {
                                    setStatusFilter(next);
                                    setPage(1);
                                }}
                                options={statusOptions}
                                isRtl={isRtl}
                                ariaLabel={t.allStatuses}
                            />

                            <button
                                type="button"
                                title={t.resetFilters}
                                disabled={!hasFilters}
                                onClick={resetFilters}
                                className={`${outlineButton} h-[54px] bg-white px-6 dark:bg-slate-900/60`}
                            >
                                <Filter className="h-5 w-5" />
                                {t.filter}
                            </button>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/20 dark:border-slate-800 dark:bg-slate-900/60">
                            {loadError ? (
                                <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                                    <CircleAlert className="h-8 w-8 text-teal-500" />
                                    <p className="text-sm">{loadError}</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadAll()}
                                        className={tealButton}
                                    >
                                        {t.retry}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="overflow-x-auto"
                                        aria-busy={initialLoading}
                                    >
                                        <table className="w-full min-w-[900px] border-collapse text-start">
                                            <caption className="sr-only">
                                                {initialLoading ? t.loading : t.title}
                                            </caption>
                                            <thead>
                                                <tr className="border-b border-slate-200 bg-white text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                                                    <th className="px-6 py-5 text-start align-middle">
                                                        {t.colCompany}
                                                    </th>
                                                    <th className="px-4 py-5 text-start align-middle">
                                                        {t.colNphies}
                                                    </th>
                                                    <th className="px-4 py-5 text-start align-middle">
                                                        {t.colTax}
                                                    </th>
                                                    <th className="px-4 py-5 text-start align-middle">
                                                        {t.colStatus}
                                                    </th>
                                                    <th className="w-32 px-4 py-5 text-start align-middle">
                                                        {t.colActions}
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                                {initialLoading ? (
                                                    <SkeletonRows count={PAGE_SIZE} />
                                                ) : visiblePayers.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="h-56 text-center align-middle text-sm text-slate-500 dark:text-slate-400"
                                                        >
                                                            {hasFilters ? t.empty : t.emptyFirst}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    visiblePayers.map((payer) => {
                                                        const name = displayName(payer, locale);
                                                        const pending = isTempId(payer.id);
                                                        const rowKey =
                                                            rowKeysRef.current.get(payer.id) ?? payer.id;

                                                        return (
                                                            <AnimatedRow
                                                                key={rowKey}
                                                                leaving={removingIds.has(payer.id)}
                                                                pending={pending}
                                                            >
                                                                <td className="px-6 py-4 align-middle">
                                                                    <div className="flex items-center gap-4">
                                                                        <PayerAvatar
                                                                            key={payer.logoUrl ?? payer.id}
                                                                            payer={payer}
                                                                            name={name}
                                                                        />
                                                                        <p className="max-w-64 truncate text-base font-bold text-slate-900 dark:text-white">
                                                                            {name}
                                                                        </p>
                                                                    </div>
                                                                </td>

                                                                <td className="px-4 py-4 align-middle">
                                                                    {payer.nphiesPayerId ? (
                                                                        <span
                                                                            dir="ltr"
                                                                            className="inline-block rounded-lg bg-teal-600/10 px-4 py-2 text-sm font-semibold text-teal-700 dark:text-teal-300"
                                                                        >
                                                                            {payer.nphiesPayerId}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-500">—</span>
                                                                    )}
                                                                </td>

                                                                <td className="px-4 py-4 align-middle text-base text-slate-900 dark:text-slate-100">
                                                                    {payer.taxNumber ? (
                                                                        <span dir="ltr">{payer.taxNumber}</span>
                                                                    ) : (
                                                                        <span className="text-slate-500">—</span>
                                                                    )}
                                                                </td>

                                                                <td className="px-4 py-4 align-middle">
                                                                    <StatusBadge isActive={payer.isActive} t={t} />
                                                                </td>

                                                                <td className="px-4 py-4 align-middle">
                                                                    <RowActions
                                                                        payer={payer}
                                                                        t={t}
                                                                        isRtl={isRtl}
                                                                        disabled={pending}
                                                                        onEdit={() => openModal({ mode: "edit", payer })}
                                                                        onToggleStatus={() => handleToggleStatus(payer)}
                                                                        onDelete={() => setDeleteTarget(payer)}
                                                                    />
                                                                </td>
                                                            </AnimatedRow>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {t.showing}{" "}
                                            <strong className="text-slate-900 dark:text-slate-100">
                                                {showingFrom}–{showingTo}
                                            </strong>{" "}
                                            {t.of}{" "}
                                            <strong className="text-slate-900 dark:text-slate-100">
                                                {total}
                                            </strong>{" "}
                                            {t.payers}
                                        </p>

                                        <nav aria-label={t.pagination} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={t.previous}
                                                disabled={currentPage <= 1}
                                                onClick={() => setPage(Math.max(1, currentPage - 1))}
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition duration-150 ease-out motion-reduce:transition-none hover:border-teal-500 hover:text-teal-500 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                            >
                                                <PrevIcon className="h-4 w-4" />
                                            </button>

                                            {pageWindow(currentPage, totalPages).map((pageNumber) => (
                                                <button
                                                    type="button"
                                                    key={pageNumber}
                                                    aria-current={pageNumber === currentPage ? "page" : undefined}
                                                    onClick={() => setPage(pageNumber)}
                                                    className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-semibold transition duration-150 ease-out motion-reduce:transition-none active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 ${pageNumber === currentPage
                                                        ? "border-teal-600 bg-teal-600 text-white hover:bg-teal-500"
                                                        : "border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200"
                                                        }`}
                                                >
                                                    {pageNumber}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                aria-label={t.next}
                                                disabled={currentPage >= totalPages}
                                                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition duration-150 ease-out motion-reduce:transition-none hover:border-teal-500 hover:text-teal-500 active:scale-95 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
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

            {heldModal && (
                <PayerFormModal
                    key={`${heldModal.mode}-${heldModal.nonce}`}
                    payer={heldModal.mode === "edit" ? heldModal.payer : null}
                    draft={heldModal.draft}
                    initialErrors={heldModal.fieldErrors}
                    initialFormError={heldModal.formError}
                    visible={modalPresence.visible}
                    t={t}
                    isRtl={isRtl}
                    onClose={closeModal}
                    onSubmit={submitPayer}
                />
            )}

            {heldDelete && (
                <div
                    aria-hidden={!deletePresence.visible}
                    className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition duration-200 ease-out motion-reduce:transition-none ${deletePresence.visible
                        ? "bg-slate-900/40 backdrop-blur-sm dark:bg-slate-950/80"
                        : "pointer-events-none bg-slate-900/0 backdrop-blur-none dark:bg-slate-950/0"
                        }`}
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setDeleteTarget(null);
                        }
                    }}
                >
                    <section
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="delete-payer-title"
                        dir={isRtl ? "rtl" : "ltr"}
                        className={`w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 transition duration-200 ease-out motion-reduce:transition-none dark:border-slate-700 dark:bg-slate-900 ${deletePresence.visible
                            ? "translate-y-0 scale-100 opacity-100"
                            : "translate-y-3 scale-95 opacity-0"
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400">
                                <Trash2 className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                                <h2
                                    id="delete-payer-title"
                                    className="text-lg font-bold text-slate-900 dark:text-white"
                                >
                                    {t.deleteTitle}
                                </h2>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {displayName(heldDelete, locale)}
                                </p>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {t.deleteBody}
                                </p>
                            </div>
                        </div>

                        {deleteBlocked && (
                            <div
                                role="alert"
                                className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{t.deleteBlocked(heldDelete.patientCount)}</p>
                            </div>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className={`${outlineButton} h-11 px-6`}
                            >
                                {t.cancel}
                            </button>

                            <button
                                type="button"
                                disabled={deleteBlocked}
                                onClick={confirmDelete}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 text-sm font-semibold text-white transition duration-150 ease-out motion-reduce:transition-none hover:bg-rose-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t.deleteConfirm}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed bottom-6 end-6 z-[200] flex flex-col items-end gap-3"
            >
                {toasts.map((toast) => (
                    <ToastView
                        key={toast.id}
                        toast={toast}
                        closeLabel={t.close}
                        onDismiss={dismissNotice}
                    />
                ))}
            </div>
        </div>
    );
}