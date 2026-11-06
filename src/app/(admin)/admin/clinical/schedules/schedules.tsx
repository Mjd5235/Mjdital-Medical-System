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
    MoreHorizontal,
    Moon,
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

const PAGE_SIZE = 4;
const MIN_SLOT = 5;
const MAX_SLOT = 240;
const HOUR_HEIGHT = 56;
const MINUTES_IN_DAY = 1440;
const MINUTES_IN_WEEK = 7 * MINUTES_IN_DAY;
const ACTIVE_HREF = "/admin/clinical/schedules";
const TEMP_PREFIX = "temp-";

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
    errTime: "Start and end times must be different (a shift can last up to 24 hours).",
    errSlot: "Slot duration must be between {min} and {max} minutes.",
    errSlotFit: "The shift must be long enough for at least one slot.",
    errOverlap: "This doctor already has an active shift overlapping these days and times.",
    overnightBadge: "Overnight",
    overnightHint: "Overnight shift — ends the next day. Total duration: {duration}.",
    durationFmt: "{h}h {m}m",
    continuesNextDay: "Continues to the next day",
    fromPreviousDay: "Continued from the previous day",
    busy: "Another action is still in progress. Please wait a moment.",
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
    syncing: "Syncing…",
    close: "Close",
    copyright: "All rights reserved",
    platform: "Healthcare Management Platform",
    doctorPrefix: "Dr.",
};

type SchedulesShiftsProps = {
    initialLocale: Locale;
};

type Messages = { [K in keyof typeof en]: string };

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
    errTime: "يجب أن يختلف وقت البدء عن وقت الانتهاء (يمكن أن يمتد الشفت حتى 24 ساعة).",
    errSlot: "يجب أن تكون مدة الموعد بين {min} و{max} دقيقة.",
    errSlotFit: "يجب أن يتسع الشفت لموعد واحد على الأقل.",
    errOverlap: "لدى هذا الطبيب شفت نشط يتعارض مع هذه الأيام والأوقات.",
    overnightBadge: "شفت ليلي",
    overnightHint: "شفت ليلي — ينتهي في اليوم التالي. المدة الإجمالية: {duration}.",
    durationFmt: "{h} س {m} د",
    continuesNextDay: "يستمر إلى اليوم التالي",
    fromPreviousDay: "مستمر من اليوم السابق",
    busy: "هناك إجراء آخر قيد التنفيذ. يُرجى الانتظار قليلاً.",
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
    syncing: "جارٍ المزامنة…",
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

function parseHHmm(value: string): number | null {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Overnight-aware: end earlier than start belongs to the next day. */
function resolveEnd(start: number, end: number) {
    return end < start ? end + MINUTES_IN_DAY : end;
}

function formatDuration(totalMinutes: number, t: Messages) {
    return fmt(t.durationFmt, {
        h: Math.floor(totalMinutes / 60),
        m: totalMinutes % 60,
    });
}

function weeklyIntervals(days: number[], start: number, end: number): Array<[number, number]> {
    const intervals: Array<[number, number]> = [];

    for (const day of days) {
        const from = day * MINUTES_IN_DAY + start;
        const to = day * MINUTES_IN_DAY + end;

        if (to <= MINUTES_IN_WEEK) {
            intervals.push([from, to]);
        } else {
            intervals.push([from, MINUTES_IN_WEEK]);
            intervals.push([0, to - MINUTES_IN_WEEK]);
        }
    }

    return intervals;
}

function intervalsOverlap(a: Array<[number, number]>, b: Array<[number, number]>) {
    return a.some(([a0, a1]) => b.some(([b0, b1]) => a0 < b1 && b0 < a1));
}

/** True when the shift is running at any point of the given weekday. */
function shiftOccursOnDay(shift: ShiftRow, day: number) {
    return (
        shift.daysOfWeek.includes(day) ||
        (shift.crossesMidnight && shift.daysOfWeek.includes((day + 6) % 7))
    );
}

/** Optimistic (not yet confirmed by the server) rows use a temporary id. */
function isTempId(id: string) {
    return id.startsWith(TEMP_PREFIX);
}

function makeTempId() {
    const random =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${TEMP_PREFIX}${random}`;
}

/** Builds the row the UI shows immediately, before the server responds. */
function buildOptimisticRow(
    input: ShiftInput,
    data: ShiftsPageData,
    id: string,
    base?: ShiftRow,
): ShiftRow {
    const doctor = data.doctors.find((item) => item.id === input.doctorId);
    const clinic = data.clinics.find((item) => item.id === input.clinicId);
    const service = data.services.find((item) => item.id === input.serviceId);

    const start = parseHHmm(input.startTime) ?? base?.startMinute ?? 0;
    const end = parseHHmm(input.endTime) ?? start;
    const endMinute = resolveEnd(start, end);
    const now = new Date().toISOString();

    return {
        id,
        doctorId: input.doctorId,
        doctorNameEn: doctor?.fullNameEn ?? base?.doctorNameEn ?? "",
        doctorNameAr: doctor?.fullNameAr ?? base?.doctorNameAr ?? "",
        specialtyEn: doctor?.specialtyEn ?? base?.specialtyEn ?? "",
        specialtyAr: doctor?.specialtyAr ?? base?.specialtyAr ?? "",
        clinicId: input.clinicId,
        clinicNameEn: clinic?.nameEn ?? base?.clinicNameEn ?? "",
        clinicNameAr: clinic?.nameAr ?? base?.clinicNameAr ?? "",
        serviceId: input.serviceId,
        serviceNameEn: service?.nameEn ?? base?.serviceNameEn ?? "",
        serviceNameAr: service?.nameAr ?? base?.serviceNameAr ?? "",
        daysOfWeek: [...input.daysOfWeek].sort((a, b) => a - b),
        startTime: input.startTime,
        endTime: input.endTime,
        startMinute: start,
        endMinute,
        crossesMidnight: endMinute > MINUTES_IN_DAY,
        durationMinutes: endMinute - start,
        slotDurationMinutes: input.slotDurationMinutes,
        isActive: input.isActive !== false,
        createdAt: base?.createdAt ?? now,
        updatedAt: now,
    };
}

type Segment = {
    shift: ShiftRow;
    start: number;
    end: number;
    fromPrevDay: boolean;
    continuesNextDay: boolean;
};

function segmentsForDay(shifts: ShiftRow[], day: number): Segment[] {
    const segments: Segment[] = [];

    for (const shift of shifts) {
        if (shift.daysOfWeek.includes(day)) {
            segments.push({
                shift,
                start: shift.startMinute,
                end: Math.min(shift.endMinute, MINUTES_IN_DAY),
                fromPrevDay: false,
                continuesNextDay: shift.endMinute > MINUTES_IN_DAY,
            });
        }

        if (shift.crossesMidnight && shift.daysOfWeek.includes((day + 6) % 7)) {
            segments.push({
                shift,
                start: 0,
                end: shift.endMinute - MINUTES_IN_DAY,
                fromPrevDay: true,
                continuesNextDay: false,
            });
        }
    }

    return segments;
}

function layoutLanes(items: Segment[]) {
    const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
    const result: Array<{ segment: Segment; lane: number; lanes: number }> = [];

    let cluster: Array<{ segment: Segment; lane: number }> = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;

    const flush = () => {
        const lanes = Math.max(1, laneEnds.length);

        cluster.forEach((entry) => result.push({ ...entry, lanes }));
        cluster = [];
        laneEnds = [];
        clusterEnd = -1;
    };

    for (const segment of sorted) {
        if (cluster.length > 0 && segment.start >= clusterEnd) flush();

        let lane = laneEnds.findIndex((end) => end <= segment.start);

        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(segment.end);
        } else {
            laneEnds[lane] = segment.end;
        }

        cluster.push({ segment, lane });
        clusterEnd = Math.max(clusterEnd, segment.end);
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
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
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

function OvernightBadge({ t }: { t: Messages }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
            <Moon className="h-3 w-3" />
            {t.overnightBadge}
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

function ListSkeleton({ label }: { label: string }) {
    return (
        <div role="status" aria-busy="true" className="divide-y divide-slate-200 dark:divide-slate-800">
            <span className="sr-only">{label}</span>
            {Array.from({ length: PAGE_SIZE }, (_, index) => (
                <div key={index} className="flex animate-pulse items-center gap-4 px-5 py-4">
                    <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-1/4 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                    </div>
                    <div className="hidden h-3.5 w-28 rounded bg-slate-200 dark:bg-slate-800 md:block" />
                    <div className="hidden h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 md:block" />
                    <div className="h-8 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
                </div>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*                              Row actions menu                              */
/* -------------------------------------------------------------------------- */

function ShiftRowActions({
    shift,
    syncing,
    disabled,
    isRtl,
    t,
    handlers,
    size = "md",
}: {
    shift: ShiftRow;
    /** A background sync for this row is in flight (non-blocking indicator only). */
    syncing: boolean;
    /** Only true for rows that the server has not confirmed yet (temporary ids). */
    disabled: boolean;
    isRtl: boolean;
    t: Messages;
    handlers: RowHandlers;
    size?: "md" | "sm";
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const openedByKeyboard = useRef(false);

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

    // Keyboard users land on the first item; pointer users never get an item
    // focused automatically (that is what made "Edit Shift" look permanently hovered).
    useEffect(() => {
        if (!open || !position) return;

        if (openedByKeyboard.current) {
            menuRef.current
                ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
                ?.focus({ preventScroll: true });
        } else {
            menuRef.current?.focus({ preventScroll: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, position === null]);

    useEffect(() => {
        if (disabled && open) setOpen(false);
    }, [disabled, open]);

    const choose = (handler: (shift: ShiftRow) => void) => {
        if (disabled) return;

        setOpen(false);
        handler(shift);
    };

    const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();

        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
        );

        if (items.length === 0) return;

        const current = items.findIndex((item) => item === document.activeElement);

        if (event.key === "ArrowDown") {
            event.preventDefault();
            items[(current + 1) % items.length]?.focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            items[current === -1 ? items.length - 1 : (current - 1 + items.length) % items.length]?.focus();
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

    // Shared layout only — no colours, so no item looks "hovered" by default.
    const itemBase =
        "flex w-full items-center gap-3 rounded-lg bg-transparent px-3 py-2.5 text-start text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50";

    // One tone per action. Background shows only on real hover / keyboard focus.
    const tone = {
        edit: "flex w-full items-center gap-3 rounded-lg bg-transparent px-3 py-2.5 text-start text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100 disabled:pointer-events-none disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60",
        pause: "text-amber-600 hover:bg-amber-500/10 focus-visible:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/15 dark:focus-visible:bg-amber-500/15",
        resume: "text-emerald-600 hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/15 dark:focus-visible:bg-emerald-500/15",
        duplicate:
            "text-sky-600 hover:bg-sky-500/10 focus-visible:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/15 dark:focus-visible:bg-sky-500/15",
        delete: "text-rose-600 hover:bg-rose-500/10 focus-visible:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/15 dark:focus-visible:bg-rose-500/15",
    } as const;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={(event) => {
                    event.stopPropagation();

                    if (disabled) return;

                    // detail === 0 → activated from the keyboard.
                    openedByKeyboard.current = event.detail === 0;
                    setOpen((value) => !value);
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={cn(
                    "relative grid shrink-0 place-items-center rounded-lg border text-slate-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300",
                    size === "md" ? "h-10 w-10" : "h-6 w-6",
                    open
                        ? "border-teal-500 bg-teal-600/10 text-teal-600 dark:text-teal-400"
                        : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                )}
            >
                <MoreHorizontal className={size === "md" ? "h-5 w-5" : "h-4 w-4"} />
                {/* Non-blocking background sync indicator (never disables anything). */}
                {syncing && (
                    <span
                        title={t.syncing}
                        className="absolute end-1 top-1 h-2 w-2 animate-pulse rounded-full bg-teal-500"
                    />
                )}
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        tabIndex={-1}
                        dir={isRtl ? "rtl" : "ltr"}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={onMenuKeyDown}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[150] w-60 max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl shadow-black/30 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onEdit)}
                            className={cn(itemBase, tone.edit)}
                        >
                            <Pencil className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            {t.menuEdit}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onToggle)}
                            className={cn(itemBase, shift.isActive ? tone.pause : tone.resume)}
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
                            className={cn(itemBase, tone.duplicate)}
                        >
                            <Copy className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
                            {t.menuDuplicate}
                        </button>

                        <div className="my-1.5 h-px bg-slate-200 dark:bg-slate-700/70" />

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(handlers.onDelete)}
                            className={cn(itemBase, tone.delete)}
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
    syncing,
    handlers,
}: {
    shifts: ShiftRow[];
    variant: "planner" | "templates";
    locale: Locale;
    t: Messages;
    syncing: ReadonlySet<string>;
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
                            const rowSyncing = syncing.has(shift.id);
                            const rowTemp = isTempId(shift.id);

                            return (
                                <tr
                                    key={shift.id}
                                    aria-busy={rowSyncing || undefined}
                                    className={cn(
                                        "transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40",
                                        !shift.isActive && "opacity-80",
                                        rowTemp && "animate-pulse",
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
                                        {shift.crossesMidnight && (
                                            <div className="mt-1.5">
                                                <OvernightBadge t={t} />
                                            </div>
                                        )}
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
                                            syncing={rowSyncing}
                                            disabled={rowTemp}
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
                    const rowSyncing = syncing.has(shift.id);
                    const rowTemp = isTempId(shift.id);

                    return (
                        <li
                            key={shift.id}
                            aria-busy={rowSyncing || undefined}
                            className={cn(
                                "space-y-3 p-4",
                                !shift.isActive && "opacity-80",
                                rowTemp && "animate-pulse",
                            )}
                        >
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
                                    syncing={rowSyncing}
                                    disabled={rowTemp}
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
                                    {shift.crossesMidnight && (
                                        <div className="mt-1">
                                            <OvernightBadge t={t} />
                                        </div>
                                    )}
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
    syncing,
    handlers,
}: {
    shifts: ShiftRow[];
    days: number[];
    weekStart: Date | null;
    today: Date | null;
    locale: Locale;
    t: Messages;
    syncing: ReadonlySet<string>;
    handlers: RowHandlers;
}) {
    const isRtl = locale === "ar";

    const perDay = useMemo(
        () =>
            days.map((day) => ({
                day,
                items: layoutLanes(segmentsForDay(shifts, day)),
            })),
        [days, shifts],
    );

    const { startHour, endHour } = useMemo(() => {
        const visible = perDay.flatMap((entry) => entry.items.map((item) => item.segment));

        if (visible.length === 0) return { startHour: 8, endHour: 18 };

        const min = Math.min(...visible.map((segment) => segment.start));
        const max = Math.max(...visible.map((segment) => segment.end));
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

                            {items.map(({ segment, lane, lanes }) => {
                                const { shift } = segment;
                                const n = names(shift, locale);
                                const rowTemp = isTempId(shift.id);
                                const rowSyncing = syncing.has(shift.id);
                                const top = ((segment.start - startHour * 60) / 60) * HOUR_HEIGHT;
                                const height = Math.max(
                                    30,
                                    ((segment.end - segment.start) / 60) * HOUR_HEIGHT - 2,
                                );
                                const hint = segment.fromPrevDay
                                    ? t.fromPreviousDay
                                    : segment.continuesNextDay
                                        ? t.continuesNextDay
                                        : "";

                                return (
                                    <div
                                        key={`${shift.id}-${segment.fromPrevDay ? "prev" : "own"}`}
                                        role="button"
                                        tabIndex={rowTemp ? -1 : 0}
                                        aria-disabled={rowTemp || undefined}
                                        aria-busy={rowSyncing || undefined}
                                        onClick={() => {
                                            if (!rowTemp) handlers.onEdit(shift);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.target !== event.currentTarget || rowTemp) return;

                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                handlers.onEdit(shift);
                                            }
                                        }}
                                        title={`${doctorLabel(n.doctor, locale, t)} • ${timeRange(shift, locale)}${hint ? ` • ${hint}` : ""}`}
                                        style={{
                                            top: top + 1,
                                            height,
                                            insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                                            width: `calc(${100 / lanes}% - 4px)`,
                                        }}
                                        className={cn(
                                            "absolute overflow-hidden rounded-lg border border-s-4 px-2 py-1 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                                            rowTemp ? "cursor-default" : "cursor-pointer hover:brightness-110",
                                            paletteFor(shift.doctorId).block,
                                            !shift.isActive && "border-dashed opacity-60",
                                            segment.fromPrevDay && "rounded-t-none border-t-dashed",
                                            segment.continuesNextDay && "rounded-b-none",
                                            rowTemp && "animate-pulse",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1 truncate font-semibold leading-tight">
                                                    {shift.crossesMidnight && (
                                                        <Moon className="h-3 w-3 shrink-0 opacity-80" />
                                                    )}
                                                    <span className="truncate">
                                                        {doctorLabel(n.doctor, locale, t)}
                                                    </span>
                                                </p>
                                                <p className="truncate leading-tight opacity-80">
                                                    <bdi>{timeRange(shift, locale)}</bdi>
                                                </p>
                                            </div>
                                            <ShiftRowActions
                                                shift={shift}
                                                syncing={rowSyncing}
                                                disabled={rowTemp}
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
                                        {height >= 96 && hint && (
                                            <p className="mt-1 truncate text-[11px] font-medium opacity-80">{hint}</p>
                                        )}
                                        {height >= 116 && !shift.isActive && (
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

    const isFirst = page <= 1;
    const isLast = page >= totalPages;

    // Arrow buttons: neutral when enabled, flat / dimmed / non-interactive when disabled.
    const navButton =
        "grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-teal-500 hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-teal-400 dark:disabled:hover:border-slate-700 dark:disabled:hover:text-slate-200";

    return (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {fmt(t.showing, { from, to, total })}
            </p>

            <nav aria-label={t.pagination} className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={t.prevPage}
                    disabled={isFirst}
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
                            "grid h-10 min-w-10 place-items-center rounded-lg border px-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                            value === page
                                ? "border-teal-600 bg-teal-600 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-teal-400",
                        )}
                    >
                        {value}
                    </button>
                ))}

                <button
                    type="button"
                    aria-label={t.nextPage}
                    disabled={isLast}
                    onClick={() => onPage(Math.min(totalPages, page + 1))}
                    className={navButton}
                >
                    <NextIcon className="h-4 w-4" />
                </button>
            </nav>
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
    /** Fire-and-forget: the parent applies the change optimistically and closes the modal. */
    onSubmit: (input: ShiftInput, shiftId?: string) => void;
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
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
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

    // Live overnight / duration feedback for the time fields.
    const timeInfo = useMemo(() => {
        const start = parseHHmm(values.startTime);
        const end = parseHHmm(values.endTime);

        if (start === null || end === null) return null;

        const resolvedEnd = resolveEnd(start, end);

        return {
            start,
            end: resolvedEnd,
            duration: resolvedEnd - start,
            overnight: end < start,
        };
    }, [values.startTime, values.endTime]);

    const patch = (next: Partial<FormValues>) => {
        setValues((current) => ({ ...current, ...next }));
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

        const start = parseHHmm(values.startTime);
        const end = parseHHmm(values.endTime);
        const slot = Number(values.slot);
        let duration = 0;
        let resolvedEnd = 0;

        if (start === null || end === null) {
            next.time = t.errTimeRequired;
        } else {
            // Cross-midnight: an earlier end time means the next day.
            resolvedEnd = resolveEnd(start, end);
            duration = resolvedEnd - start;

            if (duration <= 0 || duration > MINUTES_IN_DAY) next.time = t.errTime;
        }

        if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
            next.slot = fmt(t.errSlot, { min: MIN_SLOT, max: MAX_SLOT });
        } else if (!next.time && duration < slot) {
            next.slot = t.errSlotFit;
        }

        if (!next.time && !next.days && values.isActive && values.doctorId && start !== null) {
            const mine = weeklyIntervals(values.days, start, resolvedEnd);

            const conflict = allShifts.some(
                (item) =>
                    item.id !== shift?.id &&
                    item.isActive &&
                    item.doctorId === values.doctorId &&
                    intervalsOverlap(
                        mine,
                        weeklyIntervals(item.daysOfWeek, item.startMinute, item.endMinute),
                    ),
            );

            if (conflict) next.time = t.errOverlap;
        }

        return next;
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const found = validate();
        setErrors(found);

        if (Object.keys(found).length > 0) return;

        onSubmit(
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
                if (event.target === event.currentTarget) onClose();
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
                        onClick={onClose}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
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

                            {timeInfo?.overnight && timeInfo.duration > 0 && timeInfo.duration <= MINUTES_IN_DAY && (
                                <p className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                                    <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    {fmt(t.overnightHint, { duration: formatDuration(timeInfo.duration, t) })}
                                </p>
                            )}

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
                                        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-60 dark:focus:ring-offset-slate-900",
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
                        <button type="button" onClick={onClose} className={cn(outlineButton, "px-6")}>
                            {t.cancel}
                        </button>
                        <button type="submit" className={cn(primaryButton, "px-6")}>
                            {isEdit ? t.saveSubmit : t.createSubmit}
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
    const [notice, setNotice] = useState<Notice | null>(null);

    /**
     * Background sync bookkeeping. Nothing here ever blocks the UI:
     *  - `queueRef` chains server calls per shift id so two actions on the same
     *    shift reach the server in the order the user performed them, while
     *    actions on different shifts run fully in parallel.
     *  - `pendingCountRef` lets a finished request know if newer optimistic
     *    changes are still queued (so it must not overwrite them).
     *  - `syncing` only drives a tiny pulsing dot on the affected row.
     */
    const queueRef = useRef(new Map<string, Promise<void>>());
    const pendingCountRef = useRef(new Map<string, number>());
    const [syncing, setSyncing] = useState<ReadonlySet<string>>(() => new Set<string>());

    const dataRef = useRef(data);
    dataRef.current = data;

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

        const timer = window.setTimeout(() => setNotice(null), 5000);

        return () => window.clearTimeout(timer);
    }, [notice]);

    /* --------------------------------- loading -------------------------------- */

    // Only used for the very first load (and the explicit Retry button).
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
                baseFiltered.filter((shift) => shiftOccursOnDay(shift, day)).length,
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
                : baseFiltered.filter((shift) => shiftOccursOnDay(shift, selectedDay)),
        );
    }, [tab, baseFiltered, selectedDay, sortRows]);

    const calendarDays = useMemo(
        () => (selectedDay === null ? [0, 1, 2, 3, 4, 5, 6] : [selectedDay]),
        [selectedDay],
    );

    // Client-side pagination: 4 shifts per page.
    const totalPages = Math.max(1, Math.ceil(listRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = listRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Back to page 1 whenever the filtered set changes.
    useEffect(() => {
        setPage(1);
    }, [doctorFilter, clinicFilter, selectedDay, tab, view]);

    // If the last row of the last page is removed, step back to a valid page.
    useEffect(() => {
        setPage((value) => Math.min(value, totalPages));
    }, [totalPages]);

    const weekLabel = useMemo(() => {
        if (weekOffset === 0 || !weekStart) return t.thisWeek;

        return `${formatDate(weekStart, locale)} – ${formatDate(addDays(weekStart, 6), locale)}`;
    }, [weekOffset, weekStart, locale, t.thisWeek]);

    /* ------------------------- optimistic state helpers ------------------------ */

    const notify = useCallback((kind: Notice["kind"], message: string) => {
        setNotice({ kind, message });
    }, []);

    const upsertShift = useCallback((row: ShiftRow) => {
        setData((current) => ({
            ...current,
            shifts: current.shifts.some((shift) => shift.id === row.id)
                ? current.shifts.map((shift) => (shift.id === row.id ? row : shift))
                : [...current.shifts, row],
        }));
    }, []);

    const patchShift = useCallback((id: string, changes: Partial<ShiftRow>) => {
        setData((current) => ({
            ...current,
            shifts: current.shifts.map((shift) => (shift.id === id ? { ...shift, ...changes } : shift)),
        }));
    }, []);

    const removeShift = useCallback((id: string) => {
        setData((current) => ({
            ...current,
            shifts: current.shifts.filter((shift) => shift.id !== id),
        }));
    }, []);

    const restoreShift = useCallback((row: ShiftRow) => {
        setData((current) =>
            current.shifts.some((shift) => shift.id === row.id)
                ? current
                : { ...current, shifts: [...current.shifts, row] },
        );
    }, []);

    /** Swaps an optimistic temp row for the server-confirmed row (or inserts it). */
    const replaceShift = useCallback((tempId: string, row: ShiftRow) => {
        setData((current) => {
            const exists = current.shifts.some((shift) => shift.id === tempId);

            return {
                ...current,
                shifts: exists
                    ? current.shifts.map((shift) => (shift.id === tempId ? row : shift))
                    : [...current.shifts.filter((shift) => shift.id !== row.id), row],
            };
        });
    }, []);

    const markSyncing = useCallback((id: string, on: boolean) => {
        setSyncing((current) => {
            if (current.has(id) === on) return current;

            const next = new Set(current);

            if (on) next.add(id);
            else next.delete(id);

            return next;
        });
    }, []);

    /** True when no newer request for this id is waiting behind the current one. */
    const isLastPending = useCallback((id: string) => (pendingCountRef.current.get(id) ?? 0) <= 1, []);

    /**
     * Runs a server task in the background. Tasks for the same id are chained
     * (so the server sees them in click order); tasks for other ids don't wait.
     * Callers have already updated the UI optimistically.
     */
    const enqueue = useCallback(
        (id: string, task: () => Promise<void>) => {
            const counts = pendingCountRef.current;

            counts.set(id, (counts.get(id) ?? 0) + 1);
            markSyncing(id, true);

            const previous = queueRef.current.get(id) ?? Promise.resolve();

            const run: Promise<void> = previous
                .then(task)
                .catch(() => undefined)
                .finally(() => {
                    const left = (counts.get(id) ?? 1) - 1;

                    if (left <= 0) {
                        counts.delete(id);

                        if (queueRef.current.get(id) === run) queueRef.current.delete(id);

                        markSyncing(id, false);
                    } else {
                        counts.set(id, left);
                    }
                });

            queueRef.current.set(id, run);
        },
        [markSyncing],
    );

    /* -------------------------------- handlers -------------------------------- */

    const changeView = (next: ViewKey) => {
        setView(next);

        if (next === "calendar") {
            setSelectedDay(null);
        } else if (today) {
            setSelectedDay(today.getDay());
        }
    };

    /** Create / edit: the modal closes and the table updates instantly. */
    const submitShift = (input: ShiftInput, shiftId?: string) => {
        setModal(null);

        if (shiftId) {
            const previous = dataRef.current.shifts.find((shift) => shift.id === shiftId);

            if (!previous || isTempId(shiftId)) return;

            upsertShift(buildOptimisticRow(input, dataRef.current, shiftId, previous));
            notify("success", t.updated);

            enqueue(shiftId, async () => {
                const rollback = (message: string) => {
                    upsertShift(previous);
                    notify("error", message);
                };

                try {
                    const result = await updateShiftAction({ ...input, shiftId });

                    if (!result.success || !result.data) {
                        rollback(result.error ?? t.failed);
                        return;
                    }

                    // Don't clobber newer optimistic changes that are still queued.
                    if (isLastPending(shiftId)) upsertShift(result.data.shift);
                } catch {
                    rollback(t.failed);
                }
            });

            return;
        }

        const tempId = makeTempId();

        upsertShift(buildOptimisticRow(input, dataRef.current, tempId));
        notify("success", t.created);

        enqueue(tempId, async () => {
            try {
                const result = await createShiftAction(input);

                if (!result.success || !result.data) {
                    removeShift(tempId);
                    notify("error", result.error ?? t.failed);
                    return;
                }

                replaceShift(tempId, result.data.shift);
            } catch {
                removeShift(tempId);
                notify("error", t.failed);
            }
        });
    };

    /** Pause / Resume: the badge flips on the very click; the server catches up silently. */
    const handleToggle = (shift: ShiftRow) => {
        if (isTempId(shift.id)) return;

        const target = !shift.isActive;

        // Instant local conflict check for resuming (same rules as the server).
        if (target) {
            const mine = weeklyIntervals(shift.daysOfWeek, shift.startMinute, shift.endMinute);

            const conflict = dataRef.current.shifts.some(
                (item) =>
                    item.id !== shift.id &&
                    item.isActive &&
                    item.doctorId === shift.doctorId &&
                    intervalsOverlap(
                        mine,
                        weeklyIntervals(item.daysOfWeek, item.startMinute, item.endMinute),
                    ),
            );

            if (conflict) {
                notify("error", t.errOverlap);
                return;
            }
        }

        patchShift(shift.id, { isActive: target });
        notify("success", target ? t.resumed : t.paused);

        enqueue(shift.id, async () => {
            const rollback = (message: string) => {
                // Only revert if nothing newer has changed the state in the meantime.
                if (isLastPending(shift.id)) patchShift(shift.id, { isActive: !target });

                notify("error", message);
            };

            try {
                // The desired state is sent explicitly, so a repeated request is idempotent.
                const result = await toggleShiftStatusAction(shift.id, target);

                if (!result.success || !result.data) {
                    rollback(result.error ?? t.failed);
                    return;
                }

                if (isLastPending(shift.id)) upsertShift(result.data.shift);
            } catch {
                rollback(t.failed);
            }
        });
    };

    /** Duplicate: a paused copy appears instantly, then swaps to the real row. */
    const handleDuplicate = (shift: ShiftRow) => {
        if (isTempId(shift.id)) return;

        const tempId = makeTempId();
        const now = new Date().toISOString();

        upsertShift({ ...shift, id: tempId, isActive: false, createdAt: now, updatedAt: now });
        notify("success", t.duplicated);

        enqueue(tempId, async () => {
            try {
                const result = await duplicateShiftAction(shift.id);

                if (!result.success || !result.data) {
                    removeShift(tempId);
                    notify("error", result.error ?? t.failed);
                    return;
                }

                replaceShift(tempId, result.data.shift);
            } catch {
                removeShift(tempId);
                notify("error", t.failed);
            }
        });
    };

    /** Delete: the row disappears at 0ms; it is restored (with a toast) only if the server refuses. */
    const confirmDelete = () => {
        if (!deleteTarget) return;

        const target = deleteTarget;

        setDeleteTarget(null);

        if (isTempId(target.id)) return;

        removeShift(target.id);
        notify("success", t.deleted);

        enqueue(target.id, async () => {
            try {
                const result = await deleteShiftAction(target.id);

                if (!result.success) {
                    restoreShift(target);
                    notify("error", result.error ?? t.failed);
                }
            } catch {
                restoreShift(target);
                notify("error", t.failed);
            }
        });
    };

    const handlers: RowHandlers = {
        onEdit: (shift) => {
            if (isTempId(shift.id)) return;

            setModal({ mode: "edit", shift });
        },
        onToggle: handleToggle,
        onDuplicate: handleDuplicate,
        onDelete: (shift) => {
            if (isTempId(shift.id)) return;

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
                            className="flex gap-2 overflow-y-hidden overflow-x-auto border-b border-slate-200 dark:border-slate-800"
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
                            {loading && <ListSkeleton label={t.loading} />}

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
                                    syncing={syncing}
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
                                        syncing={syncing}
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
                            <span suppressHydrationWarning>
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
                        if (event.target === event.currentTarget) setDeleteTarget(null);
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

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className={cn(outlineButton, "px-6")}
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t.deleteConfirm}
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