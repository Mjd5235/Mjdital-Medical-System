// app/admin/clinical/schedules/page.tsx
"use client";

import {
    useCallback,
    useEffect,
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
    Clock,
    Copy,
    LayoutGrid,
    List,
    LoaderCircle,
    MoreHorizontal,
    Pause,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Trash2,
    UserRound,
    X,
    type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createShiftAction,
    deleteShiftAction,
    duplicateShiftAction,
    getShiftsPageDataAction,
    toggleShiftStatusAction,
    updateShiftAction,
    type ShiftInput,
    type ShiftRow,
    type ShiftsPageData,
} from "./actions";

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 8;
const MIN_SLOT = 5;
const MAX_SLOT = 240;
const HOUR_HEIGHT = 56;
const ACTIVE_HREF = "/admin/clinical/schedules";

const EMPTY_DATA: ShiftsPageData = {
    shifts: [],
    clinics: [],
    services: [],
    doctors: [],
};

/* -------------------------------------------------------------------------- */
/*                                Translations                                */
/* -------------------------------------------------------------------------- */

const en = {
    breadcrumbRoot: "Schedules",
    title: "Schedules & Shifts",
    subtitle: "Manage doctor rosters, shift templates, and clinic availability.",
    createShift: "Create New Shift",
    tabPlanner: "Shift Planner (Calendar Grid)",
    tabTemplates: "Shift Templates",
    viewList: "List",
    viewCalendar: "Calendar",
    viewToggle: "Switch view",
    allDoctors: "All Doctors",
    allClinics: "All Clinics",
    daysOfWeek: "Days of Week",
    allDays: "All days",
    thisWeek: "This Week",
    prevWeek: "Previous week",
    nextWeek: "Next week",
    today: "Today",
    colDoctor: "Doctor",
    colClinicService: "Clinic & Service",
    colShiftTime: "Shift Time",
    colSlot: "Slot Duration",
    colStatus: "Status",
    colActions: "Actions",
    colRecurrence: "Recurrence",
    slotPerPatient: "{n} mins per patient",
    slotShort: "{n} min",
    statusActive: "Active",
    statusPaused: "Paused",
    showing: "Showing {from}–{to} of {total} shifts",
    emptyTitle: "No shifts found",
    emptyBody: "No shifts match the current filters. Create a shift to get started.",
    emptyDay: "No shifts",
    loading: "Loading shifts…",
    loadFailed: "Unable to load shifts.",
    retry: "Retry",
    pagination: "Pagination",
    prevPage: "Previous page",
    nextPage: "Next page",
    pageN: "Page {n}",
    rowActions: "Shift actions",
    menuEdit: "Edit Shift",
    menuPause: "Pause Shift",
    menuResume: "Resume Shift",
    menuDuplicate: "Duplicate Shift",
    menuDelete: "Delete Shift",
    modalCreateTitle: "Create New Shift",
    modalEditTitle: "Edit Shift",
    modalCreateSub: "Assign a doctor, clinic, service, and recurring schedule.",
    modalEditSub: "Update the doctor, clinic, service, or recurring schedule.",
    fieldDoctor: "Doctor",
    fieldClinic: "Clinic",
    fieldService: "Assigned Service",
    fieldRecurrence: "Recurrence",
    fieldShiftTime: "Shift Time",
    fieldStart: "Start Time",
    fieldEnd: "End Time",
    fieldSlot: "Slot Duration",
    minutes: "minutes",
    fieldActive: "Is Active",
    activeHint: "Shift will be visible in schedules",
    pausedHint: "Shift is paused and hidden from schedules",
    selectDoctor: "Select a doctor",
    selectClinic: "Select a clinic",
    selectService: "Select a service",
    noServices: "No services available",
    cancel: "Cancel",
    createSubmit: "Create Shift",
    saveSubmit: "Save Changes",
    saving: "Saving…",
    errDoctor: "Select a doctor.",
    errClinic: "Select a clinic.",
    errService: "Select a service.",
    errDays: "Select at least one day.",
    errTimeRequired: "Enter both a start and an end time.",
    errTime: "End time must be after start time.",
    errSlot: "Slot duration must be between {min} and {max} minutes.",
    errSlotFit: "The shift must be long enough for at least one slot.",
    errOverlap: "This doctor already has an active shift overlapping these days and times.",
    deleteTitle: "Delete this shift?",
    deleteBody:
        "This permanently removes the shift. Shifts with upcoming appointments cannot be deleted — pause them instead.",
    deleteConfirm: "Delete Shift",
    deleting: "Deleting…",
    created: "Shift created successfully.",
    updated: "Shift updated successfully.",
    paused: "Shift paused.",
    resumed: "Shift resumed.",
    duplicated: "Shift duplicated as a paused copy. Edit it, then resume it.",
    deleted: "Shift deleted.",
    failed: "The operation could not be completed. Please try again.",
    close: "Close",
    copyright: "All rights reserved",
    platform: "Healthcare Management Platform",
    doctorPrefix: "Dr.",
};

type Messages = { [K in keyof typeof en]: string };

type SchedulesShiftsProps = {
    initialLocale: Locale;
};

const ar: Messages = {
    breadcrumbRoot: "الجداول",
    title: "جداول الدوام والشفتات",
    subtitle: "إدارة جداول الأطباء وقوالب الشفتات وتوفر العيادات.",
    createShift: "إنشاء شفت جديد",
    tabPlanner: "مخطط الشفتات (شبكة التقويم)",
    tabTemplates: "قوالب الشفتات",
    viewList: "قائمة",
    viewCalendar: "تقويم",
    viewToggle: "تبديل العرض",
    allDoctors: "جميع الأطباء",
    allClinics: "جميع العيادات",
    daysOfWeek: "أيام الأسبوع",
    allDays: "كل الأيام",
    thisWeek: "هذا الأسبوع",
    prevWeek: "الأسبوع السابق",
    nextWeek: "الأسبوع التالي",
    today: "اليوم",
    colDoctor: "الطبيب",
    colClinicService: "العيادة والخدمة",
    colShiftTime: "وقت الشفت",
    colSlot: "مدة الموعد",
    colStatus: "الحالة",
    colActions: "الإجراءات",
    colRecurrence: "التكرار",
    slotPerPatient: "{n} دقيقة لكل مريض",
    slotShort: "{n} دقيقة",
    statusActive: "نشط",
    statusPaused: "متوقف مؤقتاً",
    showing: "عرض {from}–{to} من {total} شفت",
    emptyTitle: "لا توجد شفتات",
    emptyBody: "لا توجد شفتات تطابق عوامل التصفية الحالية. أنشئ شفتاً للبدء.",
    emptyDay: "لا شفتات",
    loading: "جارٍ تحميل الشفتات…",
    loadFailed: "تعذّر تحميل الشفتات.",
    retry: "إعادة المحاولة",
    pagination: "التنقل بين الصفحات",
    prevPage: "الصفحة السابقة",
    nextPage: "الصفحة التالية",
    pageN: "الصفحة {n}",
    rowActions: "إجراءات الشفت",
    menuEdit: "تعديل الشفت",
    menuPause: "إيقاف الشفت مؤقتاً",
    menuResume: "استئناف الشفت",
    menuDuplicate: "تكرار الشفت",
    menuDelete: "حذف الشفت",
    modalCreateTitle: "إنشاء شفت جديد",
    modalEditTitle: "تعديل الشفت",
    modalCreateSub: "حدّد الطبيب والعيادة والخدمة وجدول التكرار.",
    modalEditSub: "حدّث الطبيب أو العيادة أو الخدمة أو جدول التكرار.",
    fieldDoctor: "الطبيب",
    fieldClinic: "العيادة",
    fieldService: "الخدمة المسندة",
    fieldRecurrence: "التكرار",
    fieldShiftTime: "وقت الشفت",
    fieldStart: "وقت البدء",
    fieldEnd: "وقت الانتهاء",
    fieldSlot: "مدة الموعد",
    minutes: "دقيقة",
    fieldActive: "نشط",
    activeHint: "سيظهر الشفت في الجداول",
    pausedHint: "الشفت متوقف ومخفي من الجداول",
    selectDoctor: "اختر الطبيب",
    selectClinic: "اختر العيادة",
    selectService: "اختر الخدمة",
    noServices: "لا توجد خدمات متاحة",
    cancel: "إلغاء",
    createSubmit: "إنشاء الشفت",
    saveSubmit: "حفظ التغييرات",
    saving: "جارٍ الحفظ…",
    errDoctor: "اختر طبيباً.",
    errClinic: "اختر عيادة.",
    errService: "اختر خدمة.",
    errDays: "اختر يوماً واحداً على الأقل.",
    errTimeRequired: "أدخل وقت البدء ووقت الانتهاء.",
    errTime: "يجب أن يكون وقت الانتهاء بعد وقت البدء.",
    errSlot: "يجب أن تكون مدة الموعد بين {min} و{max} دقيقة.",
    errSlotFit: "يجب أن يتسع الشفت لموعد واحد على الأقل.",
    errOverlap: "لدى هذا الطبيب شفت نشط يتعارض مع هذه الأيام والأوقات.",
    deleteTitle: "حذف هذا الشفت؟",
    deleteBody:
        "سيتم حذف الشفت نهائياً. لا يمكن حذف الشفتات التي تحتوي على مواعيد قادمة — أوقفها مؤقتاً بدلاً من ذلك.",
    deleteConfirm: "حذف الشفت",
    deleting: "جارٍ الحذف…",
    created: "تم إنشاء الشفت بنجاح.",
    updated: "تم تحديث الشفت بنجاح.",
    paused: "تم إيقاف الشفت مؤقتاً.",
    resumed: "تم استئناف الشفت.",
    duplicated: "تم تكرار الشفت كنسخة متوقفة مؤقتاً. عدّلها ثم استأنفها.",
    deleted: "تم حذف الشفت.",
    failed: "تعذّر إكمال العملية. حاول مرة أخرى.",
    close: "إغلاق",
    copyright: "جميع الحقوق محفوظة",
    platform: "منصة إدارة الرعاية الصحية",
    doctorPrefix: "د.",
};

const messages: Record<Locale, Messages> = { en, ar } as Record<Locale, Messages>;

const DAY_NAMES: Record<Locale, { short: string[]; long: string[] }> = {
    en: {
        short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    },
    ar: {
        short: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
        long: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
    },
} as Record<Locale, { short: string[]; long: string[] }>;

/* -------------------------------------------------------------------------- */
/*                                   Styling                                  */
/* -------------------------------------------------------------------------- */

const fieldClass =
    "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]";

const primaryButton =
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950";

const outlineButton =
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-transparent px-5 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-400";

const cardClass =
    "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

const PALETTE = [
    { avatar: "bg-blue-600", block: "border-blue-500 bg-blue-500/15 text-blue-950 dark:text-blue-100" },
    { avatar: "bg-violet-600", block: "border-violet-500 bg-violet-500/15 text-violet-950 dark:text-violet-100" },
    { avatar: "bg-teal-600", block: "border-teal-500 bg-teal-500/15 text-teal-950 dark:text-teal-100" },
    { avatar: "bg-orange-500", block: "border-orange-500 bg-orange-500/15 text-orange-950 dark:text-orange-100" },
    { avatar: "bg-rose-600", block: "border-rose-500 bg-rose-500/15 text-rose-950 dark:text-rose-100" },
    { avatar: "bg-sky-600", block: "border-sky-500 bg-sky-500/15 text-sky-950 dark:text-sky-100" },
    { avatar: "bg-emerald-600", block: "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100" },
    { avatar: "bg-amber-600", block: "border-amber-500 bg-amber-500/15 text-amber-950 dark:text-amber-100" },
] as const;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function cn(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function fmt(template: string, values: Record<string, string | number>) {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function localeTag(locale: Locale) {
    return locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
}

function formatMinutes(total: number, locale: Locale, hourOnly = false) {
    const date = new Date(2000, 0, 1, Math.floor(total / 60) % 24, total % 60);

    return new Intl.DateTimeFormat(
        localeTag(locale),
        hourOnly
            ? { hour: "numeric", hour12: true }
            : { hour: "2-digit", minute: "2-digit", hour12: true },
    ).format(date);
}

function formatDate(date: Date, locale: Locale) {
    return new Intl.DateTimeFormat(localeTag(locale), { month: "short", day: "numeric" }).format(
        date,
    );
}

function startOfWeek(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

function addDays(date: Date, days: number) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function sameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function doctorLabel(name: string, locale: Locale, t: Messages) {
    const trimmed = name.trim();

    if (/^(dr\.?|د\.?)(\s|$)/i.test(trimmed)) return trimmed;

    return `${t.doctorPrefix} ${trimmed}`;
}

function initialsOf(name: string) {
    const words = name
        .replace(/^(dr\.?|د\.?)\s+/i, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    return (
        words
            .slice(0, 2)
            .map((word) => Array.from(word)[0] ?? "")
            .join("")
            .toUpperCase() || "?"
    );
}

function paletteFor(id: string) {
    let hash = 0;

    for (let index = 0; index < id.length; index++) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }

    return PALETTE[hash % PALETTE.length] ?? PALETTE[0];
}

function names(shift: ShiftRow, locale: Locale) {
    const isAr = locale === "ar";

    return {
        doctor: isAr ? shift.doctorNameAr || shift.doctorNameEn : shift.doctorNameEn,
        specialty: isAr ? shift.specialtyAr || shift.specialtyEn : shift.specialtyEn,
        clinic: isAr ? shift.clinicNameAr || shift.clinicNameEn : shift.clinicNameEn,
        service: isAr ? shift.serviceNameAr || shift.serviceNameEn : shift.serviceNameEn,
    };
}

function timeRange(shift: ShiftRow, locale: Locale) {
    return `${formatMinutes(shift.startMinute, locale)} – ${formatMinutes(shift.endMinute, locale)}`;
}

function layoutLanes(items: ShiftRow[]) {
    const sorted = [...items].sort(
        (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
    );
    const result: Array<{ shift: ShiftRow; lane: number; lanes: number }> = [];

    let cluster: Array<{ shift: ShiftRow; lane: number }> = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;

    const flush = () => {
        const lanes = Math.max(1, laneEnds.length);

        cluster.forEach((entry) => result.push({ ...entry, lanes }));
        cluster = [];
        laneEnds = [];
        clusterEnd = -1;
    };

    for (const shift of sorted) {
        if (cluster.length > 0 && shift.startMinute >= clusterEnd) flush();

        let lane = laneEnds.findIndex((end) => end <= shift.startMinute);

        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(shift.endMinute);
        } else {
            laneEnds[lane] = shift.endMinute;
        }

        cluster.push({ shift, lane });
        clusterEnd = Math.max(clusterEnd, shift.endMinute);
    }

    flush();

    return result;
}

/* -------------------------------------------------------------------------- */
/*                                Small widgets                               */
/* -------------------------------------------------------------------------- */

type RowHandlers = {
    onEdit: (shift: ShiftRow) => void;
    onToggle: (shift: ShiftRow) => void;
    onDuplicate: (shift: ShiftRow) => void;
    onDelete: (shift: ShiftRow) => void;
};

function SelectBox({
    icon: Icon,
    value,
    onChange,
    label,
    children,
    disabled,
    invalid,
    id,
}: {
    icon?: LucideIcon;
    value: string;
    onChange: (value: string) => void;
    label: string;
    children: ReactNode;
    disabled?: boolean;
    invalid?: boolean;
    id?: string;
}) {
    return (
        <div className="relative">
            {Icon && (
                <Icon className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            )}
            <select
                id={id}
                value={value}
                aria-label={label}
                aria-invalid={invalid || undefined}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={cn(
                    fieldClass,
                    "appearance-none truncate pe-10",
                    Icon ? "ps-10" : "ps-3",
                    invalid && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/30",
                )}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
    );
}

function StatusBadge({ active, t }: { active: boolean; t: Messages }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold",
                active
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
        >
            <span
                className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-emerald-500" : "bg-amber-400")}
            />
            {active ? t.statusActive : t.statusPaused}
        </span>
    );
}

function Avatar({ shift, name, size = "md" }: { shift: ShiftRow; name: string; size?: "md" | "sm" }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "grid shrink-0 place-items-center rounded-full font-bold text-white",
                paletteFor(shift.doctorId).avatar,
                size === "md" ? "h-11 w-11 text-sm" : "h-8 w-8 text-xs",
            )}
        >
            {initialsOf(name)}
        </span>
    );
}

function DayChips({ days, locale }: { days: number[]; locale: Locale }) {
    return (
        <div className="flex flex-wrap gap-1">
            {days.map((day) => (
                <span
                    key={day}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                    {DAY_NAMES[locale].short[day]}
                </span>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                              Row actions menu                              */
/* -------------------------------------------------------------------------- */

function ShiftRowActions({
    shift,
    busy,
    isRtl,
    t,
    handlers,
    size = "md",
}: {
    shift: ShiftRow;
    busy: boolean;
    isRtl: boolean;
    t: Messages;
    handlers: RowHandlers;
    size?: "md" | "sm";
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
        const gap = 6;

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

    useEffect(() => {
        if (open && position) {
            menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, position === null]);

    const choose = (handler: (shift: ShiftRow) => void) => {
        setOpen(false);
        handler(shift);
    };

    const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();

        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
        );

        if (items.length === 0) return;

        const current = items.findIndex((item) => item === document.activeElement);

        if (event.key === "ArrowDown") {
            event.preventDefault();
            items[(current + 1) % items.length]?.focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            items[(current - 1 + items.length) % items.length]?.focus();
        } else if (event.key === "Home") {
            event.preventDefault();
            items[0]?.focus();
        } else if (event.key === "End") {
            event.preventDefault();
            items[items.length - 1]?.focus();
        } else if (event.key === "Tab") {
            setOpen(false);
        }
    };

    const itemBase =
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium transition focus:outline-none";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={busy}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((value) => !value);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={cn(
                    "grid shrink-0 place-items-center rounded-lg border text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 dark:text-slate-300",
                    size === "md" ? "h-10 w-10" : "h-6 w-6",
                    open
                        ? "border-teal-500 bg-teal-600/10 text-teal-600 dark:text-teal-400"
                        : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
            >
                {busy ? (
                    <LoaderCircle
                        className={cn("animate-spin text-teal-500", size === "md" ? "h-5 w-5" : "h-3.5 w-3.5")}
                    />
                ) : (
                    <MoreHorizontal className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
                )}
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        dir={isRtl ? "rtl" : "ltr"}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={onMenuKeyDown}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[150] w-60 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl shadow-black/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onEdit)}
                            className={cn(
                                itemBase,
                                "hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:hover:text-teal-400 dark:focus:text-teal-400",
                            )}
                        >
                            <Pencil className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            {t.menuEdit}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onToggle)}
                            className={cn(
                                itemBase,
                                shift.isActive
                                    ? "text-amber-600 hover:bg-amber-500/10 focus:bg-amber-500/10 dark:text-amber-400"
                                    : "text-teal-600 hover:bg-teal-600/10 focus:bg-teal-600/10 dark:text-teal-400",
                            )}
                        >
                            {shift.isActive ? (
                                <Pause className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            ) : (
                                <Play className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            )}
                            {shift.isActive ? t.menuPause : t.menuResume}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onDuplicate)}
                            className={cn(
                                itemBase,
                                "hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:hover:text-teal-400 dark:focus:text-teal-400",
                            )}
                        >
                            <Copy className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            {t.menuDuplicate}
                        </button>

                        <div className="my-1.5 h-px bg-slate-200 dark:bg-slate-700/70" />

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onDelete)}
                            className={cn(
                                itemBase,
                                "text-rose-500 hover:bg-rose-500/10 focus:bg-rose-500/10 dark:text-rose-400",
                            )}
                        >
                            <Trash2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            {t.menuDelete}
                        </button>
                    </div>,
                    document.body,
                )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                                  List view                                 */
/* -------------------------------------------------------------------------- */

function ShiftsList({
    shifts,
    variant,
    locale,
    t,
    busyId,
    handlers,
}: {
    shifts: ShiftRow[];
    variant: "planner" | "templates";
    locale: Locale;
    t: Messages;
    busyId: string | null;
    handlers: RowHandlers;
}) {
    const isRtl = locale === "ar";
    const headClass = "px-5 py-4 text-start text-xs font-semibold text-slate-500 dark:text-slate-400";

    return (
        <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/70">
                            <th scope="col" className={headClass}>{t.colDoctor}</th>
                            <th scope="col" className={headClass}>{t.colClinicService}</th>
                            {variant === "templates" && (
                                <th scope="col" className={headClass}>{t.colRecurrence}</th>
                            )}
                            <th scope="col" className={headClass}>{t.colShiftTime}</th>
                            <th scope="col" className={headClass}>{t.colSlot}</th>
                            <th scope="col" className={headClass}>{t.colStatus}</th>
                            <th scope="col" className={cn(headClass, "w-24")}>{t.colActions}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {shifts.map((shift) => {
                            const n = names(shift, locale);
                            const label = doctorLabel(n.doctor, locale, t);

                            return (
                                <tr
                                    key={shift.id}
                                    className={cn(
                                        "transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40",
                                        !shift.isActive && "opacity-80",
                                    )}
                                >
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar shift={shift} name={n.doctor} />
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold text-slate-900 dark:text-white">
                                                    {label}
                                                </p>
                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                    {n.specialty}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{n.clinic}</p>
                                        <p className="text-xs text-teal-600 dark:text-teal-400">{n.service}</p>
                                    </td>
                                    {variant === "templates" && (
                                        <td className="px-5 py-4">
                                            <DayChips days={shift.daysOfWeek} locale={locale} />
                                        </td>
                                    )}
                                    <td className="px-5 py-4">
                                        <p className="whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                                            <bdi>{timeRange(shift, locale)}</bdi>
                                        </p>
                                        {variant === "planner" && (
                                            <div className="mt-1.5">
                                                <DayChips days={shift.daysOfWeek} locale={locale} />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="inline-flex whitespace-nowrap rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {fmt(t.slotPerPatient, { n: shift.slotDurationMinutes })}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge active={shift.isActive} t={t} />
                                    </td>
                                    <td className="px-5 py-4">
                                        <ShiftRowActions
                                            shift={shift}
                                            busy={busyId === shift.id}
                                            isRtl={isRtl}
                                            t={t}
                                            handlers={handlers}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
                {shifts.map((shift) => {
                    const n = names(shift, locale);
                    const label = doctorLabel(n.doctor, locale, t);

                    return (
                        <li key={shift.id} className={cn("space-y-3 p-4", !shift.isActive && "opacity-80")}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Avatar shift={shift} name={n.doctor} />
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900 dark:text-white">{label}</p>
                                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                            {n.specialty}
                                        </p>
                                    </div>
                                </div>
                                <ShiftRowActions
                                    shift={shift}
                                    busy={busyId === shift.id}
                                    isRtl={isRtl}
                                    t={t}
                                    handlers={handlers}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.colClinicService}</p>
                                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">{n.clinic}</p>
                                    <p className="truncate text-xs text-teal-600 dark:text-teal-400">{n.service}</p>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.colShiftTime}</p>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">
                                        <bdi>{timeRange(shift, locale)}</bdi>
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {fmt(t.slotPerPatient, { n: shift.slotDurationMinutes })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <DayChips days={shift.daysOfWeek} locale={locale} />
                                <StatusBadge active={shift.isActive} t={t} />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*                                Calendar view                               */
/* -------------------------------------------------------------------------- */

function CalendarGrid({
    shifts,
    days,
    weekStart,
    today,
    locale,
    t,
    busyId,
    handlers,
}: {
    shifts: ShiftRow[];
    days: number[];
    weekStart: Date | null;
    today: Date | null;
    locale: Locale;
    t: Messages;
    busyId: string | null;
    handlers: RowHandlers;
}) {
    const isRtl = locale === "ar";

    const perDay = useMemo(
        () =>
            days.map((day) => ({
                day,
                items: layoutLanes(shifts.filter((shift) => shift.daysOfWeek.includes(day))),
            })),
        [days, shifts],
    );

    const { startHour, endHour } = useMemo(() => {
        const visible = perDay.flatMap((entry) => entry.items.map((item) => item.shift));

        if (visible.length === 0) return { startHour: 8, endHour: 18 };

        const min = Math.min(...visible.map((shift) => shift.startMinute));
        const max = Math.max(...visible.map((shift) => shift.endMinute));
        const start = Math.max(0, Math.floor(min / 60));
        let end = Math.min(24, Math.ceil(max / 60));

        if (end - start < 4) end = Math.min(24, start + 4);

        return { startHour: start, endHour: end };
    }, [perDay]);

    const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
    const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

    return (
        <div className="overflow-x-auto">
            <div style={{ minWidth: days.length > 1 ? 64 + days.length * 132 : undefined }}>
                <div className="flex border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="w-16 shrink-0" />
                    {days.map((day) => {
                        const date = weekStart ? addDays(weekStart, day) : null;
                        const isToday = Boolean(date && today && sameDay(date, today));

                        return (
                            <div
                                key={day}
                                className={cn(
                                    "min-w-0 flex-1 basis-0 border-s border-slate-200 px-2 py-3 text-center dark:border-slate-800",
                                    isToday && "bg-teal-600/10",
                                )}
                            >
                                <p
                                    className={cn(
                                        "truncate text-sm font-semibold",
                                        isToday ? "text-teal-600 dark:text-teal-400" : "text-slate-900 dark:text-slate-100",
                                    )}
                                >
                                    {DAY_NAMES[locale].short[day]}
                                </p>
                                {date && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {formatDate(date, locale)}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex">
                    <div className="relative w-16 shrink-0" style={{ height: totalHeight }}>
                        {hours.map((hour, index) => (
                            <span
                                key={hour}
                                style={{ top: index * HOUR_HEIGHT }}
                                className={cn(
                                    "absolute end-2 text-[11px] text-slate-500 dark:text-slate-400",
                                    index === 0 ? "translate-y-0.5" : "-translate-y-1/2",
                                )}
                            >
                                {formatMinutes(hour * 60, locale, true)}
                            </span>
                        ))}
                    </div>

                    {perDay.map(({ day, items }) => (
                        <div
                            key={day}
                            className="relative min-w-0 flex-1 basis-0 border-s border-slate-200 dark:border-slate-800"
                            style={{ height: totalHeight }}
                        >
                            {hours.map((hour, index) => (
                                <div
                                    key={hour}
                                    style={{ top: index * HOUR_HEIGHT }}
                                    className="absolute inset-x-0 border-t border-slate-200/80 dark:border-slate-800/80"
                                />
                            ))}

                            {items.length === 0 && (
                                <p className="absolute inset-x-0 top-3 text-center text-xs text-slate-400">
                                    {t.emptyDay}
                                </p>
                            )}

                            {items.map(({ shift, lane, lanes }) => {
                                const n = names(shift, locale);
                                const top = ((shift.startMinute - startHour * 60) / 60) * HOUR_HEIGHT;
                                const height = Math.max(
                                    30,
                                    ((shift.endMinute - shift.startMinute) / 60) * HOUR_HEIGHT - 2,
                                );

                                return (
                                    <div
                                        key={shift.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handlers.onEdit(shift)}
                                        onKeyDown={(event) => {
                                            if (event.target !== event.currentTarget) return;

                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handlers.onEdit(shift);
                                            }
                                        }}
                                        title={`${doctorLabel(n.doctor, locale, t)} • ${timeRange(shift, locale)}`}
                                        style={{
                                            top: top + 1,
                                            height,
                                            insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                                            width: `calc(${100 / lanes}% - 4px)`,
                                        }}
                                        className={cn(
                                            "absolute cursor-pointer overflow-hidden rounded-lg border border-s-4 px-2 py-1 text-xs transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-teal-500",
                                            paletteFor(shift.doctorId).block,
                                            !shift.isActive && "border-dashed opacity-60",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold leading-tight">
                                                    {doctorLabel(n.doctor, locale, t)}
                                                </p>
                                                <p className="truncate leading-tight opacity-80">
                                                    <bdi>{timeRange(shift, locale)}</bdi>
                                                </p>
                                            </div>
                                            <ShiftRowActions
                                                shift={shift}
                                                busy={busyId === shift.id}
                                                isRtl={isRtl}
                                                t={t}
                                                handlers={handlers}
                                                size="sm"
                                            />
                                        </div>
                                        {height >= 76 && (
                                            <p className="mt-1 truncate opacity-80">
                                                {n.clinic} · {n.service}
                                            </p>
                                        )}
                                        {height >= 96 && !shift.isActive && (
                                            <p className="mt-1 font-semibold">{t.statusPaused}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                                 Pagination                                 */
/* -------------------------------------------------------------------------- */

function Pagination({
    page,
    totalPages,
    total,
    isRtl,
    t,
    onPage,
}: {
    page: number;
    totalPages: number;
    total: number;
    isRtl: boolean;
    t: Messages;
    onPage: (page: number) => void;
}) {
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
    const windowEnd = Math.min(totalPages, windowStart + 4);
    const pages: number[] = [];

    for (let value = windowStart; value <= windowEnd; value++) pages.push(value);

    const navButton =
        "grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-teal-500 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-400";

    return (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {fmt(t.showing, { from, to, total })}
            </p>

            {totalPages > 1 && (
                <nav aria-label={t.pagination} className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label={t.prevPage}
                        disabled={page <= 1}
                        onClick={() => onPage(Math.max(1, page - 1))}
                        className={navButton}
                    >
                        <PrevIcon className="h-4 w-4" />
                    </button>

                    {pages.map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-label={fmt(t.pageN, { n: value })}
                            aria-current={value === page ? "page" : undefined}
                            onClick={() => onPage(value)}
                            className={cn(
                                "grid h-10 min-w-10 place-items-center rounded-lg border px-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500",
                                value === page
                                    ? "border-teal-600 bg-teal-600 text-white"
                                    : "border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-400",
                            )}
                        >
                            {value}
                        </button>
                    ))}

                    <button
                        type="button"
                        aria-label={t.nextPage}
                        disabled={page >= totalPages}
                        onClick={() => onPage(Math.min(totalPages, page + 1))}
                        className={navButton}
                    >
                        <NextIcon className="h-4 w-4" />
                    </button>
                </nav>
            )}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                               Create / Edit modal                          */
/* -------------------------------------------------------------------------- */

type FormValues = {
    doctorId: string;
    clinicId: string;
    serviceId: string;
    days: number[];
    startTime: string;
    endTime: string;
    slot: string;
    isActive: boolean;
};

type FormErrors = Partial<
    Record<"doctorId" | "clinicId" | "serviceId" | "days" | "time" | "slot", string>
>;

function ShiftFormModal({
    shift,
    allShifts,
    data,
    locale,
    t,
    onClose,
    onSubmit,
}: {
    shift: ShiftRow | null;
    allShifts: ShiftRow[];
    data: ShiftsPageData;
    locale: Locale;
    t: Messages;
    onClose: () => void;
    onSubmit: (input: ShiftInput, shiftId?: string) => Promise<string | null>;
}) {
    const isEdit = Boolean(shift);
    const isRtl = locale === "ar";
    const isAr = locale === "ar";

    const [values, setValues] = useState<FormValues>(() =>
        shift
            ? {
                doctorId: shift.doctorId,
                clinicId: shift.clinicId,
                serviceId: shift.serviceId,
                days: [...shift.daysOfWeek],
                startTime: shift.startTime,
                endTime: shift.endTime,
                slot: String(shift.slotDurationMinutes),
                isActive: shift.isActive,
            }
            : {
                doctorId: "",
                clinicId: "",
                serviceId: "",
                days: [0, 1, 2, 3, 4],
                startTime: "09:00",
                endTime: "17:00",
                slot: "20",
                isActive: true,
            },
    );
    const [errors, setErrors] = useState<FormErrors>({});
    const [serverError, setServerError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !submitting) onClose();
        };

        document.addEventListener("keydown", onKeyDown);
        dialogRef.current?.querySelector<HTMLElement>("select, input, button")?.focus();

        return () => {
            document.body.style.overflow = previous;
            document.removeEventListener("keydown", onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doctor = data.doctors.find((item) => item.id === values.doctorId) ?? null;

    const doctorOptions = data.doctors.filter(
        (item) =>
            (item.isActive || item.id === shift?.doctorId) &&
            (!values.clinicId || item.clinicId === values.clinicId),
    );

    const clinicOptions = data.clinics.filter(
        (item) => item.isActive || item.id === shift?.clinicId,
    );

    const serviceOptions = data.services.filter(
        (item) =>
            item.clinicId === values.clinicId &&
            (item.isActive || item.id === shift?.serviceId) &&
            (!doctor || doctor.serviceIds.includes(item.id)),
    );

    const patch = (next: Partial<FormValues>) => {
        setValues((current) => ({ ...current, ...next }));
        setServerError("");
    };

    const servicesFor = (doctorId: string, clinicId: string) => {
        const target = data.doctors.find((item) => item.id === doctorId);

        return data.services.filter(
            (item) =>
                item.clinicId === clinicId &&
                item.isActive &&
                (!target || target.serviceIds.includes(item.id)),
        );
    };

    const onDoctorChange = (doctorId: string) => {
        const target = data.doctors.find((item) => item.id === doctorId);

        if (!target) {
            patch({ doctorId: "", serviceId: "" });
            return;
        }

        const available = servicesFor(target.id, target.clinicId);
        const keep = available.some((item) => item.id === values.serviceId);

        patch({
            doctorId: target.id,
            clinicId: target.clinicId,
            serviceId: keep ? values.serviceId : (available[0]?.id ?? ""),
        });
        setErrors((current) => ({ ...current, doctorId: undefined, clinicId: undefined }));
    };

    const onClinicChange = (clinicId: string) => {
        const doctorStays = doctor && doctor.clinicId === clinicId;

        patch({
            clinicId,
            doctorId: doctorStays ? values.doctorId : "",
            serviceId: doctorStays && serviceOptions.some((item) => item.id === values.serviceId)
                ? values.serviceId
                : "",
        });
    };

    const toggleDay = (day: number) => {
        patch({
            days: values.days.includes(day)
                ? values.days.filter((item) => item !== day)
                : [...values.days, day].sort((a, b) => a - b),
        });
        setErrors((current) => ({ ...current, days: undefined }));
    };

    const validate = (): FormErrors => {
        const next: FormErrors = {};

        if (!values.doctorId) next.doctorId = t.errDoctor;
        if (!values.clinicId) next.clinicId = t.errClinic;
        if (!values.serviceId) next.serviceId = t.errService;
        if (values.days.length === 0) next.days = t.errDays;

        const startOk = /^\d{2}:\d{2}$/.test(values.startTime);
        const endOk = /^\d{2}:\d{2}$/.test(values.endTime);
        const toMin = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
        const slot = Number(values.slot);

        if (!startOk || !endOk) {
            next.time = t.errTimeRequired;
        } else if (toMin(values.endTime) <= toMin(values.startTime)) {
            next.time = t.errTime;
        }

        if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
            next.slot = fmt(t.errSlot, { min: MIN_SLOT, max: MAX_SLOT });
        } else if (!next.time && startOk && endOk && toMin(values.endTime) - toMin(values.startTime) < slot) {
            next.slot = t.errSlotFit;
        }

        if (!next.time && !next.days && values.isActive && values.doctorId) {
            const start = toMin(values.startTime);
            const end = toMin(values.endTime);

            const conflict = allShifts.some(
                (item) =>
                    item.id !== shift?.id &&
                    item.isActive &&
                    item.doctorId === values.doctorId &&
                    item.daysOfWeek.some((day) => values.days.includes(day)) &&
                    item.startMinute < end &&
                    item.endMinute > start,
            );

            if (conflict) next.time = t.errOverlap;
        }

        return next;
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (submitting) return;

        const found = validate();
        setErrors(found);

        if (Object.keys(found).length > 0) return;

        setSubmitting(true);
        setServerError("");

        try {
            const error = await onSubmit(
                {
                    doctorId: values.doctorId,
                    clinicId: values.clinicId,
                    serviceId: values.serviceId,
                    daysOfWeek: [...values.days].sort((a, b) => a - b),
                    startTime: values.startTime,
                    endTime: values.endTime,
                    slotDurationMinutes: Number(values.slot),
                    isActive: values.isActive,
                },
                shift?.id,
            );

            if (error) setServerError(error);
        } catch {
            setServerError(t.failed);
        } finally {
            setSubmitting(false);
        }
    };

    const labelClass = "mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100";
    const errorText = (message?: string) =>
        message ? (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-500">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                {message}
            </p>
        ) : null;

    return (
        <div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm dark:bg-slate-950/80 sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="shift-modal-title"
                dir={isRtl ? "rtl" : "ltr"}
                className="flex max-h-[94vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl shadow-black/50 dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-800 sm:px-7">
                    <div className="min-w-0">
                        <h2
                            id="shift-modal-title"
                            className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl"
                        >
                            {isEdit ? t.modalEditTitle : t.modalCreateTitle}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {isEdit ? t.modalEditSub : t.modalCreateSub}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label={t.close}
                        disabled={submitting}
                        onClick={onClose}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
                        {serverError && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{serverError}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="shift-doctor" className={labelClass}>
                                {t.fieldDoctor}
                            </label>
                            <SelectBox
                                id="shift-doctor"
                                label={t.fieldDoctor}
                                value={values.doctorId}
                                invalid={Boolean(errors.doctorId)}
                                onChange={onDoctorChange}
                            >
                                <option value="">{t.selectDoctor}</option>
                                {doctorOptions.map((item) => {
                                    const name = isAr ? item.fullNameAr || item.fullNameEn : item.fullNameEn;
                                    const specialty = isAr ? item.specialtyAr || item.specialtyEn : item.specialtyEn;

                                    return (
                                        <option key={item.id} value={item.id}>
                                            {doctorLabel(name, locale, t)} — {specialty}
                                        </option>
                                    );
                                })}
                            </SelectBox>
                            {errorText(errors.doctorId)}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="shift-clinic" className={labelClass}>
                                    {t.fieldClinic}
                                </label>
                                <SelectBox
                                    id="shift-clinic"
                                    label={t.fieldClinic}
                                    value={values.clinicId}
                                    invalid={Boolean(errors.clinicId)}
                                    onChange={onClinicChange}
                                >
                                    <option value="">{t.selectClinic}</option>
                                    {clinicOptions.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {isAr ? item.nameAr || item.nameEn : item.nameEn}
                                        </option>
                                    ))}
                                </SelectBox>
                                {errorText(errors.clinicId)}
                            </div>

                            <div>
                                <label htmlFor="shift-service" className={labelClass}>
                                    {t.fieldService}
                                </label>
                                <SelectBox
                                    id="shift-service"
                                    label={t.fieldService}
                                    value={values.serviceId}
                                    disabled={!values.clinicId}
                                    invalid={Boolean(errors.serviceId)}
                                    onChange={(serviceId) => {
                                        patch({ serviceId });
                                        setErrors((current) => ({ ...current, serviceId: undefined }));
                                    }}
                                >
                                    <option value="">
                                        {values.clinicId && serviceOptions.length === 0
                                            ? t.noServices
                                            : t.selectService}
                                    </option>
                                    {serviceOptions.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {isAr ? item.nameAr || item.nameEn : item.nameEn}
                                        </option>
                                    ))}
                                </SelectBox>
                                {errorText(errors.serviceId)}
                            </div>
                        </div>

                        <fieldset>
                            <legend className={labelClass}>{t.fieldRecurrence}</legend>
                            <div className="flex flex-wrap gap-x-5 gap-y-3">
                                {DAY_NAMES[locale].short.map((label, day) => {
                                    const checked = values.days.includes(day);

                                    return (
                                        <label
                                            key={day}
                                            className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-800 dark:text-slate-200"
                                        >
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={checked}
                                                onChange={() => toggleDay(day)}
                                            />
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "grid h-5 w-5 place-items-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-slate-900",
                                                    checked
                                                        ? "border-teal-600 bg-teal-600 text-white"
                                                        : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950",
                                                )}
                                            >
                                                {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                                            </span>
                                            {label}
                                        </label>
                                    );
                                })}
                            </div>
                            {errorText(errors.days)}
                        </fieldset>

                        <fieldset>
                            <legend className={labelClass}>{t.fieldShiftTime}</legend>
                            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.1fr]">
                                <div>
                                    <label htmlFor="shift-start" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                        {t.fieldStart}
                                    </label>
                                    <input
                                        id="shift-start"
                                        type="time"
                                        value={values.startTime}
                                        aria-invalid={Boolean(errors.time) || undefined}
                                        onChange={(event) => {
                                            patch({ startTime: event.target.value });
                                            setErrors((current) => ({ ...current, time: undefined }));
                                        }}
                                        className={cn(fieldClass, errors.time && "border-rose-500")}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="shift-end" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                        {t.fieldEnd}
                                    </label>
                                    <input
                                        id="shift-end"
                                        type="time"
                                        value={values.endTime}
                                        aria-invalid={Boolean(errors.time) || undefined}
                                        onChange={(event) => {
                                            patch({ endTime: event.target.value });
                                            setErrors((current) => ({ ...current, time: undefined }));
                                        }}
                                        className={cn(fieldClass, errors.time && "border-rose-500")}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="shift-slot" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                                        {t.fieldSlot}
                                    </label>
                                    <div className="flex">
                                        <input
                                            id="shift-slot"
                                            type="number"
                                            inputMode="numeric"
                                            min={MIN_SLOT}
                                            max={MAX_SLOT}
                                            step={5}
                                            value={values.slot}
                                            aria-invalid={Boolean(errors.slot) || undefined}
                                            onChange={(event) => {
                                                patch({ slot: event.target.value });
                                                setErrors((current) => ({ ...current, slot: undefined }));
                                            }}
                                            className={cn(
                                                fieldClass,
                                                "min-w-0 rounded-e-none border-e-0",
                                                errors.slot && "border-rose-500",
                                            )}
                                        />
                                        <span className="grid h-11 shrink-0 place-items-center rounded-e-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                            {t.minutes}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {errorText(errors.time)}
                            {errorText(errors.slot)}
                        </fieldset>

                        <div>
                            <span className={labelClass}>{t.fieldActive}</span>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={values.isActive}
                                    aria-label={t.fieldActive}
                                    onClick={() => patch({ isActive: !values.isActive })}
                                    className={cn(
                                        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900",
                                        values.isActive ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                                            values.isActive
                                                ? isRtl
                                                    ? "-translate-x-6"
                                                    : "translate-x-6"
                                                : isRtl
                                                    ? "-translate-x-1"
                                                    : "translate-x-1",
                                        )}
                                    />
                                </button>
                                <span className="text-sm text-slate-600 dark:text-slate-300">
                                    {values.isActive ? t.activeHint : t.pausedHint}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:px-7">
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={onClose}
                            className={cn(outlineButton, "px-6")}
                        >
                            {t.cancel}
                        </button>
                        <button type="submit" disabled={submitting} className={cn(primaryButton, "px-6")}>
                            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                            {submitting ? t.saving : isEdit ? t.saveSubmit : t.createSubmit}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

type Notice = { kind: "success" | "error"; message: string };
type ModalState = { mode: "create" } | { mode: "edit"; shift: ShiftRow } | null;
type TabKey = "planner" | "templates";
type ViewKey = "list" | "calendar";

export default function SchedulesShiftsPage({ initialLocale,
}: SchedulesShiftsProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale as Locale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [data, setData] = useState<ShiftsPageData>(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [tab, setTab] = useState<TabKey>("planner");
    const [view, setView] = useState<ViewKey>("list");
    const [doctorFilter, setDoctorFilter] = useState("ALL");
    const [clinicFilter, setClinicFilter] = useState("ALL");
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [weekOffset, setWeekOffset] = useState(0);
    const [today, setToday] = useState<Date | null>(null);
    const [page, setPage] = useState(1);

    const [modal, setModal] = useState<ModalState>(null);
    const [deleteTarget, setDeleteTarget] = useState<ShiftRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const t = messages[locale];
    const isRtl = locale === "ar";

    /* ----------------------------- locale + clock ----------------------------- */

    useEffect(() => {
        const root = document.documentElement;
        const syncLocale = () => setLocale((root.lang === "en" ? "en" : "ar") as Locale);

        syncLocale();

        const observer = new MutationObserver(syncLocale);
        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const now = new Date();

        setToday(now);
        setSelectedDay(now.getDay());
    }, []);

    useEffect(() => {
        if (!notice) return;

        const timer = window.setTimeout(() => setNotice(null), 7000);

        return () => window.clearTimeout(timer);
    }, [notice]);

    /* --------------------------------- loading -------------------------------- */

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const result = await getShiftsPageDataAction();

            if (!result.success || !result.data) {
                setLoadError(result.error ?? messages[locale].loadFailed);
                setData(EMPTY_DATA);
                return;
            }

            setData(result.data);
        } catch {
            setLoadError(messages[locale].loadFailed);
            setData(EMPTY_DATA);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    /* --------------------------------- derived -------------------------------- */

    const weekStart = useMemo(
        () => (today ? addDays(startOfWeek(today), weekOffset * 7) : null),
        [today, weekOffset],
    );

    const baseFiltered = useMemo(
        () =>
            data.shifts.filter(
                (shift) =>
                    (doctorFilter === "ALL" || shift.doctorId === doctorFilter) &&
                    (clinicFilter === "ALL" || shift.clinicId === clinicFilter),
            ),
        [data.shifts, doctorFilter, clinicFilter],
    );

    const dayCounts = useMemo(
        () =>
            Array.from({ length: 7 }, (_, day) =>
                baseFiltered.filter((shift) => shift.daysOfWeek.includes(day)).length,
            ),
        [baseFiltered],
    );

    const sortRows = useCallback(
        (rows: ShiftRow[]) =>
            [...rows].sort(
                (a, b) =>
                    a.startMinute - b.startMinute ||
                    names(a, locale).doctor.localeCompare(names(b, locale).doctor, locale),
            ),
        [locale],
    );

    const listRows = useMemo(() => {
        if (tab === "templates") return sortRows(baseFiltered);

        return sortRows(
            selectedDay === null
                ? baseFiltered
                : baseFiltered.filter((shift) => shift.daysOfWeek.includes(selectedDay)),
        );
    }, [tab, baseFiltered, selectedDay, sortRows]);

    const calendarDays = useMemo(
        () => (selectedDay === null ? [0, 1, 2, 3, 4, 5, 6] : [selectedDay]),
        [selectedDay],
    );

    const totalPages = Math.max(1, Math.ceil(listRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = listRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [doctorFilter, clinicFilter, selectedDay, tab, view]);

    const weekLabel = useMemo(() => {
        if (weekOffset === 0 || !weekStart) return t.thisWeek;

        return `${formatDate(weekStart, locale)} – ${formatDate(addDays(weekStart, 6), locale)}`;
    }, [weekOffset, weekStart, locale, t.thisWeek]);

    /* -------------------------------- handlers -------------------------------- */

    const upsertShift = useCallback((row: ShiftRow) => {
        setData((current) => ({
            ...current,
            shifts: current.shifts.some((shift) => shift.id === row.id)
                ? current.shifts.map((shift) => (shift.id === row.id ? row : shift))
                : [...current.shifts, row],
        }));
    }, []);

    const changeView = (next: ViewKey) => {
        setView(next);

        if (next === "calendar") {
            setSelectedDay(null);
        } else if (today) {
            setSelectedDay(today.getDay());
        }
    };

    const submitShift = async (input: ShiftInput, shiftId?: string): Promise<string | null> => {
        const result = shiftId
            ? await updateShiftAction({ ...input, shiftId })
            : await createShiftAction(input);

        if (!result.success || !result.data) return result.error ?? t.failed;

        upsertShift(result.data.shift);
        setModal(null);
        setNotice({ kind: "success", message: shiftId ? t.updated : t.created });

        return null;
    };

    const handleToggle = useCallback(
        async (shift: ShiftRow) => {
            setBusyId(shift.id);

            try {
                const result = await toggleShiftStatusAction(shift.id);

                if (!result.success || !result.data) {
                    setNotice({ kind: "error", message: result.error ?? t.failed });
                    return;
                }

                upsertShift(result.data.shift);
                setNotice({
                    kind: "success",
                    message: result.data.shift.isActive ? t.resumed : t.paused,
                });
            } catch {
                setNotice({ kind: "error", message: t.failed });
            } finally {
                setBusyId(null);
            }
        },
        [t, upsertShift],
    );

    const handleDuplicate = useCallback(
        async (shift: ShiftRow) => {
            setBusyId(shift.id);

            try {
                const result = await duplicateShiftAction(shift.id);

                if (!result.success || !result.data) {
                    setNotice({ kind: "error", message: result.error ?? t.failed });
                    return;
                }

                upsertShift(result.data.shift);
                setNotice({ kind: "success", message: t.duplicated });
            } catch {
                setNotice({ kind: "error", message: t.failed });
            } finally {
                setBusyId(null);
            }
        },
        [t, upsertShift],
    );

    async function confirmDelete() {
        if (!deleteTarget) return;

        setDeleting(true);
        setDeleteError("");

        try {
            const result = await deleteShiftAction(deleteTarget.id);

            if (!result.success) {
                setDeleteError(result.error ?? t.failed);
                return;
            }

            const removedId = deleteTarget.id;

            setData((current) => ({
                ...current,
                shifts: current.shifts.filter((shift) => shift.id !== removedId),
            }));
            setDeleteTarget(null);
            setNotice({ kind: "success", message: t.deleted });
        } catch {
            setDeleteError(t.failed);
        } finally {
            setDeleting(false);
        }
    }

    const handlers: RowHandlers = {
        onEdit: (shift) => setModal({ mode: "edit", shift }),
        onToggle: (shift) => void handleToggle(shift),
        onDuplicate: (shift) => void handleDuplicate(shift),
        onDelete: (shift) => {
            setDeleteError("");
            setDeleteTarget(shift);
        },
    };

    /* --------------------------------- render --------------------------------- */

    const PrevWeekIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextWeekIcon = isRtl ? ChevronLeft : ChevronRight;
    const showDayControls = tab === "planner";
    const isEmpty = !loading && !loadError && listRows.length === 0;

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

                    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 xl:p-8">
                        {/* Page header */}
                        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div className="min-w-0">
                                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <ChevronLeft size={13} className={cn(!isRtl && "rotate-180")} />
                                    <span className="font-medium text-teal-700 dark:text-teal-400">{t.title}</span>
                                </div>
                                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                                    {t.title}
                                </h1>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.subtitle}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setModal({ mode: "create" })}
                                className={cn(primaryButton, "w-full sm:w-auto")}
                            >
                                <Plus className="h-5 w-5" />
                                {t.createShift}
                            </button>
                        </section>

                        {/* Tabs */}
                        <div
                            role="tablist"
                            className="flex gap-2 overflow-x-auto overflow-y-hidden border-b border-slate-200 dark:border-slate-800"
                        >
                            {(
                                [
                                    ["planner", t.tabPlanner],
                                    ["templates", t.tabTemplates],
                                ] as Array<[TabKey, string]>
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === key}
                                    onClick={() => setTab(key)}
                                    className={cn(
                                        "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                                        tab === key
                                            ? "border-teal-500 text-teal-600 dark:text-teal-400"
                                            : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Filters */}
                        <section
                            className={cn(
                                "grid gap-3",
                                showDayControls
                                    ? "sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto]"
                                    : "sm:grid-cols-2",
                            )}
                        >
                            <SelectBox
                                icon={UserRound}
                                label={t.allDoctors}
                                value={doctorFilter}
                                onChange={setDoctorFilter}
                            >
                                <option value="ALL">{t.allDoctors}</option>
                                {data.doctors.map((doctor) => (
                                    <option key={doctor.id} value={doctor.id}>
                                        {doctorLabel(
                                            isRtl ? doctor.fullNameAr || doctor.fullNameEn : doctor.fullNameEn,
                                            locale,
                                            t,
                                        )}
                                    </option>
                                ))}
                            </SelectBox>

                            <SelectBox
                                icon={Building2}
                                label={t.allClinics}
                                value={clinicFilter}
                                onChange={setClinicFilter}
                            >
                                <option value="ALL">{t.allClinics}</option>
                                {data.clinics.map((clinic) => (
                                    <option key={clinic.id} value={clinic.id}>
                                        {isRtl ? clinic.nameAr || clinic.nameEn : clinic.nameEn}
                                    </option>
                                ))}
                            </SelectBox>

                            {showDayControls && (
                                <>
                                    <SelectBox
                                        icon={CalendarDays}
                                        label={t.daysOfWeek}
                                        value={selectedDay === null ? "ALL" : String(selectedDay)}
                                        onChange={(value) => setSelectedDay(value === "ALL" ? null : Number(value))}
                                    >
                                        <option value="ALL">{`${t.daysOfWeek} — ${t.allDays}`}</option>
                                        {DAY_NAMES[locale].long.map((label, day) => (
                                            <option key={day} value={day}>
                                                {label}
                                            </option>
                                        ))}
                                    </SelectBox>

                                    <div className="flex h-11 items-center rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
                                        <button
                                            type="button"
                                            aria-label={t.prevWeek}
                                            onClick={() => setWeekOffset((value) => value - 1)}
                                            className="grid h-full w-10 place-items-center rounded-s-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-400"
                                        >
                                            <PrevWeekIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setWeekOffset(0)}
                                            className="flex h-full min-w-[9.5rem] items-center justify-center gap-2 px-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-100"
                                        >
                                            <CalendarDays className="h-[18px] w-[18px] text-teal-600 dark:text-teal-400" />
                                            <span className="whitespace-nowrap">
                                                <bdi>{weekLabel}</bdi>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t.nextWeek}
                                            onClick={() => setWeekOffset((value) => value + 1)}
                                            className="grid h-full w-10 place-items-center rounded-e-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-400"
                                        >
                                            <NextWeekIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div
                                        role="group"
                                        aria-label={t.viewToggle}
                                        className="flex h-11 items-center rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        {(
                                            [
                                                ["list", t.viewList, List],
                                                ["calendar", t.viewCalendar, LayoutGrid],
                                            ] as Array<[ViewKey, string, LucideIcon]>
                                        ).map(([key, label, Icon]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                aria-pressed={view === key}
                                                onClick={() => changeView(key)}
                                                className={cn(
                                                    "inline-flex h-full items-center gap-2 rounded-md px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-500",
                                                    view === key
                                                        ? "bg-teal-600 text-white"
                                                        : "text-slate-600 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400",
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </section>

                        {/* Day chips */}
                        {showDayControls && (
                            <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label={t.daysOfWeek}>
                                {DAY_NAMES[locale].short.map((label, day) => {
                                    const date = weekStart ? addDays(weekStart, day) : null;
                                    const selected = selectedDay === day;
                                    const isToday = Boolean(date && today && sameDay(date, today));

                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => setSelectedDay(selected ? null : day)}
                                            className={cn(
                                                "relative min-w-0 rounded-xl border px-1 py-2.5 text-center transition focus:outline-none focus:ring-2 focus:ring-teal-500 sm:py-3",
                                                selected
                                                    ? "border-teal-500 bg-teal-600/10 text-teal-700 ring-1 ring-teal-500/40 dark:text-teal-300"
                                                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-500/60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
                                            )}
                                        >
                                            <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
                                            {date && (
                                                <span
                                                    className={cn(
                                                        "mt-0.5 block truncate text-[11px] sm:text-xs",
                                                        selected ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400",
                                                    )}
                                                >
                                                    <span className="sm:hidden">{date.getDate()}</span>
                                                    <span className="hidden sm:inline">{formatDate(date, locale)}</span>
                                                </span>
                                            )}
                                            {isToday && (
                                                <span
                                                    title={t.today}
                                                    className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-teal-500"
                                                />
                                            )}
                                            {dayCounts[day] ? (
                                                <span className="mt-1 hidden text-[10px] font-medium text-slate-400 sm:block">
                                                    {dayCounts[day]}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Content */}
                        <section className={cn(cardClass, "overflow-hidden")}>
                            {loading && (
                                <div className="flex items-center justify-center gap-3 px-6 py-20 text-sm text-slate-500 dark:text-slate-400">
                                    <LoaderCircle className="h-5 w-5 animate-spin text-teal-500" />
                                    {t.loading}
                                </div>
                            )}

                            {!loading && loadError && (
                                <div
                                    role="alert"
                                    className="flex flex-col items-center gap-4 px-6 py-16 text-center"
                                >
                                    <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500/10 text-rose-500">
                                        <CircleAlert className="h-6 w-6" />
                                    </div>
                                    <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">{loadError}</p>
                                    <button type="button" onClick={() => void loadData()} className={primaryButton}>
                                        <RefreshCw className="h-4 w-4" />
                                        {t.retry}
                                    </button>
                                </div>
                            )}

                            {isEmpty && !(tab === "planner" && view === "calendar") && (
                                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                                    <div className="grid h-12 w-12 place-items-center rounded-full bg-teal-600/10 text-teal-600 dark:text-teal-400">
                                        <Clock className="h-6 w-6" />
                                    </div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white">{t.emptyTitle}</h2>
                                    <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{t.emptyBody}</p>
                                    <button
                                        type="button"
                                        onClick={() => setModal({ mode: "create" })}
                                        className={cn(primaryButton, "mt-2")}
                                    >
                                        <Plus className="h-5 w-5" />
                                        {t.createShift}
                                    </button>
                                </div>
                            )}

                            {!loading && !loadError && tab === "planner" && view === "calendar" && (
                                <CalendarGrid
                                    shifts={baseFiltered}
                                    days={calendarDays}
                                    weekStart={weekStart}
                                    today={today}
                                    locale={locale}
                                    t={t}
                                    busyId={busyId}
                                    handlers={handlers}
                                />
                            )}

                            {!loading && !loadError && !isEmpty && !(tab === "planner" && view === "calendar") && (
                                <>
                                    <ShiftsList
                                        shifts={pageRows}
                                        variant={tab}
                                        locale={locale}
                                        t={t}
                                        busyId={busyId}
                                        handlers={handlers}
                                    />
                                    <Pagination
                                        page={currentPage}
                                        totalPages={totalPages}
                                        total={listRows.length}
                                        isRtl={isRtl}
                                        t={t}
                                        onPage={setPage}
                                    />
                                </>
                            )}
                        </section>

                        <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/80 py-5 text-xs text-slate-400 dark:border-slate-800 sm:flex-row">
                            <span>
                                © {today ? today.getFullYear() : ""} Mjdital — {t.copyright}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                {t.platform}
                            </span>
                        </footer>
                    </div>
                </main>
            </div>

            {modal && (
                <ShiftFormModal
                    key={modal.mode === "edit" ? modal.shift.id : "create"}
                    shift={modal.mode === "edit" ? modal.shift : null}
                    allShifts={data.shifts}
                    data={data}
                    locale={locale}
                    t={t}
                    onClose={() => setModal(null)}
                    onSubmit={submitShift}
                />
            )}

            {deleteTarget && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm dark:bg-slate-950/80"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !deleting) setDeleteTarget(null);
                    }}
                >
                    <section
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="delete-shift-title"
                        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 dark:border-slate-700 dark:bg-slate-900"
                    >
                        <div className="flex items-start gap-4">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500">
                                <Trash2 className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                                <h2 id="delete-shift-title" className="text-lg font-bold text-slate-900 dark:text-white">
                                    {t.deleteTitle}
                                </h2>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {doctorLabel(names(deleteTarget, locale).doctor, locale, t)} ·{" "}
                                    <bdi>{timeRange(deleteTarget, locale)}</bdi>
                                </p>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.deleteBody}</p>
                            </div>
                        </div>

                        {deleteError && (
                            <div
                                role="alert"
                                className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{deleteError}</p>
                            </div>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => setDeleteTarget(null)}
                                className={cn(outlineButton, "px-6")}
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => void confirmDelete()}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950"
                            >
                                {deleting ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                {deleting ? t.deleting : t.deleteConfirm}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {notice && (
                <div
                    role="status"
                    aria-live="polite"
                    className={cn(
                        "fixed bottom-6 end-6 z-[200] flex max-w-md items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/40 dark:bg-slate-900",
                        notice.kind === "success" ? "border-teal-600/40" : "border-rose-500/40",
                    )}
                >
                    {notice.kind === "success" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                    ) : (
                        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                    )}

                    <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">{notice.message}</p>

                    <button
                        type="button"
                        onClick={() => setNotice(null)}
                        aria-label={t.close}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}