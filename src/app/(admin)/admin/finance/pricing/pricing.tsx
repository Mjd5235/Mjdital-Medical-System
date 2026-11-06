"use client";

/**
 * Pricing & Taxes — /admin/finance/pricing/page.tsx
 *
 * Performance notes
 * -----------------
 * - Every mutation (create, edit, toggle, delete) updates the table in the same frame and syncs with
 *   the server in the background. A failed request restores the previous state and shows an error toast.
 * - Server calls are serialised per service (queue), so rapid clicks never race. Contract prices that
 *   are still being created use a temporary id; queued follow-up actions resolve it to the real id.
 * - Server responses are merged field-by-field (never replacing a whole row), so they can never
 *   overwrite newer optimistic changes made while the request was in flight.
 * - All filtering, searching and paging run client-side on in-memory data: zero network latency.
 * - No router.refresh() and no blocking spinners.
 */

import {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
    Baby,
    Calculator,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CircleDollarSign,
    FilterX,
    FlaskConical,
    HeartPulse,
    MoreHorizontal,
    Pause,
    Pencil,
    Play,
    Plus,
    Scan,
    Search,
    ShieldCheck,
    Smile,
    Stethoscope,
    Syringe,
    Tag,
    Trash2,
    X,
    type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createServicePriceAction,
    deleteServicePriceAction,
    getPricingDataAction,
    toggleServicePriceAction,
    updateServicePriceAction,
    type PriceListType,
    type PricingActionResult,
    type PricingClinicOption,
    type PricingContractPrice,
    type PricingPolicyOption,
    type PricingServiceRow,
    type VatCategoryValue,
} from "./actions";

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 4;
const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const MODAL_MS = 200;
const TEMP_PREFIX = "tmp-";
const VISIBLE_CONTRACTS = 2;
const ACTIVE_HREF = "/admin/finance/pricing";

const VAT_RATES: Record<VatCategoryValue, number> = {
    STANDARD: 15,
    CITIZEN_MEDICAL_EXEMPT: 0,
};

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* -------------------------------------------------------------------------- */
/*                                    i18n                                    */
/* -------------------------------------------------------------------------- */

const en = {
    breadcrumbRoot: "Pricing & Taxes",
    breadcrumbCurrent: "Service Pricing",
    title: "Pricing & Taxes",
    subtitle: "Manage cash and insurance service price lists and configure VAT for medical services.",
    add: "Add Price List / Custom Price",
    search: "Search by service name or code",
    allPriceLists: "All Price Lists",
    priceListHint: "Cash / Insurance",
    cashOnly: "Cash only",
    insuranceAny: "Insurance contracts",
    allClinics: "All Clinics",
    resetFilters: "Reset Filters",
    colService: "Service",
    colBase: "Base Cash Price",
    colContracts: "Contract Prices",
    colVat: "VAT",
    colActions: "Actions",
    vatBadge: "15% VAT",
    vatExempt: "0% Exempt",
    exemptNote: "Citizen medical exemption",
    noContracts: "No contract prices",
    paused: "Paused",
    sar: "SAR",
    more: (count: number) => `+${count} more`,
    showing: (from: number, to: number, total: number) =>
        `Showing ${from}–${to} of ${total} services`,
    showingNone: "No services to show",
    loading: "Loading pricing",
    retry: "Try again",
    loadFailed: "Unable to load pricing data. Please try again.",
    emptyTitle: "No services match your filters",
    emptyBody: "Try a different search or reset the filters to see every service.",
    previousPage: "Previous page",
    nextPage: "Next page",
    page: "Page",
    rowActions: "Row actions",
    menuEditCash: "Edit cash price & VAT",
    menuAddContract: "Add contract price",
    menuContracts: "Contract prices",
    menuEdit: "Edit",
    menuActivate: "Activate",
    menuDeactivate: "Deactivate",
    menuDelete: "Delete",
    modalAddTitle: "Add Service Pricing",
    modalEditTitle: "Edit Service Pricing",
    modalSubtitle: "Set the service price, payer contract, and applicable VAT.",
    medicalService: "Medical Service",
    selectService: "Select a medical service",
    priceListType: "Price List Type",
    cash: "Cash",
    insurance: "Insurance Contract",
    payerContract: "Insurance Payer & Contract",
    selectContract: "Select a payer & contract",
    noContractsForService: "No available contracts for this service's clinic",
    priceExVat: "Price Excluding VAT",
    vatRate: "VAT Rate",
    vatStandard: "15% Standard VAT",
    vatExemptOption: "0% Citizen Medical Exemption",
    finalPrice: "Final Price Including VAT",
    savePriceList: "Save Price List",
    cancel: "Cancel",
    close: "Close",
    errService: "Select a medical service.",
    errContract: "Select an insurance payer & contract.",
    errPrice: "Enter a valid price (up to 2 decimals).",
    deleteTitle: "Delete contract price?",
    deleteBody: (name: string) =>
        `This removes the contract price "${name}". Invoices that were already issued are not affected.`,
    deleteConfirm: "Delete price",
    saved: "Price saved.",
    activated: "Contract price activated.",
    deactivated: "Contract price deactivated.",
    deleted: "Contract price deleted.",
    failed: "The change could not be saved and was reverted.",
};

type Messages = typeof en;

const ar: Messages = {
    breadcrumbRoot: "الأسعار والضرائب",
    breadcrumbCurrent: "أسعار الخدمات",
    title: "الأسعار والضرائب",
    subtitle: "إدارة قوائم أسعار الخدمات النقدية والتأمينية وضبط ضريبة القيمة المضافة للخدمات الطبية.",
    add: "إضافة قائمة أسعار / سعر مخصص",
    search: "ابحث باسم الخدمة أو رمزها",
    allPriceLists: "جميع قوائم الأسعار",
    priceListHint: "نقدي / تأمين",
    cashOnly: "نقدي فقط",
    insuranceAny: "عقود التأمين",
    allClinics: "جميع العيادات",
    resetFilters: "إعادة ضبط الفلاتر",
    colService: "الخدمة",
    colBase: "سعر الكاش الأساسي",
    colContracts: "أسعار العقود",
    colVat: "الضريبة",
    colActions: "الإجراءات",
    vatBadge: "ضريبة 15%",
    vatExempt: "معفاة 0%",
    exemptNote: "إعفاء طبي للمواطنين",
    noContracts: "لا توجد أسعار عقود",
    paused: "متوقف",
    sar: "ر.س",
    more: (count: number) => `+${count} أخرى`,
    showing: (from: number, to: number, total: number) =>
        `عرض ${from}–${to} من ${total} خدمة`,
    showingNone: "لا توجد خدمات للعرض",
    loading: "جارٍ تحميل الأسعار",
    retry: "إعادة المحاولة",
    loadFailed: "تعذر تحميل بيانات الأسعار. حاول مرة أخرى.",
    emptyTitle: "لا توجد خدمات تطابق الفلاتر",
    emptyBody: "جرّب بحثاً مختلفاً أو أعد ضبط الفلاتر لعرض كل الخدمات.",
    previousPage: "الصفحة السابقة",
    nextPage: "الصفحة التالية",
    page: "صفحة",
    rowActions: "إجراءات الصف",
    menuEditCash: "تعديل سعر الكاش والضريبة",
    menuAddContract: "إضافة سعر عقد",
    menuContracts: "أسعار العقود",
    menuEdit: "تعديل",
    menuActivate: "تفعيل",
    menuDeactivate: "إيقاف",
    menuDelete: "حذف",
    modalAddTitle: "إضافة تسعير خدمة",
    modalEditTitle: "تعديل تسعير خدمة",
    modalSubtitle: "حدد سعر الخدمة وعقد جهة الدفع وضريبة القيمة المضافة المطبقة.",
    medicalService: "الخدمة الطبية",
    selectService: "اختر خدمة طبية",
    priceListType: "نوع قائمة الأسعار",
    cash: "نقدي",
    insurance: "عقد تأمين",
    payerContract: "شركة التأمين والعقد",
    selectContract: "اختر شركة التأمين والعقد",
    noContractsForService: "لا توجد عقود متاحة لعيادة هذه الخدمة",
    priceExVat: "السعر قبل الضريبة",
    vatRate: "نسبة الضريبة",
    vatStandard: "15% ضريبة قياسية",
    vatExemptOption: "0% إعفاء طبي للمواطنين",
    finalPrice: "السعر النهائي شامل الضريبة",
    savePriceList: "حفظ قائمة الأسعار",
    cancel: "إلغاء",
    close: "إغلاق",
    errService: "اختر خدمة طبية.",
    errContract: "اختر شركة التأمين والعقد.",
    errPrice: "أدخل سعراً صحيحاً (حتى خانتين عشريتين).",
    deleteTitle: "حذف سعر العقد؟",
    deleteBody: (name: string) =>
        `سيتم حذف سعر العقد "${name}". الفواتير التي صدرت مسبقاً لا تتأثر.`,
    deleteConfirm: "حذف السعر",
    saved: "تم حفظ السعر.",
    activated: "تم تفعيل سعر العقد.",
    deactivated: "تم إيقاف سعر العقد.",
    deleted: "تم حذف سعر العقد.",
    failed: "تعذر حفظ التغيير وتمت إعادته.",
};

const messages: Record<Locale, Messages> = { en, ar } as Record<Locale, Messages>;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */


type PricingTaxesProps = {
    initialLocale: Locale;
};

type Notice = { kind: "success" | "error"; message: string };
type ToastItem = Notice & { id: number };

type PriceFormValues = {
    serviceId: string;
    priceType: PriceListType;
    policyId: string;
    priceExVat: string;
    vatCategory: VatCategoryValue;
};

type SubmitValues = PriceFormValues & {
    mode: "create" | "edit";
    priceId: string | null;
};

type ModalState =
    | { mode: "create"; serviceId?: string; priceType?: PriceListType }
    | { mode: "edit"; serviceId: string; priceType: PriceListType; priceId: string | null };

type DeleteTarget = { serviceId: string; priceId: string; label: string };

type SelectOption = { value: string; label: string; hint?: string };

const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-150 hover:border-teal-500 hover:text-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

function pickName(locale: Locale, en: string, ar?: string | null): string {
    return locale === "ar" && ar ? ar : en;
}

function toCents(value: string): number | null {
    const normalized = value.trim().replace(/,/g, "");

    if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) return null;

    const [whole = "0", fraction = ""] = normalized.split(".");
    const cents = parseInt(whole, 10) * 100 + parseInt((fraction + "00").slice(0, 2), 10);

    return cents > 0 ? cents : null;
}

/** Integer half-up rounding, identical to the server's decimal ROUND_HALF_UP. */
function inclusiveCents(cents: number, ratePercent: number): number {
    return Math.floor((cents * (100 + ratePercent) + 50) / 100);
}

function centsToString(cents: number): string {
    return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const wholeMoneyFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

function formatMoney(value: string, trimWhole = false): string {
    const amount = Number(value);

    if (!Number.isFinite(amount)) return value;

    return trimWhole && Number.isInteger(amount)
        ? wholeMoneyFormatter.format(amount)
        : moneyFormatter.format(amount);
}

function contractLabel(contract: PricingContractPrice, locale: Locale): string {
    const provider = pickName(locale, contract.providerNameEn, contract.providerNameAr);
    const policy = pickName(locale, contract.policyNameEn, contract.policyNameAr);

    return policy.toLowerCase().startsWith(provider.toLowerCase())
        ? policy
        : `${provider} ${policy}`;
}

function policyLabel(policy: PricingPolicyOption, locale: Locale): string {
    const provider = pickName(locale, policy.providerNameEn, policy.providerNameAr);
    const name = pickName(locale, policy.nameEn, policy.nameAr);

    return `${provider} — ${name}`;
}

function serviceVisual(service: PricingServiceRow): { Icon: LucideIcon; tone: string } {
    const text =
        `${service.specialty ?? ""} ${service.clinicNameEn} ${service.nameEn}`.toLowerCase();

    if (/dental|dentist|tooth|teeth|dent/.test(text)) return { Icon: Smile, tone: "bg-violet-500" };
    if (/lab|blood|cbc|patholog/.test(text)) return { Icon: FlaskConical, tone: "bg-emerald-500" };
    if (/pediatric|paediatric|child|baby/.test(text)) return { Icon: Baby, tone: "bg-orange-500" };
    if (/radiolog|ultrasound|x-ray|xray|imaging|mri|scan/.test(text)) return { Icon: Scan, tone: "bg-sky-600" };
    if (/vaccin|inject|immuniz/.test(text)) return { Icon: Syringe, tone: "bg-rose-500" };
    if (/cardio|heart/.test(text)) return { Icon: HeartPulse, tone: "bg-rose-500" };

    return { Icon: Stethoscope, tone: "bg-teal-500" };
}

/* -------------------------------------------------------------------------- */
/*                                 UI primitives                              */
/* -------------------------------------------------------------------------- */

function Select({
    value,
    onChange,
    options,
    placeholder,
    ariaLabel,
    disabled = false,
    invalid = false,
    isRtl,
    filter = false,
    className = "",
}: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder: string;
    ariaLabel: string;
    disabled?: boolean;
    invalid?: boolean;
    isRtl: boolean;
    filter?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [entered, setEntered] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const listId = useId();
    const selected = options.find((option) => option.value === value);

    const place = useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect();

        if (!rect) return;

        const menuHeight = Math.min(menuRef.current?.offsetHeight ?? 256, 256);
        const spaceBelow = window.innerHeight - rect.bottom;
        const flip = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;

        setPosition({
            top: flip ? rect.top - menuHeight - 6 : rect.bottom + 6,
            left: rect.left,
            width: rect.width,
        });
    }, []);

    useIsoLayoutEffect(() => {
        if (open) place();
    }, [open, place, options.length]);

    useEffect(() => {
        if (!open) {
            setEntered(false);
            return;
        }

        const frame = requestAnimationFrame(() => setEntered(true));

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;

            if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
                setOpen(false);
            }
        };

        const onScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            setOpen(false);
        };

        const onResize = () => setOpen(false);

        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        menuRef.current
            ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    const openMenu = () => {
        if (disabled) return;

        setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
        setOpen(true);
    };

    const choose = (index: number) => {
        const option = options[index];

        if (option) onChange(option.value);

        setOpen(false);
        buttonRef.current?.focus();
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;

        if (!open) {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                openMenu();
            }

            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                setActiveIndex((index) => Math.min(options.length - 1, index + 1));
                break;
            case "ArrowUp":
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (activeIndex >= 0) choose(activeIndex);
                break;
            case "Escape":
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                break;
            case "Tab":
                setOpen(false);
                break;
            default:
                break;
        }
    };

    return (
        <span className="relative block">
            <button
                ref={buttonRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openMenu())}
                onKeyDown={handleKeyDown}
                className={`${baseInput} flex cursor-pointer items-center pe-10 text-start ${filter ? "h-[54px] ps-4" : ""
                    } ${open ? "border-teal-500 ring-2 ring-teal-500/20" : ""} ${invalid ? "border-rose-500" : ""
                    } ${className}`}
            >
                <span className="block min-w-0 flex-1">
                    <span
                        className={`block truncate ${selected ? "" : "text-slate-500 dark:text-slate-400"
                            } ${filter && selected?.hint ? "text-[15px] font-medium leading-tight" : ""}`}
                    >
                        {selected ? selected.label : placeholder}
                    </span>
                    {filter && selected?.hint && (
                        <span className="mt-0.5 block truncate text-xs leading-tight text-slate-500 dark:text-slate-400">
                            {selected.hint}
                        </span>
                    )}
                </span>
            </button>

            <ChevronDown
                className={`pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform duration-150 dark:text-slate-300 ${open ? "rotate-180" : ""
                    }`}
            />

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel}
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            width: position?.width ?? buttonRef.current?.offsetWidth,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className={`z-[170] max-h-64 origin-top overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-900 shadow-2xl shadow-black/50 transition-[opacity,transform] duration-150 ease-out dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
                            }`}
                    >
                        {options.length === 0 && (
                            <div className="px-3 py-2.5 text-slate-500 dark:text-slate-400">—</div>
                        )}

                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            const isActive = index === activeIndex;

                            return (
                                <div
                                    key={option.value}
                                    role="option"
                                    aria-selected={isSelected}
                                    data-index={index}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => choose(index)}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-start font-medium transition-colors duration-150 ${isActive
                                        ? "bg-teal-600 text-white"
                                        : isSelected
                                            ? "text-teal-600 dark:text-teal-400"
                                            : "text-slate-900 dark:text-slate-100"
                                        }`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate">{option.label}</span>
                                        {option.hint && (
                                            <span
                                                className={`block truncate text-xs font-normal ${isActive ? "text-teal-100" : "text-slate-500 dark:text-slate-400"
                                                    }`}
                                            >
                                                {option.hint}
                                            </span>
                                        )}
                                    </span>
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

function ModalShell({
    onClosed,
    labelId,
    maxWidth = "max-w-[640px]",
    isRtl,
    children,
}: {
    onClosed: () => void;
    labelId: string;
    maxWidth?: string;
    isRtl: boolean;
    children: (requestClose: () => void) => ReactNode;
}) {
    const [visible, setVisible] = useState(false);
    const closingRef = useRef(false);
    const timerRef = useRef<number | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const onClosedRef = useRef(onClosed);

    // Always call the latest onClosed without re-creating requestClose.
    useEffect(() => {
        onClosedRef.current = onClosed;
    });

    // Stable identity: parent re-renders (optimistic updates) can no longer cancel the close timer.
    const requestClose = useCallback(() => {
        if (closingRef.current) return;

        closingRef.current = true;
        setVisible(false);
        timerRef.current = window.setTimeout(() => onClosedRef.current(), MODAL_MS);
    }, []);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setVisible(true);
            dialogRef.current?.focus();
        });
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };

        window.addEventListener("keydown", onKeyDown);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [requestClose]);

    // Clear the pending close timer only when the modal is really unmounted.
    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        },
        [],
    );

    return createPortal(
        <div
            dir={isRtl ? "rtl" : "ltr"}
            className="fixed inset-0 z-[150] flex items-center justify-center p-4"
        >
            <div
                aria-hidden="true"
                onClick={requestClose}
                className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"
                    }`}
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelId}
                tabIndex={-1}
                className={`relative max-h-[calc(100vh-2rem)] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 outline-none transition-all duration-200 ease-out dark:border-slate-800 dark:bg-slate-900 sm:p-8 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
                    }`}
            >
                {children(requestClose)}
            </div>
        </div>,
        document.body,
    );
}

function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
            {children}
        </label>
    );
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null;

    return <p className="mt-1.5 text-xs font-medium text-rose-500">{message}</p>;
}

/* -------------------------------------------------------------------------- */
/*                              Add / Edit price modal                        */
/* -------------------------------------------------------------------------- */

function PricingModal({
    state,
    services,
    policies,
    t,
    locale,
    isRtl,
    onClosed,
    onSubmit,
}: {
    state: ModalState;
    services: PricingServiceRow[];
    policies: PricingPolicyOption[];
    t: Messages;
    locale: Locale;
    isRtl: boolean;
    onClosed: () => void;
    onSubmit: (values: SubmitValues) => void;
}) {
    const titleId = useId();
    const isEdit = state.mode === "edit";

    const [serviceId, setServiceId] = useState(state.serviceId ?? "");
    const [priceType, setPriceType] = useState<PriceListType>(state.priceType ?? "INSURANCE");
    const [policyId, setPolicyId] = useState(() => {
        if (state.mode !== "edit" || state.priceType !== "INSURANCE") return "";

        const service = services.find((item) => item.id === state.serviceId);

        return service?.contracts.find((contract) => contract.id === state.priceId)?.policyId ?? "";
    });
    const [priceInput, setPriceInput] = useState(() => {
        if (state.mode !== "edit") return "";

        const service = services.find((item) => item.id === state.serviceId);

        if (!service) return "";

        if (state.priceType === "CASH") return service.basePrice;

        return service.contracts.find((contract) => contract.id === state.priceId)?.priceExVat ?? "";
    });
    const [vatCategory, setVatCategory] = useState<VatCategoryValue>(() => {
        if (state.mode !== "edit") return "STANDARD";

        const service = services.find((item) => item.id === state.serviceId);

        if (!service) return "STANDARD";

        if (state.priceType === "CASH") return service.vatCategory;

        return (
            service.contracts.find((contract) => contract.id === state.priceId)?.vatCategory ??
            "STANDARD"
        );
    });
    const [touchedPrice, setTouchedPrice] = useState(isEdit);
    const [submitted, setSubmitted] = useState(false);

    const service = services.find((item) => item.id === serviceId);

    const serviceOptions = useMemo<SelectOption[]>(
        () =>
            services.map((item) => ({
                value: item.id,
                label: `${pickName(locale, item.nameEn, item.nameAr)} — ${pickName(
                    locale,
                    item.clinicNameEn,
                    item.clinicNameAr,
                )} (${item.code})`,
            })),
        [services, locale],
    );

    const contractOptions = useMemo<SelectOption[]>(() => {
        if (!service) return [];

        return policies
            .filter(
                (policy) =>
                    policy.clinicId === service.clinicId &&
                    (isEdit || !service.contracts.some((contract) => contract.policyId === policy.id)),
            )
            .map((policy) => ({ value: policy.id, label: policyLabel(policy, locale) }));
    }, [policies, service, isEdit, locale]);

    const vatOptions = useMemo<SelectOption[]>(
        () => [
            { value: "STANDARD", label: t.vatStandard },
            { value: "CITIZEN_MEDICAL_EXEMPT", label: t.vatExemptOption },
        ],
        [t],
    );

    const prefillFromService = (target: PricingServiceRow | undefined, type: PriceListType) => {
        if (!target || type !== "CASH" || touchedPrice) return;

        setPriceInput(target.basePrice);
        setVatCategory(target.vatCategory);
    };

    const changeService = (id: string) => {
        setServiceId(id);
        setPolicyId("");
        prefillFromService(
            services.find((item) => item.id === id),
            priceType,
        );
    };

    const changeType = (type: PriceListType) => {
        setPriceType(type);
        setPolicyId("");
        prefillFromService(service, type);
    };

    const cents = toCents(priceInput);
    const rate = VAT_RATES[vatCategory];
    const finalCents = cents === null ? 0 : inclusiveCents(cents, rate);

    const errors = {
        service: !service ? t.errService : undefined,
        contract: priceType === "INSURANCE" && !policyId ? t.errContract : undefined,
        price: cents === null ? t.errPrice : undefined,
    };

    const submit = (requestClose: () => void) => {
        setSubmitted(true);

        if (errors.service || errors.contract || errors.price || cents === null) return;

        onSubmit({
            mode: isEdit ? "edit" : "create",
            priceId: state.mode === "edit" ? state.priceId : null,
            serviceId,
            priceType,
            policyId,
            priceExVat: centsToString(cents),
            vatCategory,
        });
        requestClose();
    };

    return (
        <ModalShell onClosed={onClosed} labelId={titleId} isRtl={isRtl}>
            {(requestClose) => (
                <div>
                    <button
                        type="button"
                        onClick={requestClose}
                        aria-label={t.close}
                        className="absolute end-4 top-4 rounded-lg p-2 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <h2
                        id={titleId}
                        className="pe-10 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                    >
                        {isEdit ? t.modalEditTitle : t.modalAddTitle}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t.modalSubtitle}</p>

                    <div className="mt-6 space-y-5">
                        <div>
                            <FieldLabel>{t.medicalService}</FieldLabel>
                            <Select
                                value={serviceId}
                                onChange={changeService}
                                options={serviceOptions}
                                placeholder={t.selectService}
                                ariaLabel={t.medicalService}
                                disabled={isEdit}
                                invalid={submitted && !!errors.service}
                                isRtl={isRtl}
                            />
                            {submitted && <FieldError message={errors.service} />}
                        </div>

                        <div>
                            <FieldLabel>{t.priceListType}</FieldLabel>
                            <div className="grid grid-cols-2 gap-3" role="group" aria-label={t.priceListType}>
                                {(
                                    [
                                        { value: "CASH", label: t.cash, Icon: CircleDollarSign },
                                        { value: "INSURANCE", label: t.insurance, Icon: ShieldCheck },
                                    ] as const
                                ).map(({ value, label, Icon }) => {
                                    const active = priceType === value;

                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={active}
                                            disabled={isEdit}
                                            onClick={() => changeType(value)}
                                            className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed ${active
                                                ? "border-teal-500 bg-teal-600/10 text-teal-600 dark:text-teal-300"
                                                : "border-slate-200 text-slate-700 hover:border-teal-500/60 dark:border-slate-700 dark:text-slate-200"
                                                } ${isEdit && !active ? "opacity-50" : ""}`}
                                        >
                                            <Icon className="h-5 w-5" />
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {priceType === "INSURANCE" && (
                            <div>
                                <FieldLabel>{t.payerContract}</FieldLabel>
                                <Select
                                    value={policyId}
                                    onChange={setPolicyId}
                                    options={contractOptions}
                                    placeholder={
                                        service && contractOptions.length === 0
                                            ? t.noContractsForService
                                            : t.selectContract
                                    }
                                    ariaLabel={t.payerContract}
                                    disabled={isEdit || !service}
                                    invalid={submitted && !!errors.contract}
                                    isRtl={isRtl}
                                />
                                {submitted && <FieldError message={errors.contract} />}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="price-ex-vat">{t.priceExVat}</FieldLabel>
                                <div className="relative">
                                    <input
                                        id="price-ex-vat"
                                        dir="ltr"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={priceInput}
                                        onChange={(event) => {
                                            setTouchedPrice(true);
                                            setPriceInput(event.target.value.replace(/[^\d.,]/g, ""));
                                        }}
                                        placeholder="0.00"
                                        aria-invalid={submitted && !!errors.price}
                                        className={`${baseInput} pe-16 text-start ${submitted && errors.price ? "border-rose-500" : ""
                                            }`}
                                    />
                                    <span className="pointer-events-none absolute end-0 top-0 flex h-full w-14 items-center justify-center border-s border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                                        {t.sar}
                                    </span>
                                </div>
                                {submitted && <FieldError message={errors.price} />}
                            </div>

                            <div>
                                <FieldLabel>{t.vatRate}</FieldLabel>
                                <Select
                                    value={vatCategory}
                                    onChange={(value) => setVatCategory(value as VatCategoryValue)}
                                    options={vatOptions}
                                    placeholder={t.vatRate}
                                    ariaLabel={t.vatRate}
                                    isRtl={isRtl}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 rounded-xl border border-teal-500/40 bg-teal-600/5 p-4">
                            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-teal-600/10 text-teal-500">
                                <Calculator className="h-7 w-7" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    {t.finalPrice}
                                </p>
                                <p
                                    dir="ltr"
                                    className="mt-0.5 truncate text-3xl font-extrabold tracking-tight text-teal-600 dark:text-teal-400"
                                >
                                    {formatMoney(centsToString(finalCents))} {t.sar}
                                </p>
                                <p dir="ltr" className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                                    {formatMoney(cents === null ? "0" : centsToString(cents))} {t.sar} + {rate}% VAT
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-7 flex flex-col-reverse justify-end gap-3 sm:flex-row">
                        <button type="button" onClick={requestClose} className={`${outlineButton} h-12 px-6`}>
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => submit(requestClose)}
                            className={`${tealButton} h-12 px-6`}
                        >
                            {t.savePriceList}
                        </button>
                    </div>
                </div>
            )}
        </ModalShell>
    );
}

function DeleteDialog({
    target,
    t,
    isRtl,
    onClosed,
    onConfirm,
}: {
    target: DeleteTarget;
    t: Messages;
    isRtl: boolean;
    onClosed: () => void;
    onConfirm: () => void;
}) {
    const titleId = useId();

    return (
        <ModalShell onClosed={onClosed} labelId={titleId} maxWidth="max-w-md" isRtl={isRtl}>
            {(requestClose) => (
                <div>
                    <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">
                                {t.deleteTitle}
                            </h2>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                {t.deleteBody(target.label)}
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
                        <button type="button" onClick={requestClose} className={`${outlineButton} h-11 px-5`}>
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onConfirm();
                                requestClose();
                            }}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950"
                        >
                            <Trash2 className="h-4 w-4" />
                            {t.deleteConfirm}
                        </button>
                    </div>
                </div>
            )}
        </ModalShell>
    );
}

/* -------------------------------------------------------------------------- */
/*                                 Table pieces                               */
/* -------------------------------------------------------------------------- */

type RowHandlers = {
    onEditCash: (serviceId: string) => void;
    onAddContract: (serviceId: string) => void;
    onEditContract: (serviceId: string, priceId: string) => void;
    onToggle: (serviceId: string, priceId: string) => void;
    onDelete: (serviceId: string, priceId: string) => void;
};

function ActionsMenu({
    service,
    t,
    locale,
    isRtl,
    handlers,
}: {
    service: PricingServiceRow;
    t: Messages;
    locale: Locale;
    isRtl: boolean;
    handlers: RowHandlers;
}) {
    const [open, setOpen] = useState(false);
    const [entered, setEntered] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    useIsoLayoutEffect(() => {
        if (!open) return;

        const rect = buttonRef.current?.getBoundingClientRect();

        if (!rect) return;

        const width = 304;
        const height = menuRef.current?.offsetHeight ?? 220;
        const rawLeft = isRtl ? rect.left : rect.right - width;
        const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8));
        const flip = window.innerHeight - rect.bottom < height + 12 && rect.top > height + 12;

        setPosition({ left, top: flip ? rect.top - height - 6 : rect.bottom + 6 });
    }, [open, isRtl, service.contracts.length]);

    useEffect(() => {
        if (!open) {
            setEntered(false);
            return;
        }

        const frame = requestAnimationFrame(() => setEntered(true));

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;

            if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
                setOpen(false);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };

        const onScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            setOpen(false);
        };

        const onResize = () => setOpen(false);

        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    const run = (action: () => void) => {
        setOpen(false);
        action();
    };

    const itemClass =
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-medium text-slate-900 transition-colors duration-150 hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 focus:outline-none dark:text-slate-100 dark:hover:text-teal-400 dark:focus:text-teal-400";

    const iconButton =
        "grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-teal-600/10 hover:text-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-300";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={`${t.rowActions}: ${pickName(locale, service.nameEn, service.nameAr)}`}
                onClick={() => setOpen((value) => !value)}
                className={`grid h-10 w-10 place-items-center rounded-lg border text-slate-600 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-300 ${open
                    ? "border-teal-500 bg-teal-600/10 text-teal-500"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    }`}
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className={`z-[160] w-[304px] origin-top rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/50 transition-[opacity,transform] duration-150 ease-out dark:border-slate-800 dark:bg-slate-900 ${entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
                            }`}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => run(() => handlers.onEditCash(service.id))}
                            className={itemClass}
                        >
                            <Pencil className="h-4 w-4 shrink-0" />
                            {t.menuEditCash}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => run(() => handlers.onAddContract(service.id))}
                            className={itemClass}
                        >
                            <Plus className="h-4 w-4 shrink-0" />
                            {t.menuAddContract}
                        </button>

                        {service.contracts.length > 0 && (
                            <>
                                <div className="my-1.5 border-t border-slate-200 dark:border-slate-800" />
                                <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {t.menuContracts}
                                </p>

                                {service.contracts.map((contract) => (
                                    <div
                                        key={contract.id}
                                        className="flex items-center gap-1 rounded-lg px-2 py-1.5"
                                    >
                                        <span
                                            className={`h-2 w-2 shrink-0 rounded-full ${contract.isActive ? "bg-teal-500" : "bg-slate-400"
                                                }`}
                                        />
                                        <span
                                            className={`min-w-0 flex-1 truncate px-1 text-sm ${contract.isActive
                                                ? "text-slate-900 dark:text-slate-100"
                                                : "text-slate-500 line-through dark:text-slate-400"
                                                }`}
                                            title={contractLabel(contract, locale)}
                                        >
                                            {contractLabel(contract, locale)}
                                        </span>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            title={t.menuEdit}
                                            aria-label={`${t.menuEdit}: ${contractLabel(contract, locale)}`}
                                            onClick={() => run(() => handlers.onEditContract(service.id, contract.id))}
                                            className={iconButton}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            title={contract.isActive ? t.menuDeactivate : t.menuActivate}
                                            aria-label={`${contract.isActive ? t.menuDeactivate : t.menuActivate
                                                }: ${contractLabel(contract, locale)}`}
                                            onClick={() => run(() => handlers.onToggle(service.id, contract.id))}
                                            className={iconButton}
                                        >
                                            {contract.isActive ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            title={t.menuDelete}
                                            aria-label={`${t.menuDelete}: ${contractLabel(contract, locale)}`}
                                            onClick={() => run(() => handlers.onDelete(service.id, contract.id))}
                                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-rose-500/10 hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:text-slate-300"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
}

const ServiceRow = memo(function ServiceRow({
    service,
    t,
    locale,
    isRtl,
    handlers,
}: {
    service: PricingServiceRow;
    t: Messages;
    locale: Locale;
    isRtl: boolean;
    handlers: RowHandlers;
}) {
    const { Icon, tone } = serviceVisual(service);
    const exempt = service.vatCategory === "CITIZEN_MEDICAL_EXEMPT";
    const shown = service.contracts.slice(0, VISIBLE_CONTRACTS);
    const hidden = service.contracts.length - shown.length;

    return (
        <tr className="h-[108px] border-b border-slate-200 transition-colors duration-150 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
            <td className="px-6 py-4 align-middle">
                <div className="flex items-center gap-4">
                    <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white ${tone}`}>
                        <Icon className="h-7 w-7" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-900 dark:text-white">
                            {pickName(locale, service.nameEn, service.nameAr)}
                        </p>
                        <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                            {pickName(locale, service.clinicNameEn, service.clinicNameAr)}
                        </p>
                        <p dir="ltr" className="truncate text-start text-sm font-medium text-teal-600 dark:text-teal-400">
                            {service.code}
                        </p>
                    </div>
                </div>
            </td>

            <td className="px-4 py-4 align-middle">
                <span dir="ltr" className="inline-block whitespace-nowrap text-lg font-bold text-slate-900 dark:text-white">
                    {formatMoney(service.basePrice, true)} {t.sar}
                </span>
            </td>

            <td className="px-4 py-4 align-middle">
                {service.contracts.length === 0 ? (
                    <span className="text-sm text-slate-500 dark:text-slate-400">{t.noContracts}</span>
                ) : (
                    <div className="flex flex-col items-start gap-1.5">
                        {shown.map((contract, index) => (
                            <span
                                key={contract.id}
                                dir={isRtl ? "rtl" : "ltr"}
                                title={`${contractLabel(contract, locale)} · ${formatMoney(
                                    contract.priceInclVat,
                                )} ${t.sar} (incl. VAT)`}
                                className={`inline-flex h-9 max-w-[260px] items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 ${contract.isActive
                                    ? index % 2 === 0
                                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                                        : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                                    }`}
                            >
                                <span
                                    className={`truncate ${contract.isActive ? "" : "line-through"}`}
                                >
                                    {contractLabel(contract, locale)} · {formatMoney(contract.priceExVat, true)} {t.sar}
                                </span>
                                {!contract.isActive && (
                                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                        {t.paused}
                                    </span>
                                )}
                            </span>
                        ))}
                        {hidden > 0 && (
                            <span className="inline-flex h-6 items-center rounded-md bg-slate-100 px-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {t.more(hidden)}
                            </span>
                        )}
                    </div>
                )}
            </td>

            <td className="px-4 py-4 align-middle">
                <span
                    className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-bold ${exempt
                        ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                        : "bg-teal-600/10 text-teal-700 dark:text-teal-300"
                        }`}
                >
                    {exempt ? t.vatExempt : t.vatBadge}
                </span>
                {exempt && (
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t.exemptNote}</p>
                )}
            </td>

            <td className="px-4 py-4 text-center align-middle">
                <ActionsMenu service={service} t={t} locale={locale} isRtl={isRtl} handlers={handlers} />
            </td>
        </tr>
    );
});

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: PAGE_SIZE }, (_, row) => (
                <tr
                    key={row}
                    className="h-[108px] animate-pulse border-b border-slate-200 last:border-b-0 dark:border-slate-800"
                >
                    <td className="px-6 py-4 align-middle">
                        <div className="flex items-center gap-4">
                            <div className="h-14 w-14 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-2">
                                <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                                <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-slate-800" />
                                <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="space-y-1.5">
                            <div className="h-9 w-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
                            <div className="h-9 w-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
                        </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-10 w-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="mx-auto h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                </tr>
            ))}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

export default function PricingTaxesPage({ initialLocale,
}: PricingTaxesProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale as Locale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [services, setServices] = useState<PricingServiceRow[]>([]);
    const [clinics, setClinics] = useState<PricingClinicOption[]>([]);
    const [policies, setPolicies] = useState<PricingPolicyOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [query, setQuery] = useState("");
    const [listFilter, setListFilter] = useState("ALL");
    const [clinicFilter, setClinicFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [modalKey, setModalKey] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    const servicesRef = useRef<PricingServiceRow[]>([]);
    const policiesRef = useRef<PricingPolicyOption[]>([]);
    const tRef = useRef<Messages>(t);
    const localeRef = useRef<Locale>(locale);
    const inflightRef = useRef(false);
    const queueRef = useRef(new Map<string, Promise<void>>());
    const idMapRef = useRef(new Map<string, string>());
    const tempCounterRef = useRef(0);
    const toastIdRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
        localeRef.current = locale;
    }, [t, locale]);

    useEffect(() => {
        policiesRef.current = policies;
    }, [policies]);

    useIsoLayoutEffect(() => {
        const root = document.documentElement;
        const sync = () => setLocale(root.lang === "ar" ? "ar" : ("en" as Locale));

        sync();

        const observer = new MutationObserver(sync);

        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    /* ---------------------------- state helpers ---------------------------- */

    /** Synchronous state commit: the ref and React state always move together. */
    const mutate = useCallback((update: (list: PricingServiceRow[]) => PricingServiceRow[]) => {
        const next = update(servicesRef.current);

        servicesRef.current = next;
        setServices(next);
    }, []);

    const sameId = useCallback((a: string, b: string) => {
        return a === b || idMapRef.current.get(a) === b || idMapRef.current.get(b) === a;
    }, []);

    const resolveId = useCallback((id: string): string | null => {
        if (!id.startsWith(TEMP_PREFIX)) return id;

        return idMapRef.current.get(id) ?? null;
    }, []);

    const patchContract = useCallback(
        (
            serviceId: string,
            priceId: string,
            update: (contract: PricingContractPrice) => PricingContractPrice,
        ) => {
            mutate((list) =>
                list.map((service) =>
                    service.id !== serviceId
                        ? service
                        : {
                            ...service,
                            contracts: service.contracts.map((contract) =>
                                sameId(contract.id, priceId) ? update(contract) : contract,
                            ),
                        },
                ),
            );
        },
        [mutate, sameId],
    );

    /* -------------------------------- toasts -------------------------------- */

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

    const failNotice = useCallback(
        (toastId: number, message?: string) => {
            dismissNotice(toastId);
            pushNotice({ kind: "error", message: message || tRef.current.failed });
        },
        [dismissNotice, pushNotice],
    );

    /* --------------------------- background queue --------------------------- */

    const enqueue = useCallback((key: string, task: () => Promise<void>) => {
        const previous = queueRef.current.get(key) ?? Promise.resolve();
        const next: Promise<void> = previous
            .then(task)
            .catch(() => undefined)
            .finally(() => {
                if (queueRef.current.get(key) === next) queueRef.current.delete(key);
            });

        queueRef.current.set(key, next);
    }, []);

    const runServer = useCallback(
        async <T,>(
            call: () => Promise<PricingActionResult<T>>,
        ): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
            try {
                const result = await call();

                if (result.success && result.data !== undefined) {
                    return { ok: true, data: result.data };
                }

                return { ok: false, error: result.error ?? "" };
            } catch {
                return { ok: false, error: "" };
            }
        },
        [],
    );

    /* --------------------------------- load --------------------------------- */

    const loadData = useCallback(async () => {
        if (inflightRef.current) return;

        inflightRef.current = true;
        setLoading(true);
        setLoadError("");

        try {
            const result = await getPricingDataAction();

            if (!result.success || !result.data) {
                setLoadError(result.error || tRef.current.loadFailed);
                return;
            }

            servicesRef.current = result.data.services;
            setServices(result.data.services);
            setClinics(result.data.clinics);
            setPolicies(result.data.policies);
        } catch {
            setLoadError(tRef.current.loadFailed);
        } finally {
            inflightRef.current = false;
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    /* ------------------------------- mutations ------------------------------- */

    const submitPrice = useCallback(
        (values: SubmitValues) => {
            const cents = toCents(values.priceExVat);
            const service = servicesRef.current.find((item) => item.id === values.serviceId);

            if (cents === null || !service) return;

            const rate = VAT_RATES[values.vatCategory];
            const exVat = centsToString(cents);
            const inclVat = centsToString(inclusiveCents(cents, rate));
            const rateText = rate.toFixed(2);
            const input = {
                serviceId: service.id,
                priceType: values.priceType,
                policyId: values.policyId || null,
                priceExVat: exVat,
                vatCategory: values.vatCategory,
            };

            /* ---------------------------- CASH price ---------------------------- */
            if (values.priceType === "CASH") {
                const previous = {
                    basePrice: service.basePrice,
                    vatRate: service.vatRate,
                    vatCategory: service.vatCategory,
                };

                mutate((list) =>
                    list.map((item) =>
                        item.id === service.id
                            ? { ...item, basePrice: exVat, vatRate: rateText, vatCategory: values.vatCategory }
                            : item,
                    ),
                );

                const toastId = pushNotice({ kind: "success", message: tRef.current.saved });

                enqueue(service.id, async () => {
                    const result = await runServer(() =>
                        values.mode === "edit"
                            ? updateServicePriceAction(input)
                            : createServicePriceAction(input),
                    );

                    if (!result.ok) {
                        mutate((list) =>
                            list.map((item) => (item.id === service.id ? { ...item, ...previous } : item)),
                        );
                        failNotice(toastId, result.error);
                        return;
                    }

                    const saved = result.data.service;

                    mutate((list) =>
                        list.map((item) =>
                            item.id === saved.id
                                ? {
                                    ...item,
                                    basePrice: saved.basePrice,
                                    vatRate: saved.vatRate,
                                    vatCategory: saved.vatCategory,
                                }
                                : item,
                        ),
                    );
                });

                return;
            }

            /* ------------------------ INSURANCE: create ------------------------ */
            if (values.mode === "create") {
                const policy = policiesRef.current.find((item) => item.id === values.policyId);

                if (!policy) return;

                const tempId = `${TEMP_PREFIX}${++tempCounterRef.current}`;
                const optimistic: PricingContractPrice = {
                    id: tempId,
                    serviceId: service.id,
                    policyId: policy.id,
                    providerNameEn: policy.providerNameEn,
                    providerNameAr: policy.providerNameAr,
                    policyNameEn: policy.nameEn,
                    policyNameAr: policy.nameAr,
                    policyNumber: policy.policyNumber,
                    priceExVat: exVat,
                    vatRate: rateText,
                    vatCategory: values.vatCategory,
                    priceInclVat: inclVat,
                    isActive: true,
                };

                mutate((list) =>
                    list.map((item) =>
                        item.id === service.id
                            ? { ...item, contracts: [...item.contracts, optimistic] }
                            : item,
                    ),
                );

                const toastId = pushNotice({ kind: "success", message: tRef.current.saved });

                enqueue(service.id, async () => {
                    const result = await runServer(() => createServicePriceAction(input));

                    if (!result.ok || !result.data.price) {
                        mutate((list) =>
                            list.map((item) =>
                                item.id === service.id
                                    ? {
                                        ...item,
                                        contracts: item.contracts.filter(
                                            (contract) => contract.id !== tempId,
                                        ),
                                    }
                                    : item,
                            ),
                        );
                        failNotice(toastId, result.ok ? undefined : result.error);
                        return;
                    }

                    const saved = result.data.price;

                    idMapRef.current.set(tempId, saved.id);

                    mutate((list) =>
                        list.map((item) =>
                            item.id === service.id
                                ? {
                                    ...item,
                                    contracts: item.contracts.map((contract) =>
                                        contract.id === tempId
                                            ? { ...saved, isActive: contract.isActive }
                                            : contract,
                                    ),
                                }
                                : item,
                        ),
                    );
                });

                return;
            }

            /* ------------------------- INSURANCE: edit ------------------------- */
            const targetId = values.priceId;
            const previous = service.contracts.find(
                (contract) => targetId !== null && sameId(contract.id, targetId),
            );

            if (!targetId || !previous) return;

            patchContract(service.id, targetId, (contract) => ({
                ...contract,
                priceExVat: exVat,
                vatRate: rateText,
                vatCategory: values.vatCategory,
                priceInclVat: inclVat,
            }));

            const toastId = pushNotice({ kind: "success", message: tRef.current.saved });

            enqueue(service.id, async () => {
                const realId = resolveId(targetId);

                if (!realId) return;

                const result = await runServer(() =>
                    updateServicePriceAction({ ...input, priceId: realId }),
                );

                if (!result.ok) {
                    patchContract(service.id, targetId, (contract) => ({
                        ...contract,
                        priceExVat: previous.priceExVat,
                        vatRate: previous.vatRate,
                        vatCategory: previous.vatCategory,
                        priceInclVat: previous.priceInclVat,
                    }));
                    failNotice(toastId, result.error);
                    return;
                }

                const saved = result.data.price;

                if (saved) {
                    patchContract(service.id, targetId, (contract) => ({
                        ...contract,
                        priceExVat: saved.priceExVat,
                        vatRate: saved.vatRate,
                        vatCategory: saved.vatCategory,
                        priceInclVat: saved.priceInclVat,
                    }));
                }
            });
        },
        [enqueue, failNotice, mutate, patchContract, pushNotice, resolveId, runServer, sameId],
    );

    const togglePrice = useCallback(
        (serviceId: string, priceId: string) => {
            const service = servicesRef.current.find((item) => item.id === serviceId);
            const contract = service?.contracts.find((item) => sameId(item.id, priceId));

            if (!service || !contract) return;

            const next = !contract.isActive;

            patchContract(serviceId, priceId, (item) => ({ ...item, isActive: next }));

            const toastId = pushNotice({
                kind: "success",
                message: next ? tRef.current.activated : tRef.current.deactivated,
            });

            enqueue(serviceId, async () => {
                const realId = resolveId(priceId);

                if (!realId) return;

                const result = await runServer(() => toggleServicePriceAction(realId, next));

                if (!result.ok) {
                    patchContract(serviceId, priceId, (item) => ({ ...item, isActive: !next }));
                    failNotice(toastId, result.error);
                }
            });
        },
        [enqueue, failNotice, patchContract, pushNotice, resolveId, runServer, sameId],
    );

    const deletePrice = useCallback(
        (serviceId: string, priceId: string) => {
            const service = servicesRef.current.find((item) => item.id === serviceId);
            const index = service?.contracts.findIndex((item) => sameId(item.id, priceId)) ?? -1;
            const snapshot = service?.contracts[index];

            if (!service || !snapshot || index < 0) return;

            mutate((list) =>
                list.map((item) =>
                    item.id === serviceId
                        ? {
                            ...item,
                            contracts: item.contracts.filter((contract) => !sameId(contract.id, priceId)),
                        }
                        : item,
                ),
            );

            const toastId = pushNotice({ kind: "success", message: tRef.current.deleted });

            enqueue(serviceId, async () => {
                const realId = resolveId(priceId);

                if (!realId) return;

                const result = await runServer(() => deleteServicePriceAction(realId));

                if (!result.ok) {
                    mutate((list) =>
                        list.map((item) => {
                            if (item.id !== serviceId) return item;

                            const contracts = [...item.contracts];

                            contracts.splice(Math.min(index, contracts.length), 0, snapshot);

                            return { ...item, contracts };
                        }),
                    );
                    failNotice(toastId, result.error);
                }
            });
        },
        [enqueue, failNotice, mutate, pushNotice, resolveId, runServer, sameId],
    );

    /* ------------------------------ modal opening ----------------------------- */

    const openModal = useCallback((state: ModalState) => {
        setModalKey((key) => key + 1);
        setModal(state);
    }, []);

    const handlers = useMemo<RowHandlers>(
        () => ({
            onEditCash: (serviceId) =>
                openModal({ mode: "edit", serviceId, priceType: "CASH", priceId: null }),
            onAddContract: (serviceId) =>
                openModal({ mode: "create", serviceId, priceType: "INSURANCE" }),
            onEditContract: (serviceId, priceId) =>
                openModal({ mode: "edit", serviceId, priceType: "INSURANCE", priceId }),
            onToggle: togglePrice,
            onDelete: (serviceId, priceId) => {
                const service = servicesRef.current.find((item) => item.id === serviceId);
                const contract = service?.contracts.find((item) => sameId(item.id, priceId));

                if (!service || !contract) return;

                setDeleteTarget({
                    serviceId,
                    priceId,
                    label: contractLabel(contract, localeRef.current),
                });
            },
        }),
        [openModal, sameId, togglePrice],
    );

    /* ------------------------------ derived data ------------------------------ */

    const deferredQuery = useDeferredValue(query);
    const effectiveQuery = query === "" ? "" : deferredQuery;
    const hasActiveFilters = query.trim() !== "" || listFilter !== "ALL" || clinicFilter !== "ALL";

    const listFilterOptions = useMemo<SelectOption[]>(() => {
        const seen = new Map<string, string>();

        for (const service of services) {
            for (const contract of service.contracts) {
                if (!seen.has(contract.policyId)) {
                    seen.set(contract.policyId, contractLabel(contract, locale));
                }
            }
        }

        const policyOptions = [...seen.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, label]) => ({ value: `POLICY:${id}`, label }));

        return [
            { value: "ALL", label: t.allPriceLists, hint: t.priceListHint },
            { value: "CASH", label: t.cashOnly },
            { value: "INSURANCE", label: t.insuranceAny },
            ...policyOptions,
        ];
    }, [services, locale, t]);

    const clinicOptions = useMemo<SelectOption[]>(
        () => [
            { value: "ALL", label: t.allClinics },
            ...clinics.map((clinic) => ({
                value: clinic.id,
                label: pickName(locale, clinic.nameEn, clinic.nameAr),
            })),
        ],
        [clinics, locale, t],
    );

    const filtered = useMemo(() => {
        const needle = effectiveQuery.trim().toLowerCase();

        return services.filter((service) => {
            if (clinicFilter !== "ALL" && service.clinicId !== clinicFilter) return false;

            if (listFilter === "CASH" && service.contracts.length > 0) return false;
            if (listFilter === "INSURANCE" && service.contracts.length === 0) return false;

            if (
                listFilter.startsWith("POLICY:") &&
                !service.contracts.some((contract) => `POLICY:${contract.policyId}` === listFilter)
            ) {
                return false;
            }

            if (!needle) return true;

            const haystack = [
                service.nameEn,
                service.nameAr,
                service.code,
                service.clinicNameEn,
                service.clinicNameAr,
                ...service.contracts.map((contract) => contractLabel(contract, locale)),
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(needle);
        });
    }, [services, clinicFilter, listFilter, effectiveQuery, locale]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = useMemo(
        () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filtered, currentPage],
    );

    const pageNumbers = useMemo(() => {
        const count = Math.min(6, totalPages);
        const start = Math.max(1, Math.min(currentPage - 2, totalPages - count + 1));

        return Array.from({ length: count }, (_, index) => start + index);
    }, [currentPage, totalPages]);

    const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    const resetFilters = () => {
        setQuery("");
        setListFilter("ALL");
        setClinicFilter("ALL");
        setPage(1);
    };

    /* ---------------------------------- JSX ---------------------------------- */

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
                    <AdminHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                                <nav
                                    aria-label="Breadcrumb"
                                    className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
                                >
                                    <span>{t.breadcrumbRoot}</span>
                                    <span aria-hidden="true">/</span>
                                    <span className="text-slate-700 dark:text-slate-200">{t.breadcrumbCurrent}</span>
                                </nav>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{t.subtitle}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => openModal({ mode: "create" })}
                                disabled={loading || !!loadError}
                                className={`${tealButton} h-12 shrink-0 px-6 text-base`}
                            >
                                <Plus className="h-5 w-5" />
                                {t.add}
                            </button>
                        </header>

                        <section className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
                            <label className="relative block min-w-0 flex-1">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
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

                            <div className="w-full lg:w-[280px]">
                                <Select
                                    value={listFilter}
                                    onChange={(value) => {
                                        setListFilter(value);
                                        setPage(1);
                                    }}
                                    options={listFilterOptions}
                                    placeholder={t.allPriceLists}
                                    ariaLabel={t.allPriceLists}
                                    isRtl={isRtl}
                                    filter
                                    className="bg-white dark:bg-slate-900/60"
                                />
                            </div>

                            <div className="w-full lg:w-[240px]">
                                <Select
                                    value={clinicFilter}
                                    onChange={(value) => {
                                        setClinicFilter(value);
                                        setPage(1);
                                    }}
                                    options={clinicOptions}
                                    placeholder={t.allClinics}
                                    ariaLabel={t.allClinics}
                                    isRtl={isRtl}
                                    filter
                                    className="bg-white dark:bg-slate-900/60"
                                />
                            </div>

                            <div
                                className={`overflow-hidden transition-all duration-200 ease-out ${hasActiveFilters
                                    ? "max-h-[54px] max-w-full opacity-100 lg:max-w-[220px]"
                                    : "pointer-events-none max-h-0 max-w-full opacity-0 lg:max-h-[54px] lg:max-w-0"
                                    }`}
                                aria-hidden={!hasActiveFilters}
                            >
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    disabled={!hasActiveFilters}
                                    tabIndex={hasActiveFilters ? 0 : -1}
                                    className={`${outlineButton} h-[54px] w-full whitespace-nowrap bg-white px-5 dark:bg-slate-900/60`}
                                >
                                    <FilterX className="h-5 w-5" />
                                    {t.resetFilters}
                                </button>
                            </div>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/10 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-black/20">
                            {loadError ? (
                                <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                                    <CircleAlert className="h-8 w-8 text-teal-500" />
                                    <p className="text-sm">{loadError}</p>
                                    <button type="button" onClick={() => void loadData()} className={tealButton}>
                                        {t.retry}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[980px] border-collapse text-start">
                                            <caption className="sr-only">
                                                {loading ? t.loading : t.title}
                                            </caption>
                                            <thead>
                                                <tr className="border-b border-slate-200 bg-white text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                                                    <th className="px-6 py-5 text-start align-middle">{t.colService}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colBase}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colContracts}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.colVat}</th>
                                                    <th className="px-4 py-5 text-center align-middle">{t.colActions}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading ? (
                                                    <SkeletonRows />
                                                ) : (
                                                    pageRows.map((service) => (
                                                        <ServiceRow
                                                            key={service.id}
                                                            service={service}
                                                            t={t}
                                                            locale={locale}
                                                            isRtl={isRtl}
                                                            handlers={handlers}
                                                        />
                                                    ))
                                                )}
                                            </tbody>
                                        </table>

                                        {!loading && filtered.length === 0 && (
                                            <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                                                <Tag className="h-8 w-8 text-teal-500" />
                                                <p className="text-base font-bold text-slate-900 dark:text-white">
                                                    {t.emptyTitle}
                                                </p>
                                                <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
                                                    {t.emptyBody}
                                                </p>
                                                {hasActiveFilters && (
                                                    <button
                                                        type="button"
                                                        onClick={resetFilters}
                                                        className={`${tealButton} mt-1`}
                                                    >
                                                        <FilterX className="h-4 w-4" />
                                                        {t.resetFilters}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-800 sm:flex-row">
                                        <p className="text-sm text-slate-600 dark:text-slate-300">
                                            {loading ? (
                                                <span className="inline-block h-4 w-48 animate-pulse rounded bg-slate-200 align-middle dark:bg-slate-800" />
                                            ) : filtered.length === 0 ? (
                                                t.showingNone
                                            ) : (
                                                t.showing(showingFrom, showingTo, filtered.length)
                                            )}
                                        </p>

                                        <nav aria-label={t.page} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={t.previousPage}
                                                disabled={loading || currentPage <= 1}
                                                onClick={() => setPage(currentPage - 1)}
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition-colors duration-150 hover:border-teal-500 hover:text-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                            >
                                                <PrevIcon className="h-4 w-4" />
                                            </button>

                                            {pageNumbers.map((number) => (
                                                <button
                                                    key={number}
                                                    type="button"
                                                    aria-label={`${t.page} ${number}`}
                                                    aria-current={number === currentPage ? "page" : undefined}
                                                    disabled={loading}
                                                    onClick={() => setPage(number)}
                                                    className={`grid h-10 min-w-10 place-items-center rounded-lg border px-2 text-sm font-semibold transition-colors duration-150 ${number === currentPage
                                                        ? "border-teal-600 bg-teal-600 text-white hover:bg-teal-500"
                                                        : "border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200"
                                                        }`}
                                                >
                                                    {number}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                aria-label={t.nextPage}
                                                disabled={loading || currentPage >= totalPages}
                                                onClick={() => setPage(currentPage + 1)}
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition-colors duration-150 hover:border-teal-500 hover:text-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
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
                <PricingModal
                    key={modalKey}
                    state={modal}
                    services={services}
                    policies={policies}
                    t={t}
                    locale={locale}
                    isRtl={isRtl}
                    onClosed={() => setModal(null)}
                    onSubmit={submitPrice}
                />
            )}

            {deleteTarget && (
                <DeleteDialog
                    target={deleteTarget}
                    t={t}
                    isRtl={isRtl}
                    onClosed={() => setDeleteTarget(null)}
                    onConfirm={() => deletePrice(deleteTarget.serviceId, deleteTarget.priceId)}
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