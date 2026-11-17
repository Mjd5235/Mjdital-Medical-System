"use client";

/**
 * Users & Roles — page
 * --------------------
 * Same architecture as the Doctors Management page:
 * - The list is loaded once (all pages of 100 are fetched in a loop) and then searched, filtered and
 *   paginated on the client. `useDeferredValue` keeps typing smooth.
 * - A ref-backed local store (`usersRef` + `updateUsers`) is updated synchronously, so every action
 *   is reflected in the UI in the same frame (0 ms) and rapid clicks always see the latest rows.
 * - TRUE optimistic updates for Create, Edit, Disable / Re-activate and Delete:
 *     1. the row is changed locally and the modal closes instantly,
 *     2. the server call runs in the background through a per-row queue (strict ordering),
 *     3. on success the optimistic row is swapped for the confirmed one (no visual jump),
 *     4. on failure the change is rolled back, a silent resync runs and an error toast is shown.
 * - Duplicate email / mobile are pre-checked against the local list so the field error still appears
 *   inline without waiting for the network.
 * - Lifecycle (mirrors the server `deriveStatus`):
 *     Pending  = !isActive && mustChangePassword && no activatedAt   (awaiting first login)
 *     Active   = isActive
 *     Disabled = !isActive in every other case (manually disabled; stamped with activatedAt)
 * - Mobile input: "+966" is a fixed affix; the user types 05XXXXXXXX only (hard limit of 10 digits,
 *   forced "05" prefix, digits only, paste is sanitised).
 *
 * Hierarchical RBAC (UI mirror of the server rules in actions.ts — the server is the authority):
 * - `viewerIsSuperAdmin` comes from the server (re-read from the database on every fetch).
 * - Super Admin rows get a glowing teal/indigo "Super Admin" pill.
 * - A regular Admin sees Admin / Super Admin rows with a locked, disabled action button (tooltip),
 *   no Edit / Disable / Re-activate / Delete / Regenerate controls, and the "Admin" option of the
 *   role dropdown is locked in the create / edit dialog.
 * - Optimistic mutations are guarded too, so a forbidden action never even flickers in the table.
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
    type ClipboardEvent,
    type FormEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Copy,
    Crown,
    Eye,
    EyeOff,
    Filter,
    KeyRound,
    Loader2,
    Lock,
    Mail,
    MoreHorizontal,
    Pencil,
    Plus,
    PowerOff,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Smartphone,
    Trash2,
    UserRound,
    X,
    UserX,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createUserAction,
    deleteUserAction,
    getUsersAction,
    regenerateTempPasswordAction,
    toggleUserStatusAction,
    updateUserAction,
    type UserAccountStatus,
    type UserRow,
} from "./actions";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 10;
const FETCH_PAGE_SIZE = 100;
const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const MANAGEMENT_HREF = "/admin/staff/users-roles";
const TEMP_ID_PREFIX = "temp-user-";
const MOBILE_LENGTH = 10;

type ManagedRole = "ADMIN" | "RECEPTIONIST";
type RoleFilter = "ALL" | ManagedRole;
type StatusFilter = "ALL" | UserAccountStatus;

interface UsersRolesPageProps {
    initialLocale: Locale;
}

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

/** Destructive: solid red/rose. Used only for "Delete Account". */
const dangerButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

/** Warning: soft amber pill. Used only for "Disable Account" (reversible). */
const warnPill =
    "inline-flex items-center justify-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50";

/** Positive: solid emerald pill. Used only for "Re-activate". */
const reactivatePill =
    "inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

const messages = {
    en: {
        breadcrumbRoot: "Staff & Permissions",
        title: "Users & Roles",
        subtitle: "Manage administrative staff and reception accounts, and control system access.",
        add: "Add New User",
        search: "Search name, email, or phone number",
        allRoles: "All Roles",
        allStatuses: "All statuses",
        reset: "Reset Filters",
        filterLabel: "Filter by status",
        roleFilterLabel: "Filter by role",
        colEmployee: "Employee",
        colRole: "Role",
        colLastLogin: "Last Login",
        colStatus: "Status",
        colActions: "Actions",
        roleAdmin: "Admin",
        roleReceptionist: "Receptionist",
        superAdmin: "Super Admin",
        superAdminHint: "Super Admin — full, unrestricted system privileges",
        restrictedTitle: "Only a Super Admin can manage Admin accounts.",
        restrictedAria: "Actions unavailable — Super Admin only",
        restrictedNotice:
            "You are signed in as an Admin. You can manage Receptionist accounts only — Admin and Super Admin accounts can be managed by a Super Admin.",
        statusActive: "Active",
        statusPending: "Pending",
        statusDisabled: "Disabled",
        pendingHint: "Awaiting first login",
        neverLoggedIn: "Never",
        you: "You",
        syncing: "Saving…",
        showing: (from: number, to: number, total: number) =>
            `Showing ${from}–${to} of ${total} users`,
        showingNone: "Showing 0 of 0 users",
        previousPage: "Previous page",
        nextPage: "Next page",
        page: (n: number) => `Page ${n}`,
        emptyTitle: "No users found",
        emptyBody: "Try a different search or reset the filters.",
        loadFailed: "Unable to load users. Please try again.",
        retry: "Retry",
        rowActions: "Row actions",
        menuEdit: "Edit User",
        menuDisable: "Disable Account",
        menuReactivate: "Re-activate Account",
        menuRegenerate: "Regenerate & Copy Temp Password",
        menuDelete: "Delete Account",
        disable: "Disable",
        reactivate: "Re-activate",
        createTitle: "Create New User",
        createSubtitle: "Add a staff account and assign the appropriate access role.",
        editTitle: "Edit User",
        editSubtitle: "Update the staff member's details and access role.",
        close: "Close",
        fullName: "Full Name",
        fullNamePlaceholder: "e.g. Sarah Alotaibi",
        email: "Official Email",
        emailPlaceholder: "name@clinic.sa",
        mobile: "Mobile Number",
        mobilePlaceholder: "05XXXXXXXX",
        mobileHelp: "Start with 05 — exactly 10 digits. The +966 code is added for you.",
        role: "Role",
        roleHelp: "Available roles: Admin or Receptionist",
        roleHelpRestricted:
            "Available role: Receptionist. Only a Super Admin can assign the Admin role.",
        roleLocked: "You cannot change your own role.",
        roleLockedSuper: "A Super Admin account always keeps the Admin role.",
        roleAdminLocked: "Only a Super Admin can assign the Admin role.",
        errRoleForbidden: "Only a Super Admin can assign the Admin role.",
        forbidden: "You do not have permission to perform this action.",
        tempPassword: "Temporary Password",
        generate: "Generate",
        copy: "Copy",
        copied: "Copied",
        showPassword: "Show password",
        hidePassword: "Hide password",
        mustChangeNote:
            "The account is created as Pending. The user must change this password at first login, and the account becomes Active afterwards.",
        cancel: "Cancel",
        create: "Create Account",
        save: "Save Changes",
        errName: "Enter a valid full name.",
        errEmail: "Enter a valid official email address.",
        errMobile: "Enter a valid Saudi mobile number: 05 followed by 8 digits.",
        errPassword: "Use 8+ characters with uppercase, lowercase and a number, no spaces.",
        errDuplicateEmail: "A user with this email already exists.",
        errDuplicateMobile: "This mobile number is already assigned to another user.",
        created: "User created. Status: Pending — awaiting first login.",
        updated: "User updated successfully.",
        activated: "Account re-activated.",
        disabledMsg: "Account disabled.",
        deleted: "User deleted successfully.",
        regenerated: "New temporary password generated and copied to the clipboard.",
        copyFailed: "Password generated, but copying failed. Copy it manually:",
        failed: "The operation could not be completed.",
        dismiss: "Dismiss",
        deleteTitle: "Delete account?",
        deleteQuestion: "Are you sure you want to delete this account?",
        deleteBody:
            "This permanently removes the user account and its audit trail. This action cannot be undone. To keep the records, disable the account instead.",
        deleteConfirm: "Delete Account",
    },
    ar: {
        breadcrumbRoot: "الموظفون والصلاحيات",
        title: "المستخدمون والأدوار",
        subtitle: "إدارة حسابات الموظفين الإداريين والاستقبال والتحكم في الوصول إلى النظام.",
        add: "إضافة مستخدم جديد",
        search: "ابحث بالاسم أو البريد أو رقم الجوال",
        allRoles: "كل الأدوار",
        allStatuses: "كل الحالات",
        reset: "إعادة ضبط الفلاتر",
        filterLabel: "تصفية حسب الحالة",
        roleFilterLabel: "تصفية حسب الدور",
        colEmployee: "الموظف",
        colRole: "الدور",
        colLastLogin: "آخر دخول",
        colStatus: "الحالة",
        colActions: "الإجراءات",
        roleAdmin: "مدير",
        roleReceptionist: "موظف استقبال",
        superAdmin: "مدير عام",
        superAdminHint: "مدير عام — صلاحيات كاملة وغير مقيّدة على النظام",
        restrictedTitle: "حسابات المديرين يديرها المدير العام فقط.",
        restrictedAria: "الإجراءات غير متاحة — للمدير العام فقط",
        restrictedNotice:
            "أنت مسجّل الدخول بصفة مدير. يمكنك إدارة حسابات موظفي الاستقبال فقط — أما حسابات المديرين والمدير العام فيديرها المدير العام.",
        statusActive: "نشط",
        statusPending: "قيد الانتظار",
        statusDisabled: "معطّل",
        pendingHint: "بانتظار أول تسجيل دخول",
        neverLoggedIn: "لم يسجّل الدخول",
        you: "أنت",
        syncing: "جارٍ الحفظ…",
        showing: (from: number, to: number, total: number) =>
            `عرض ${from}–${to} من ${total} مستخدماً`,
        showingNone: "عرض 0 من 0 مستخدم",
        previousPage: "الصفحة السابقة",
        nextPage: "الصفحة التالية",
        page: (n: number) => `الصفحة ${n}`,
        emptyTitle: "لا يوجد مستخدمون",
        emptyBody: "جرّب بحثاً مختلفاً أو أعد ضبط الفلاتر.",
        loadFailed: "تعذّر تحميل المستخدمين. حاول مرة أخرى.",
        retry: "إعادة المحاولة",
        rowActions: "إجراءات الصف",
        menuEdit: "تعديل المستخدم",
        menuDisable: "تعطيل الحساب",
        menuReactivate: "إعادة تفعيل الحساب",
        menuRegenerate: "إعادة توليد ونسخ كلمة المرور المؤقتة",
        menuDelete: "حذف الحساب",
        disable: "تعطيل",
        reactivate: "إعادة تفعيل",
        createTitle: "إنشاء مستخدم جديد",
        createSubtitle: "أضف حساب موظف وحدد دور الصلاحيات المناسب.",
        editTitle: "تعديل المستخدم",
        editSubtitle: "حدّث بيانات الموظف ودور الصلاحيات.",
        close: "إغلاق",
        fullName: "الاسم الكامل",
        fullNamePlaceholder: "مثال: سارة العتيبي",
        email: "البريد الرسمي",
        emailPlaceholder: "name@clinic.sa",
        mobile: "رقم الجوال",
        mobilePlaceholder: "05XXXXXXXX",
        mobileHelp: "ابدأ بـ 05 — 10 أرقام بالضبط. يتم إضافة رمز الدولة +966 تلقائياً.",
        role: "الدور",
        roleHelp: "الأدوار المتاحة: مدير أو موظف استقبال",
        roleHelpRestricted:
            "الدور المتاح: موظف استقبال. تعيين دور المدير متاح للمدير العام فقط.",
        roleLocked: "لا يمكنك تغيير دورك الخاص.",
        roleLockedSuper: "حساب المدير العام يحتفظ دائماً بدور المدير.",
        roleAdminLocked: "تعيين دور المدير متاح للمدير العام فقط.",
        errRoleForbidden: "تعيين دور المدير متاح للمدير العام فقط.",
        forbidden: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
        tempPassword: "كلمة المرور المؤقتة",
        generate: "توليد",
        copy: "نسخ",
        copied: "تم النسخ",
        showPassword: "إظهار كلمة المرور",
        hidePassword: "إخفاء كلمة المرور",
        mustChangeNote:
            "يُنشأ الحساب بحالة قيد الانتظار. يجب على المستخدم تغيير كلمة المرور عند أول تسجيل دخول، ثم يصبح الحساب نشطاً.",
        cancel: "إلغاء",
        create: "إنشاء الحساب",
        save: "حفظ التغييرات",
        errName: "أدخل اسماً كاملاً صحيحاً.",
        errEmail: "أدخل بريداً إلكترونياً رسمياً صحيحاً.",
        errMobile: "أدخل رقم جوال سعودي صحيحاً: 05 متبوعاً بـ 8 أرقام.",
        errPassword: "استخدم 8 أحرف على الأقل مع حرف كبير وصغير ورقم دون مسافات.",
        errDuplicateEmail: "يوجد مستخدم بهذا البريد الإلكتروني بالفعل.",
        errDuplicateMobile: "رقم الجوال هذا مسجّل لمستخدم آخر.",
        created: "تم إنشاء المستخدم. الحالة: قيد الانتظار — بانتظار أول تسجيل دخول.",
        updated: "تم تحديث المستخدم بنجاح.",
        activated: "تمت إعادة تفعيل الحساب.",
        disabledMsg: "تم تعطيل الحساب.",
        deleted: "تم حذف المستخدم بنجاح.",
        regenerated: "تم توليد كلمة مرور مؤقتة جديدة ونسخها إلى الحافظة.",
        copyFailed: "تم توليد كلمة المرور لكن تعذّر نسخها. انسخها يدوياً:",
        failed: "تعذّر إكمال العملية.",
        dismiss: "إغلاق",
        deleteTitle: "حذف الحساب؟",
        deleteQuestion: "هل أنت متأكد أنك تريد حذف هذا الحساب؟",
        deleteBody:
            "سيؤدي هذا إلى حذف حساب المستخدم وسجل التدقيق الخاص به نهائياً، ولا يمكن التراجع عن ذلك. للاحتفاظ بالسجلات يمكنك تعطيل الحساب بدلاً من حذفه.",
        deleteConfirm: "حذف الحساب",
    },
} as const;

type Messages = (typeof messages)[Locale];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const LOCAL_MOBILE_PATTERN = /^05\d{8}$/;
const STORED_MOBILE_PATTERN = /^\+9665\d{8}$/;

const AVATAR_TONES = [
    "bg-blue-600/80 text-white",
    "bg-teal-700/80 text-white",
    "bg-fuchsia-800/70 text-white",
    "bg-indigo-700/80 text-white",
    "bg-emerald-700/80 text-white",
    "bg-amber-700/80 text-white",
];

function hashString(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index++) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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

/* ---------------------------- hierarchy helpers ---------------------------- */

/**
 * Mirrors `canManageTarget` in actions.ts — keep both in sync.
 * A Super Admin manages everyone; a regular Admin manages only non-Admin, non-Super-Admin users.
 * (The server remains the single authority; this only drives what the UI shows.)
 */
function canManageUser(
    user: Pick<UserRow, "role" | "isSuperAdmin">,
    viewerIsSuperAdmin: boolean,
): boolean {
    return viewerIsSuperAdmin || (user.role !== "ADMIN" && !user.isSuperAdmin);
}

/* ------------------------------ mobile helpers ----------------------------- */

/**
 * Keeps the field foolproof: digits only, always starts with "05", never longer than 10 digits.
 * Also understands pasted values such as "+966 5X XXX XXXX", "00966…" or "5XXXXXXXX".
 */
function sanitizeMobileInput(raw: string): string {
    let digits = raw.replace(/\D/g, "");

    if (digits.length > MOBILE_LENGTH) {
        if (digits.startsWith("00966")) digits = digits.slice(5);
        else if (digits.startsWith("966")) digits = digits.slice(3);
    }

    if (digits.startsWith("5")) digits = `0${digits}`;
    if (digits.length > 0 && !digits.startsWith("0")) return "";
    if (digits.length > 1 && digits[1] !== "5") digits = digits.slice(0, 1);

    return digits.slice(0, MOBILE_LENGTH);
}

/** "+9665XXXXXXXX" -> "05XXXXXXXX" (what the input shows). */
function toLocalMobile(stored: string | null): string {
    return stored && STORED_MOBILE_PATTERN.test(stored) ? `0${stored.slice(4)}` : "";
}

/** "05XXXXXXXX" -> "+9665XXXXXXXX" (what is stored). */
function toStoredMobile(local: string): string {
    return `+966${local.slice(1)}`;
}

function formatMobileDisplay(stored: string): string {
    if (!STORED_MOBILE_PATTERN.test(stored)) return stored;

    return `${stored.slice(0, 4)} ${stored.slice(4, 6)} ${stored.slice(6, 9)} ${stored.slice(9)}`;
}

/* ------------------------------ status helpers ----------------------------- */

/** Mirrors `deriveStatus` in actions.ts — keep both in sync. */
function deriveStatus(
    isActive: boolean,
    mustChangePassword: boolean,
    activatedAt: string | null,
): UserAccountStatus {
    if (isActive) return "ACTIVE";

    return mustChangePassword && !activatedAt ? "PENDING" : "DISABLED";
}

function isAcceptablePassword(value: string): boolean {
    return (
        value.length >= 8 &&
        value.length <= 128 &&
        !/\s/.test(value) &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /\d/.test(value)
    );
}

/** Secure client-side generator so "Generate" responds in the same frame. */
function generatePassword(length = 14): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%&*?";
    const all = upper + lower + digits + symbols;

    const random = (max: number): number => {
        const buffer = new Uint32Array(1);
        const limit = Math.floor(0x1_0000_0000 / max) * max;

        do {
            crypto.getRandomValues(buffer);
        } while (buffer[0] >= limit);

        return buffer[0] % max;
    };

    const pick = (set: string) => set[random(set.length)];
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

    while (chars.length < length) chars.push(pick(all));

    for (let index = chars.length - 1; index > 0; index--) {
        const swap = random(index + 1);
        [chars[index], chars[swap]] = [chars[swap], chars[index]];
    }

    return chars.join("");
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to legacy copy
    }

    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

function formatLastLogin(iso: string | null, locale: Locale): { date: string; time: string } | null {
    if (!iso) return null;

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return null;

    const tag = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US";
    const zone = "Asia/Riyadh";

    const datePart = new Intl.DateTimeFormat(tag, {
        timeZone: zone,
        month: "short",
        day: "2-digit",
        year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat(tag, {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).format(date);

    return { date: datePart.replace(/,\s*(\d{4})$/, ", $1"), time: timePart };
}

function pageWindow(current: number, total: number): number[] {
    if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);

    if (current <= 3) return [1, 2, 3, 4, 5];
    if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];

    return [current - 2, current - 1, current, current + 1, current + 2];
}

type ToastKind = "success" | "error";
type ToastItem = { id: number; kind: ToastKind; message: string };

interface FormValues {
    fullName: string;
    email: string;
    /** Stored format: +9665XXXXXXXX */
    mobileNumber: string;
    role: ManagedRole;
    temporaryPassword: string;
}

type FormField = "fullName" | "email" | "mobileNumber" | "temporaryPassword" | "role";
type FormErrors = Partial<Record<FormField, string>>;

interface SubmitOutcome {
    ok: boolean;
    errors?: FormErrors;
}

type ModalState = { mode: "create" } | { mode: "edit"; user: UserRow };

/* ----------------------------- optimistic rows ----------------------------- */

function buildCreatedRow(values: FormValues, id: string): UserRow {
    return {
        id,
        fullName: values.fullName,
        email: values.email,
        mobileNumber: values.mobileNumber,
        role: values.role,
        // Never grantable from the UI.
        isSuperAdmin: false,
        status: "PENDING",
        isActive: false,
        mustChangePassword: true,
        activatedAt: null,
        isCurrentUser: false,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
    };
}

function buildEditedRow(base: UserRow, values: FormValues): UserRow {
    return {
        ...base,
        fullName: values.fullName,
        email: values.email,
        mobileNumber: values.mobileNumber,
        role: values.role,
    };
}

function buildToggledRow(base: UserRow, enabled: boolean): UserRow {
    // Same rule as the server: disabling stamps activatedAt, so it can never read as "Pending".
    const activatedAt = base.activatedAt ?? new Date().toISOString();

    return {
        ...base,
        isActive: enabled,
        activatedAt,
        status: deriveStatus(enabled, base.mustChangePassword, activatedAt),
    };
}

/** Merges a server snapshot into the local store without clobbering in-flight local changes. */
function mergeServerRows(
    current: UserRow[],
    server: UserRow[],
    busyIds: ReadonlySet<string>,
): UserRow[] {
    const localById = new Map(current.map((row) => [row.id, row] as const));
    const temps = current.filter((row) => isTempId(row.id));
    const merged: UserRow[] = [];

    for (const row of server) {
        if (busyIds.has(row.id)) {
            const local = localById.get(row.id);

            // Deleted locally while the request is still running: keep it hidden.
            if (local) merged.push(local);
            continue;
        }

        merged.push(row);
    }

    return [...temps, ...merged];
}

async function fetchAllUsers(): Promise<
    { rows: UserRow[]; viewerIsSuperAdmin: boolean } | { error: string | null }
> {
    const first = await getUsersAction({ page: 1, pageSize: FETCH_PAGE_SIZE });

    if (!first.success || !first.data) {
        return { error: first.error ?? null };
    }

    const rows: UserRow[] = [...first.data.users];
    const totalPages = first.data.totalPages ?? 1;
    const viewerIsSuperAdmin = Boolean(first.data.viewer?.isSuperAdmin);

    if (totalPages > 1) {
        const rest = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
                getUsersAction({ page: index + 2, pageSize: FETCH_PAGE_SIZE }),
            ),
        );

        for (const result of rest) {
            if (!result.success || !result.data) {
                return { error: result.error ?? null };
            }

            rows.push(...result.data.users);
        }
    }

    return { rows, viewerIsSuperAdmin };
}

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces                                               */
/* -------------------------------------------------------------------------- */

function Avatar({ name, id }: { name: string; id: string }) {
    const tone = AVATAR_TONES[hashString(id || name) % AVATAR_TONES.length];

    return (
        <div
            aria-hidden="true"
            className={`flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full text-base font-bold ${tone}`}
        >
            {initialsOf(name)}
        </div>
    );
}

function RoleBadge({
    role,
    isSuperAdmin = false,
    t,
}: {
    role: ManagedRole;
    isSuperAdmin?: boolean;
    t: Messages;
}) {
    // Super Admin: replaces the plain "Admin" label with the glowing teal/indigo pill.
    if (isSuperAdmin) {
        return (
            <span
                title={t.superAdminHint}
                className="inline-flex items-center gap-2 rounded-lg border border-teal-400/40 bg-gradient-to-r from-teal-500/15 via-teal-500/10 to-indigo-500/20 px-3 py-1.5 text-sm font-bold text-teal-700 shadow-[0_0_14px_rgba(45,212,191,0.35)] ring-1 ring-indigo-400/25 dark:text-teal-200"
            >
                <Crown className="h-4 w-4" />
                {t.superAdmin}
            </span>
        );
    }

    const isAdmin = role === "ADMIN";

    return (
        <span
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${isAdmin
                ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                }`}
        >
            {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            {isAdmin ? t.roleAdmin : t.roleReceptionist}
        </span>
    );
}

/** Glowing teal → indigo pill shown next to every account where `isSuperAdmin === true`. */
function SuperAdminBadge({ t }: { t: Messages }) {
    return (
        <span
            title={t.superAdminHint}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-teal-400/40 bg-gradient-to-r from-teal-500/15 via-teal-500/10 to-indigo-500/20 px-2.5 py-0.5 text-xs font-bold tracking-wide text-teal-700 shadow-[0_0_14px_rgba(45,212,191,0.35)] ring-1 ring-indigo-400/25 dark:text-teal-200"
        >
            <Crown className="h-3.5 w-3.5" />
            {t.superAdmin}
        </span>
    );
}

function StatusBadge({ status, t }: { status: UserAccountStatus; t: Messages }) {
    const config = {
        ACTIVE: {
            label: t.statusActive,
            wrap: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            dot: "bg-emerald-400",
        },
        PENDING: {
            label: t.statusPending,
            wrap: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            dot: "bg-amber-400",
        },
        DISABLED: {
            label: t.statusDisabled,
            wrap: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
            dot: "bg-slate-400",
        },
    }[status];

    return (
        <span
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${config.wrap}`}
        >
            <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }, (_, row) => (
                <tr
                    key={row}
                    className="animate-pulse border-t border-slate-200 dark:border-slate-800"
                    aria-hidden="true"
                >
                    <td className="px-6 py-4 align-middle">
                        <div className="flex items-center gap-4">
                            <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-2">
                                <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                                <div className="h-3 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-9 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                    <td className="px-4 py-4 align-middle">
                        <div className="mx-auto h-9 w-9 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                </tr>
            ))}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*  Dropdown (absolute menu, closes on outside click / Escape)                */
/* -------------------------------------------------------------------------- */

interface DropdownOption<V extends string> {
    value: V;
    label: string;
    /** Locked option: rendered with a lock icon, not selectable. */
    disabled?: boolean;
    /** Tooltip shown on a locked option. */
    hint?: string;
}

function Dropdown<V extends string>({
    value,
    options,
    onChange,
    ariaLabel,
    icon,
    disabled = false,
    className = "",
}: {
    value: V;
    options: DropdownOption<V>[];
    onChange: (value: V) => void;
    ariaLabel: string;
    icon?: ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
            }
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown, true);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown, true);
        };
    }, [open]);

    const current = options.find((option) => option.value === value) ?? options[0];

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                disabled={disabled}
                onClick={() => setOpen((state) => !state)}
                className={`flex h-11 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-start text-sm text-slate-900 transition hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 ${open ? "border-teal-500 ring-2 ring-teal-500/20" : ""
                    }`}
            >
                {icon}
                <span className="min-w-0 flex-1 truncate">{current?.label}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 dark:text-slate-400 ${open ? "rotate-180" : ""
                        }`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.ul
                        id={listId}
                        role="listbox"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/30 dark:border-slate-700 dark:bg-slate-900"
                    >
                        {options.map((option) => {
                            const selected = option.value === value;
                            const locked = Boolean(option.disabled);

                            return (
                                <li
                                    key={option.value}
                                    role="option"
                                    aria-selected={selected}
                                    aria-disabled={locked}
                                >
                                    <button
                                        type="button"
                                        disabled={locked}
                                        title={locked ? option.hint : undefined}
                                        onClick={() => {
                                            if (locked) return;

                                            setOpen(false);
                                            onChange(option.value);
                                        }}
                                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition-colors duration-150 ${locked
                                            ? "cursor-not-allowed text-slate-400 opacity-60 dark:text-slate-500"
                                            : selected
                                                ? "bg-teal-600/10 text-teal-700 dark:text-teal-300"
                                                : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        <span className="truncate">{option.label}</span>
                                        {locked ? (
                                            <Lock className="h-4 w-4 shrink-0" />
                                        ) : (
                                            selected && <Check className="h-4 w-4 shrink-0" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Row actions menu (portal so the table never clips it)                     */
/* -------------------------------------------------------------------------- */

function RowActions({
    user,
    t,
    isRtl,
    busy,
    syncing,
    canManage,
    onEdit,
    onToggleStatus,
    onRegenerate,
    onDelete,
}: {
    user: UserRow;
    t: Messages;
    isRtl: boolean;
    busy: boolean;
    syncing: boolean;
    /** false => the viewer's rank is not high enough to act on this row. */
    canManage: boolean;
    onEdit: (user: UserRow) => void;
    onToggleStatus: (user: UserRow, enabled: boolean) => void;
    onRegenerate: (user: UserRow) => void;
    onDelete: (user: UserRow) => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const MENU_WIDTH = 300;
    const canDisable = user.status === "ACTIVE" && !user.isCurrentUser;
    const canReactivate = user.status === "DISABLED";
    const canRegenerate = user.status === "PENDING";
    const canDelete = !user.isCurrentUser;
    const itemCount =
        1 +
        (canRegenerate ? 1 : 0) +
        (canDisable ? 1 : 0) +
        (canReactivate ? 1 : 0) +
        (canDelete ? 1 : 0);

    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        let left = isRtl ? rect.left : rect.right - MENU_WIDTH;

        left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));

        const estimatedHeight = 24 + itemCount * 48 + (canDelete ? 12 : 0);
        const top =
            rect.bottom + estimatedHeight > window.innerHeight
                ? Math.max(8, rect.top - estimatedHeight - 6)
                : rect.bottom + 6;

        setPosition({ top, left });
    }, [open, isRtl, itemCount, canDelete]);

    useEffect(() => {
        if (!open) return;

        const close = () => setOpen(false);
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;

            if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);

        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
        };
    }, [open]);

    // Hierarchy lock: no menu, no handlers — just a disabled button explaining why.
    if (!canManage) {
        return (
            <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label={t.restrictedAria}
                title={t.restrictedTitle}
                className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 opacity-80 dark:border-slate-700 dark:text-slate-500"
            >
                <Lock className="h-5 w-5" />
            </button>
        );
    }

    const itemClass =
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm font-medium text-slate-800 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

    const choose = (action: () => void) => {
        setOpen(false);
        action();
    };

    const locked = busy || syncing;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={locked}
                title={syncing ? t.syncing : undefined}
                onClick={() => setOpen((state) => !state)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
                {locked ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <MoreHorizontal className="h-6 w-6" />
                )}
            </button>

            {typeof document !== "undefined" &&
                createPortal(
                    <AnimatePresence>
                        {open && position && (
                            <motion.div
                                ref={menuRef}
                                role="menu"
                                dir={isRtl ? "rtl" : "ltr"}
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
                                className="z-[70] rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/40 dark:border-slate-700 dark:bg-slate-900"
                            >
                                <button
                                    type="button"
                                    role="menuitem"
                                    className={itemClass}
                                    onClick={() => choose(() => onEdit(user))}
                                >
                                    <Pencil className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                    {t.menuEdit}
                                </button>

                                {user.status === "PENDING" && (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`${itemClass} !text-teal-700 dark:!text-teal-300`}
                                        onClick={() => choose(() => onRegenerate(user))}
                                    >
                                        <KeyRound className="h-4 w-4" />
                                        {t.menuRegenerate}
                                    </button>
                                )}

                                {user.status === "ACTIVE" && !user.isCurrentUser && (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`${itemClass} !text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10`}
                                        onClick={() => choose(() => onToggleStatus(user, false))}
                                    >
                                        <UserX className="h-4 w-4" />
                                        {t.menuDisable}
                                    </button>
                                )}

                                {user.status === "DISABLED" && (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`${itemClass} !text-emerald-600 dark:!text-emerald-300`}
                                        onClick={() => choose(() => onToggleStatus(user, true))}
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        {t.menuReactivate}
                                    </button>
                                )}

                                {!user.isCurrentUser && (
                                    <>
                                        <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className={`${itemClass} !text-rose-600 hover:!bg-rose-500/10 dark:!text-rose-300`}
                                            onClick={() => choose(() => onDelete(user))}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {t.menuDelete}
                                        </button>
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body,
                )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*  Create / Edit user dialog                                                 */
/* -------------------------------------------------------------------------- */

interface FormState {
    fullName: string;
    email: string;
    /** Local format shown in the input: 05XXXXXXXX */
    mobileNumber: string;
    role: ManagedRole;
    temporaryPassword: string;
}

function Field({
    label,
    htmlFor,
    error,
    help,
    children,
}: {
    label: string;
    htmlFor: string;
    error?: string;
    help?: string;
    children: ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                {label}
            </label>
            {children}
            {error ? (
                <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                    {error}
                </p>
            ) : help ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{help}</p>
            ) : null}
        </div>
    );
}

function UserFormDialog({
    user,
    t,
    isRtl,
    viewerIsSuperAdmin,
    onClose,
    onSubmit,
}: {
    user: UserRow | null;
    t: Messages;
    isRtl: boolean;
    viewerIsSuperAdmin: boolean;
    onClose: () => void;
    onSubmit: (target: UserRow | null, values: FormValues) => SubmitOutcome;
}) {
    const isEdit = user !== null;

    const [form, setForm] = useState<FormState>(() =>
        user
            ? {
                fullName: user.fullName,
                email: user.email,
                mobileNumber: toLocalMobile(user.mobileNumber),
                role: user.role,
                temporaryPassword: "",
            }
            : {
                fullName: "",
                email: "",
                mobileNumber: "",
                role: "RECEPTIONIST",
                temporaryPassword: generatePassword(),
            },
    );
    const [errors, setErrors] = useState<FormErrors>({});
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState(false);

    const nameRef = useRef<HTMLInputElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const ids = {
        name: useId(),
        email: useId(),
        mobile: useId(),
        password: useId(),
        role: useId(),
    };

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const requestClose = useCallback(() => onCloseRef.current(), []);

    useEffect(() => {
        const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };

        document.addEventListener("keydown", onKeyDown);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [requestClose]);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((state) => ({ ...state, [key]: value }));
        if (key in errors) setErrors((state) => ({ ...state, [key]: undefined }));
    };

    const handleCopy = async () => {
        const ok = await copyText(form.temporaryPassword);

        if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }
    };

    const handleMobilePaste = (event: ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        update("mobileNumber", sanitizeMobileInput(event.clipboardData.getData("text")));
    };

    // Validation is synchronous. Once it passes, the parent applies the change optimistically
    // and closes this dialog in the same frame — there is no waiting state at all.
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const next: FormErrors = {};
        const fullName = form.fullName.trim().replace(/\s+/g, " ");
        const email = form.email.trim().toLowerCase();

        if (fullName.length < 2 || fullName.length > 120 || !NAME_PATTERN.test(fullName)) {
            next.fullName = t.errName;
        }
        if (!EMAIL_PATTERN.test(email) || email.length > 254) next.email = t.errEmail;
        if (!LOCAL_MOBILE_PATTERN.test(form.mobileNumber)) next.mobileNumber = t.errMobile;
        if (!isEdit && !isAcceptablePassword(form.temporaryPassword)) {
            next.temporaryPassword = t.errPassword;
        }
        // Hierarchy: only a Super Admin may assign the Admin role (the server re-checks this).
        if (!viewerIsSuperAdmin && form.role === "ADMIN") {
            next.role = t.errRoleForbidden;
        }

        if (Object.keys(next).length > 0) {
            setErrors(next);
            return;
        }

        const outcome = onSubmit(user, {
            fullName,
            email,
            mobileNumber: toStoredMobile(form.mobileNumber),
            role: form.role,
            temporaryPassword: form.temporaryPassword,
        });

        if (!outcome.ok) setErrors(outcome.errors ?? {});
    };

    // Regular Admins cannot pick "Admin": the option stays visible but locked.
    const roleOptions: DropdownOption<ManagedRole>[] = [
        {
            value: "ADMIN",
            label: t.roleAdmin,
            disabled: !viewerIsSuperAdmin,
            hint: t.roleAdminLocked,
        },
        { value: "RECEPTIONIST", label: t.roleReceptionist },
    ];

    const iconPosition = isRtl ? "end-3" : "start-3";
    const ltrPadding = isRtl ? "ps-3 pe-10 text-end" : "ps-10 pe-3";
    const editingSelf = isEdit && Boolean(user?.isCurrentUser);
    const editingSuperAdmin = isEdit && Boolean(user?.isSuperAdmin);
    const roleLocked = editingSelf || editingSuperAdmin;
    const roleHelp = editingSelf
        ? t.roleLocked
        : editingSuperAdmin
            ? t.roleLockedSuper
            : viewerIsSuperAdmin
                ? t.roleHelp
                : t.roleHelpRestricted;
    const mobileInvalid = Boolean(errors.mobileNumber);

    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 dark:bg-slate-950/80 sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={(event) => {
                // Click on the dark backdrop (not inside the card) closes the dialog.
                if (event.target === event.currentTarget) requestClose();
            }}
        >
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
                className="relative my-auto w-full max-w-[640px] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/50 dark:border-slate-700/80 dark:bg-slate-900 sm:p-8"
            >
                <button
                    type="button"
                    onClick={requestClose}
                    aria-label={t.close}
                    className="absolute end-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <X className="h-5 w-5" />
                </button>

                <h2
                    id={titleId}
                    className="pe-10 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white"
                >
                    {isEdit ? t.editTitle : t.createTitle}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {isEdit ? t.editSubtitle : t.createSubtitle}
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <Field label={t.fullName} htmlFor={ids.name} error={errors.fullName}>
                            <div className="relative">
                                <UserRound
                                    className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400 ${iconPosition}`}
                                />
                                <input
                                    ref={nameRef}
                                    id={ids.name}
                                    value={form.fullName}
                                    onChange={(event) => update("fullName", event.target.value)}
                                    placeholder={t.fullNamePlaceholder}
                                    autoComplete="off"
                                    maxLength={120}
                                    aria-invalid={Boolean(errors.fullName)}
                                    className={`${baseInput} ${isRtl ? "pe-10 ps-3" : "ps-10 pe-3"}`}
                                />
                            </div>
                        </Field>

                        <Field label={t.email} htmlFor={ids.email} error={errors.email}>
                            <div className="relative">
                                <Mail
                                    className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400 ${iconPosition}`}
                                />
                                <input
                                    id={ids.email}
                                    type="email"
                                    dir="ltr"
                                    value={form.email}
                                    onChange={(event) => update("email", event.target.value)}
                                    placeholder={t.emailPlaceholder}
                                    autoComplete="off"
                                    maxLength={254}
                                    aria-invalid={Boolean(errors.email)}
                                    className={`${baseInput} ${ltrPadding}`}
                                />
                            </div>
                        </Field>

                        <Field
                            label={t.mobile}
                            htmlFor={ids.mobile}
                            error={errors.mobileNumber}
                            help={t.mobileHelp}
                        >
                            {/* The +966 country code is a fixed affix: the user only types 05XXXXXXXX. */}
                            <div
                                dir="ltr"
                                className={`flex h-11 w-full items-center overflow-hidden rounded-lg border bg-white transition focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:bg-slate-950/60 ${mobileInvalid
                                    ? "border-rose-500"
                                    : "border-slate-200 dark:border-slate-700"
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="flex h-full select-none items-center gap-2 border-e border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    <Smartphone className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                    +966
                                </span>
                                <input
                                    id={ids.mobile}
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    maxLength={MOBILE_LENGTH}
                                    pattern="05[0-9]{8}"
                                    value={form.mobileNumber}
                                    onChange={(event) =>
                                        update("mobileNumber", sanitizeMobileInput(event.target.value))
                                    }
                                    onPaste={handleMobilePaste}
                                    placeholder={t.mobilePlaceholder}
                                    aria-invalid={mobileInvalid}
                                    className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm tracking-wider text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100"
                                />
                                <span
                                    aria-hidden="true"
                                    className={`pe-3 text-xs tabular-nums ${form.mobileNumber.length === MOBILE_LENGTH
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-slate-400"
                                        }`}
                                >
                                    {form.mobileNumber.length}/{MOBILE_LENGTH}
                                </span>
                            </div>
                        </Field>

                        <Field
                            label={t.role}
                            htmlFor={ids.role}
                            error={errors.role}
                            help={roleHelp}
                        >
                            <Dropdown
                                value={form.role}
                                options={roleOptions}
                                onChange={(value) => update("role", value)}
                                ariaLabel={t.role}
                                disabled={roleLocked}
                                icon={<UserRound className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />}
                            />
                        </Field>
                    </div>

                    {!isEdit && (
                        <>
                            <Field
                                label={t.tempPassword}
                                htmlFor={ids.password}
                                error={errors.temporaryPassword}
                            >
                                <div className="relative">
                                    <Lock
                                        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400 ${iconPosition}`}
                                    />
                                    <input
                                        id={ids.password}
                                        type={showPassword ? "text" : "password"}
                                        dir="ltr"
                                        value={form.temporaryPassword}
                                        onChange={(event) => update("temporaryPassword", event.target.value)}
                                        autoComplete="new-password"
                                        maxLength={128}
                                        aria-invalid={Boolean(errors.temporaryPassword)}
                                        className={`${baseInput} font-mono ${isRtl ? "ps-44 pe-10 text-end" : "ps-10 pe-44"}`}
                                    />
                                    <div
                                        className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 ${isRtl ? "start-1.5" : "end-1.5"}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((state) => !state)}
                                            aria-label={showPassword ? t.hidePassword : t.showPassword}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopy()}
                                            aria-label={t.copy}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-emerald-500" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                            {copied ? t.copied : t.copy}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                update("temporaryPassword", generatePassword());
                                                setShowPassword(true);
                                            }}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-teal-600 transition-colors duration-150 hover:bg-teal-600/10 dark:text-teal-300"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            {t.generate}
                                        </button>
                                    </div>
                                </div>
                            </Field>

                            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                {t.mustChangeNote}
                            </p>
                        </>
                    )}

                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button type="button" onClick={requestClose} className={outlineButton}>
                            {t.cancel}
                        </button>
                        <button type="submit" className={tealButton}>
                            {isEdit ? t.save : t.create}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Delete confirmation dialog                                                */
/* -------------------------------------------------------------------------- */

function DeleteUserDialog({
    user,
    t,
    isRtl,
    onCancel,
    onConfirm,
}: {
    user: UserRow;
    t: Messages;
    isRtl: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const titleId = useId();
    const onCancelRef = useRef(onCancel);

    useEffect(() => {
        onCancelRef.current = onCancel;
    }, [onCancel]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onCancelRef.current();
        };

        document.addEventListener("keydown", onKeyDown);

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return (
        <motion.div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 dark:bg-slate-950/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <motion.section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-black/60 dark:border-slate-700 dark:bg-slate-900"
            >
                <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500">
                        <Trash2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                        <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white">
                            {t.deleteTitle}
                        </h2>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {user.fullName}
                        </p>
                        <p
                            dir="ltr"
                            className={`truncate text-xs text-slate-500 dark:text-slate-400 ${isRtl ? "text-end" : ""}`}
                        >
                            {user.email}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {t.deleteQuestion}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.deleteBody}</p>
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} className={outlineButton}>
                        {t.cancel}
                    </button>
                    <button type="button" onClick={onConfirm} className={dangerButton}>
                        <Trash2 className="h-4 w-4" />
                        {t.deleteConfirm}
                    </button>
                </div>
            </motion.section>
        </motion.div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function UsersRolesPage({ initialLocale }: UsersRolesPageProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    // Privileges of the signed-in user — always provided by the server with the user list.
    const [viewerIsSuperAdmin, setViewerIsSuperAdmin] = useState(false);

    const [query, setQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [page, setPage] = useState(1);

    const [modal, setModal] = useState<ModalState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    // Always-fresh mirrors so background tasks never read stale closures.
    const tRef = useRef<Messages>(t);
    const usersRef = useRef<UserRow[]>([]);
    const usersInflightRef = useRef(false);
    const queueRef = useRef(new Map<string, Promise<void>>());
    const toastIdRef = useRef(0);
    // Real id -> temp id, so an optimistic row keeps its React key after the server confirms it
    // (no remount / re-animation when the temporary row is swapped for the saved one).
    const keyMapRef = useRef(new Map<string, string>());

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

    const dismissToast = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushToast = useCallback(
        (kind: ToastKind, message: string): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
            window.setTimeout(() => dismissToast(id), TOAST_MS);

            return id;
        },
        [dismissToast],
    );

    /* ------------------------ local data store ----------------------- */

    // Single entry point for every local change: updates the ref synchronously (so rapid actions
    // see the latest rows) and schedules the React render.
    const updateUsers = useCallback(
        (updater: (current: UserRow[]) => UserRow[]): UserRow[] => {
            const next = updater(usersRef.current);

            usersRef.current = next;
            setUsers(next);

            return next;
        },
        [],
    );

    // Server calls for the same row run strictly in order.
    const enqueue = useCallback((rowId: string, task: () => Promise<void>) => {
        const previous = queueRef.current.get(rowId) ?? Promise.resolve();
        const next: Promise<void> = previous
            .then(task)
            .catch(() => undefined)
            .then(() => {
                if (queueRef.current.get(rowId) === next) queueRef.current.delete(rowId);
            });

        queueRef.current.set(rowId, next);
    }, []);

    /* ---------------------------- loaders ---------------------------- */

    const loadUsers = useCallback(async () => {
        if (usersInflightRef.current) return;

        usersInflightRef.current = true;

        const blocking = usersRef.current.length === 0;

        if (blocking) setLoading(true);
        setLoadError("");

        try {
            const result = await fetchAllUsers();

            if ("rows" in result) {
                const busy = new Set(queueRef.current.keys());

                setViewerIsSuperAdmin(result.viewerIsSuperAdmin);
                updateUsers((current) => mergeServerRows(current, result.rows, busy));
            } else {
                setLoadError(result.error ?? tRef.current.loadFailed);
            }
        } catch {
            setLoadError(tRef.current.loadFailed);
        } finally {
            usersInflightRef.current = false;
            setLoading(false);
        }
    }, [updateUsers]);

    // Silent reconciliation with the server, used only after a failed optimistic change.
    const resyncUsers = useCallback(async () => {
        try {
            const result = await fetchAllUsers();

            if ("rows" in result) {
                const busy = new Set(queueRef.current.keys());

                setViewerIsSuperAdmin(result.viewerIsSuperAdmin);
                updateUsers((current) => mergeServerRows(current, result.rows, busy));
            }
        } catch {
            // Keep the current local state if the background sync fails.
        }
    }, [updateUsers]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    /* --------------------- optimistic settle / rollback -------------- */

    const settleRow = useCallback(
        (optimistic: UserRow, confirmed: UserRow) => {
            // Only replace the row if no newer optimistic change has superseded it.
            updateUsers((list) => list.map((item) => (item === optimistic ? confirmed : item)));
        },
        [updateUsers],
    );

    const rollbackRow = useCallback(
        (optimistic: UserRow, previous: UserRow, toastId: number, message: string) => {
            dismissToast(toastId);
            updateUsers((list) => list.map((item) => (item === optimistic ? previous : item)));
            pushToast("error", message);
            // Rapid consecutive actions may have stacked on top of this one: reconcile silently.
            void resyncUsers();
        },
        [dismissToast, pushToast, resyncUsers, updateUsers],
    );

    const removeTempRow = useCallback(
        (tempId: string, toastId: number, message: string) => {
            dismissToast(toastId);
            updateUsers((list) => list.filter((item) => item.id !== tempId));
            pushToast("error", message);
        },
        [dismissToast, pushToast, updateUsers],
    );

    const restoreDeletedRow = useCallback(
        (snapshot: UserRow, index: number, toastId: number, message: string) => {
            dismissToast(toastId);
            updateUsers((list) => {
                if (list.some((item) => item.id === snapshot.id)) return list;

                const next = [...list];
                next.splice(Math.min(Math.max(index, 0), next.length), 0, snapshot);

                return next;
            });
            pushToast("error", message);
        },
        [dismissToast, pushToast, updateUsers],
    );

    /* ----------------------- filters & derived ----------------------- */

    const deferredQuery = useDeferredValue(query);

    const hasActiveFilters = query.trim() !== "" || roleFilter !== "ALL" || statusFilter !== "ALL";

    const resetFilters = useCallback(() => {
        // One render: every input and filter returns to its default instantly.
        setQuery("");
        setRoleFilter("ALL");
        setStatusFilter("ALL");
        setPage(1);
    }, []);

    const changeRole = useCallback((value: RoleFilter) => {
        setRoleFilter(value);
        setPage(1);
    }, []);

    const changeStatus = useCallback((value: StatusFilter) => {
        setStatusFilter(value);
        setPage(1);
    }, []);

    const roleOptions = useMemo<DropdownOption<RoleFilter>[]>(
        () => [
            { value: "ALL", label: t.allRoles },
            { value: "ADMIN", label: t.roleAdmin },
            { value: "RECEPTIONIST", label: t.roleReceptionist },
        ],
        [t],
    );

    const statusOptions = useMemo<DropdownOption<StatusFilter>[]>(
        () => [
            { value: "ALL", label: t.allStatuses },
            { value: "ACTIVE", label: t.statusActive },
            { value: "PENDING", label: t.statusPending },
            { value: "DISABLED", label: t.statusDisabled },
        ],
        [t],
    );

    const filteredUsers = useMemo(() => {
        const needle = deferredQuery.trim().toLowerCase();
        const digits = needle.replace(/\D/g, "");
        const local = digits.replace(/^(?:00)?966/, "").replace(/^0/, "");

        return users.filter((user) => {
            if (roleFilter !== "ALL" && user.role !== roleFilter) return false;
            if (statusFilter !== "ALL" && user.status !== statusFilter) return false;
            if (!needle) return true;

            if (user.fullName.toLowerCase().includes(needle)) return true;
            if (user.email.toLowerCase().includes(needle)) return true;

            const mobile = user.mobileNumber ?? "";

            if (mobile.includes(needle)) return true;

            return local.length >= 3 && mobile.replace(/\D/g, "").includes(local);
        });
    }, [users, deferredQuery, roleFilter, statusFilter]);

    const total = filteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageUsers = useMemo(
        () => filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filteredUsers, currentPage],
    );
    const showingFrom = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, total);
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;
    const showSkeleton = loading && users.length === 0 && !loadError;
    const showEmpty = !showSkeleton && !loadError && pageUsers.length === 0;
    const showRestrictedNotice = !loading && !loadError && !viewerIsSuperAdmin;

    const closeModal = useCallback(() => setModal(null), []);
    const cancelDelete = useCallback(() => setDeleteTarget(null), []);

    /* ----------------------- optimistic mutations -------------------- */

    // Returns synchronously: { ok: true } closes the dialog in the same frame as the row change.
    const submitUser = useCallback(
        (target: UserRow | null, values: FormValues): SubmitOutcome => {
            // Hierarchy guard (the server enforces it again): only a Super Admin assigns Admin.
            if (!viewerIsSuperAdmin && values.role === "ADMIN") {
                return { ok: false, errors: { role: tRef.current.errRoleForbidden } };
            }

            // Instant duplicate pre-check against the local list (the server stays the authority).
            const duplicate: FormErrors = {};

            for (const row of usersRef.current) {
                if (target && row.id === target.id) continue;

                if (row.email.toLowerCase() === values.email) {
                    duplicate.email = tRef.current.errDuplicateEmail;
                }
                if (row.mobileNumber === values.mobileNumber) {
                    duplicate.mobileNumber = tRef.current.errDuplicateMobile;
                }
            }

            if (duplicate.email || duplicate.mobileNumber) {
                return { ok: false, errors: duplicate };
            }

            // Close instantly — the table below is already updated in this same frame.
            setModal(null);

            if (target) {
                const base = usersRef.current.find((item) => item.id === target.id) ?? target;

                if (isTempId(base.id)) return { ok: true };

                if (!canManageUser(base, viewerIsSuperAdmin)) {
                    pushToast("error", tRef.current.forbidden);
                    return { ok: true };
                }

                const optimistic = buildEditedRow(base, values);

                updateUsers((list) => list.map((item) => (item.id === base.id ? optimistic : item)));

                const toastId = pushToast("success", tRef.current.updated);

                enqueue(base.id, async () => {
                    try {
                        const result = await updateUserAction({
                            userId: base.id,
                            fullName: values.fullName,
                            email: values.email,
                            mobileNumber: values.mobileNumber,
                            role: values.role,
                        });

                        if (!result.success || !result.data) {
                            rollbackRow(optimistic, base, toastId, result.error ?? tRef.current.failed);
                            return;
                        }

                        settleRow(optimistic, result.data.user);
                    } catch {
                        rollbackRow(optimistic, base, toastId, tRef.current.failed);
                    }
                });

                return { ok: true };
            }

            const tempId = makeTempId();
            const optimistic = buildCreatedRow(values, tempId);

            // Make sure the new row is visible right away, whatever filters were active.
            resetFilters();
            updateUsers((list) => [optimistic, ...list]);

            const toastId = pushToast("success", tRef.current.created);

            enqueue(tempId, async () => {
                try {
                    const result = await createUserAction({
                        fullName: values.fullName,
                        email: values.email,
                        mobileNumber: values.mobileNumber,
                        role: values.role,
                        temporaryPassword: values.temporaryPassword,
                    });

                    if (!result.success || !result.data) {
                        removeTempRow(tempId, toastId, result.error ?? tRef.current.failed);
                        return;
                    }

                    const created = result.data.user;

                    keyMapRef.current.set(created.id, tempId);
                    updateUsers((list) => list.map((item) => (item.id === tempId ? created : item)));
                } catch {
                    removeTempRow(tempId, toastId, tRef.current.failed);
                }
            });

            return { ok: true };
        },
        [
            enqueue,
            pushToast,
            removeTempRow,
            resetFilters,
            rollbackRow,
            settleRow,
            updateUsers,
            viewerIsSuperAdmin,
        ],
    );

    const handleToggleStatus = useCallback(
        (user: UserRow, enabled: boolean) => {
            if (isTempId(user.id)) return;

            const current = usersRef.current.find((item) => item.id === user.id) ?? user;

            if (!canManageUser(current, viewerIsSuperAdmin)) {
                pushToast("error", tRef.current.forbidden);
                return;
            }

            if (current.status === "PENDING") return;
            if (!enabled && current.isCurrentUser) return;
            if (current.isActive === enabled) return;

            // Disable -> isActive=false (DISABLED). Re-activate -> isActive=true (ACTIVE).
            const optimistic = buildToggledRow(current, enabled);

            updateUsers((list) => list.map((item) => (item.id === current.id ? optimistic : item)));

            const toastId = pushToast(
                "success",
                enabled ? tRef.current.activated : tRef.current.disabledMsg,
            );

            enqueue(current.id, async () => {
                try {
                    const result = await toggleUserStatusAction({ userId: current.id, enabled });

                    if (!result.success || !result.data) {
                        rollbackRow(optimistic, current, toastId, result.error ?? tRef.current.failed);
                        return;
                    }

                    settleRow(optimistic, result.data.user);
                } catch {
                    rollbackRow(optimistic, current, toastId, tRef.current.failed);
                }
            });
        },
        [enqueue, pushToast, rollbackRow, settleRow, updateUsers, viewerIsSuperAdmin],
    );

    const requestDelete = useCallback(
        (row: UserRow) => {
            const current = usersRef.current.find((item) => item.id === row.id) ?? row;

            if (!canManageUser(current, viewerIsSuperAdmin)) {
                pushToast("error", tRef.current.forbidden);
                return;
            }

            setDeleteTarget(current);
        },
        [pushToast, viewerIsSuperAdmin],
    );

    const confirmDelete = useCallback(() => {
        if (!deleteTarget) return;

        const target = deleteTarget;

        if (!canManageUser(target, viewerIsSuperAdmin)) {
            setDeleteTarget(null);
            pushToast("error", tRef.current.forbidden);
            return;
        }

        const index = usersRef.current.findIndex((item) => item.id === target.id);
        const snapshot = index >= 0 ? (usersRef.current[index] as UserRow) : target;

        // Dialog closes and the row disappears immediately.
        setDeleteTarget(null);
        updateUsers((list) => list.filter((item) => item.id !== target.id));

        const toastId = pushToast("success", tRef.current.deleted);

        enqueue(target.id, async () => {
            try {
                const result = await deleteUserAction(target.id);

                // A record that is already gone on the server is the outcome we wanted.
                if (!result.success && result.code !== "RECORD_NOT_FOUND") {
                    restoreDeletedRow(snapshot, index, toastId, result.error ?? tRef.current.failed);
                }
            } catch {
                restoreDeletedRow(snapshot, index, toastId, tRef.current.failed);
            }
        });
    }, [deleteTarget, enqueue, pushToast, restoreDeletedRow, updateUsers, viewerIsSuperAdmin]);

    // The only action that must wait for the server: the password is generated there.
    const handleRegenerate = useCallback(
        (user: UserRow) => {
            if (isTempId(user.id) || user.status !== "PENDING") return;

            if (!canManageUser(user, viewerIsSuperAdmin)) {
                pushToast("error", tRef.current.forbidden);
                return;
            }

            setBusyId(user.id);

            enqueue(user.id, async () => {
                try {
                    const result = await regenerateTempPasswordAction(user.id);

                    if (!result.success || !result.data) {
                        pushToast("error", result.error ?? tRef.current.failed);
                        return;
                    }

                    const { email, temporaryPassword, user: refreshed } = result.data;

                    updateUsers((list) => list.map((row) => (row.id === refreshed.id ? refreshed : row)));

                    const copied = await copyText(`Email: ${email} | Temporary Password: ${temporaryPassword}`);

                    if (copied) {
                        pushToast("success", tRef.current.regenerated);
                    } else {
                        pushToast("error", `${tRef.current.copyFailed} ${temporaryPassword}`);
                    }
                } catch {
                    pushToast("error", tRef.current.failed);
                } finally {
                    setBusyId((current) => (current === user.id ? null : current));
                }
            });
        },
        [enqueue, pushToast, updateUsers, viewerIsSuperAdmin],
    );

    const openEdit = useCallback(
        (row: UserRow) => {
            if (isTempId(row.id)) return;

            const current = usersRef.current.find((item) => item.id === row.id) ?? row;

            if (!canManageUser(current, viewerIsSuperAdmin)) {
                pushToast("error", tRef.current.forbidden);
                return;
            }

            setModal({ mode: "edit", user: current });
        },
        [pushToast, viewerIsSuperAdmin],
    );

    /* ---------------------------- render ---------------------------- */

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref={MANAGEMENT_HREF}
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
                                    <span>{t.title}</span>
                                </div>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{t.subtitle}</p>

                                {!loading && viewerIsSuperAdmin && (
                                    <div className="mt-3">
                                        <SuperAdminBadge t={t} />
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setModal({ mode: "create" })}
                                className={`${tealButton} shrink-0`}
                            >
                                <Plus className="h-4 w-4" />
                                {t.add}
                            </button>
                        </header>

                        {/* Hierarchy notice for regular Admins */}
                        {showRestrictedNotice && (
                            <div
                                role="note"
                                className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200"
                            >
                                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{t.restrictedNotice}</p>
                            </div>
                        )}

                        {/* Search & filter bar */}
                        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,2fr)_minmax(170px,1fr)_minmax(170px,1fr)_auto]">
                            <label className="relative block">
                                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-300" />
                                <input
                                    value={query}
                                    onChange={(event) => {
                                        setQuery(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t.search}
                                    aria-label={t.search}
                                    maxLength={120}
                                    className={`${baseInput} ps-10 pe-3`}
                                />
                            </label>

                            <Dropdown
                                value={roleFilter}
                                options={roleOptions}
                                onChange={changeRole}
                                ariaLabel={t.roleFilterLabel}
                            />

                            <Dropdown
                                value={statusFilter}
                                options={statusOptions}
                                onChange={changeStatus}
                                ariaLabel={t.filterLabel}
                                icon={<Filter className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />}
                            />

                            <AnimatePresence initial={false}>
                                {hasActiveFilters && (
                                    <motion.button
                                        key="reset-filters"
                                        type="button"
                                        onClick={resetFilters}
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.92 }}
                                        transition={{ duration: 0.12 }}
                                        className={`${outlineButton} h-11`}
                                    >
                                        <X className="h-4 w-4" />
                                        {t.reset}
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </section>

                        {/* Data table */}
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/5 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-black/30">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[960px] border-collapse text-start">
                                    <thead>
                                        <tr className="text-start text-sm font-semibold text-slate-600 dark:text-slate-300">
                                            <th scope="col" className="px-6 py-4 text-start">
                                                {t.colEmployee}
                                            </th>
                                            <th scope="col" className="px-4 py-4 text-start">
                                                {t.colRole}
                                            </th>
                                            <th scope="col" className="px-4 py-4 text-start">
                                                {t.colLastLogin}
                                            </th>
                                            <th scope="col" className="px-4 py-4 text-start">
                                                {t.colStatus}
                                            </th>
                                            <th scope="col" className="px-4 py-4 text-center">
                                                {t.colActions}
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {showSkeleton ? (
                                            <SkeletonRows />
                                        ) : loadError ? (
                                            <tr className="border-t border-slate-200 dark:border-slate-800">
                                                <td colSpan={5} className="px-6 py-14 text-center">
                                                    <CircleAlert className="mx-auto h-8 w-8 text-rose-500" />
                                                    <p className="mt-3 text-base text-slate-700 dark:text-slate-200">
                                                        {loadError}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => void loadUsers()}
                                                        className={`${outlineButton} mt-4`}
                                                    >
                                                        <RefreshCw className="h-4 w-4" />
                                                        {t.retry}
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : showEmpty ? (
                                            <tr className="border-t border-slate-200 dark:border-slate-800">
                                                <td colSpan={5} className="px-6 py-14 text-center">
                                                    <Search className="mx-auto h-8 w-8 text-slate-400" />
                                                    <p className="mt-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                                                        {t.emptyTitle}
                                                    </p>
                                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                        {t.emptyBody}
                                                    </p>
                                                    {hasActiveFilters && (
                                                        <button
                                                            type="button"
                                                            onClick={resetFilters}
                                                            className={`${outlineButton} mt-4`}
                                                        >
                                                            <X className="h-4 w-4" />
                                                            {t.reset}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ) : (
                                            <AnimatePresence initial={false}>
                                                {pageUsers.map((user) => {
                                                    const login = formatLastLogin(user.lastLoginAt, locale);
                                                    const syncing = isTempId(user.id);
                                                    const rowKey = keyMapRef.current.get(user.id) ?? user.id;
                                                    const canManage = canManageUser(user, viewerIsSuperAdmin);
                                                    const canDisable =
                                                        user.status === "ACTIVE" && !user.isCurrentUser;

                                                    return (
                                                        <motion.tr
                                                            key={rowKey}
                                                            initial={{ opacity: 0, y: -8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0 }}
                                                            transition={{ duration: 0.16, ease: "easeOut" }}
                                                            className={`border-t border-slate-200 transition-colors duration-150 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30 ${user.isSuperAdmin
                                                                ? "bg-gradient-to-r from-teal-500/[0.04] to-indigo-500/[0.04]"
                                                                : ""
                                                                }`}
                                                        >
                                                            <td className="px-6 py-4 align-middle">
                                                                <div className="flex items-center gap-4">
                                                                    <Avatar name={user.fullName} id={rowKey} />
                                                                    <div className="min-w-0">
                                                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-slate-900 dark:text-white">
                                                                            <span className="truncate">{user.fullName}</span>
                                                                            {user.isCurrentUser && (
                                                                                <span className="shrink-0 rounded-md bg-teal-600/10 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                                                                                    {t.you}
                                                                                </span>
                                                                            )}
                                                                        </p>
                                                                        <p
                                                                            dir="ltr"
                                                                            className={`truncate text-sm text-slate-600 dark:text-slate-300 ${isRtl ? "text-end" : ""}`}
                                                                        >
                                                                            {user.email}
                                                                        </p>
                                                                        {user.mobileNumber && (
                                                                            <p
                                                                                dir="ltr"
                                                                                className={`truncate text-xs text-slate-500 dark:text-slate-400 ${isRtl ? "text-end" : ""}`}
                                                                            >
                                                                                {formatMobileDisplay(user.mobileNumber)}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td className="px-4 py-4 align-middle">
                                                                <RoleBadge role={user.role} isSuperAdmin={user.isSuperAdmin} t={t} />
                                                            </td>

                                                            <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-slate-800 dark:text-slate-200">
                                                                {login ? (
                                                                    <span>
                                                                        {login.date}
                                                                        <span className="mx-2 text-slate-400">·</span>
                                                                        {login.time}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-500 dark:text-slate-400">
                                                                        {t.neverLoggedIn}
                                                                    </span>
                                                                )}
                                                            </td>

                                                            <td className="px-4 py-4 align-middle">
                                                                <StatusBadge status={user.status} t={t} />
                                                                {user.status === "PENDING" && (
                                                                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                                        {t.pendingHint}
                                                                    </p>
                                                                )}
                                                            </td>

                                                            <td className="px-4 py-4 align-middle">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {canManage && user.status === "DISABLED" && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleStatus(user, true)}
                                                                            className={reactivatePill}
                                                                        >
                                                                            <RotateCcw className="h-4 w-4" />
                                                                            {t.reactivate}
                                                                        </button>
                                                                    )}

                                                                    {canManage && canDisable && !syncing && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleStatus(user, false)}
                                                                            className={warnPill}
                                                                        >
                                                                            <PowerOff className="h-4 w-4" />
                                                                            {t.disable}
                                                                        </button>
                                                                    )}

                                                                    <RowActions
                                                                        user={user}
                                                                        t={t}
                                                                        isRtl={isRtl}
                                                                        busy={busyId === user.id}
                                                                        syncing={syncing}
                                                                        canManage={canManage}
                                                                        onEdit={openEdit}
                                                                        onToggleStatus={handleToggleStatus}
                                                                        onRegenerate={handleRegenerate}
                                                                        onDelete={requestDelete}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </motion.tr>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination footer */}
                            <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                    {total === 0 ? t.showingNone : t.showing(showingFrom, showingTo, total)}
                                </p>

                                <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label={t.previousPage}
                                        disabled={currentPage <= 1}
                                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                                        className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-teal-500 hover:text-teal-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                    >
                                        <PrevIcon className="h-4 w-4" />
                                    </button>

                                    {pageWindow(currentPage, totalPages).map((entry) => (
                                        <button
                                            key={entry}
                                            type="button"
                                            aria-label={t.page(entry)}
                                            aria-current={entry === currentPage ? "page" : undefined}
                                            onClick={() => setPage(entry)}
                                            className={`grid h-10 min-w-10 place-items-center rounded-lg border px-3 text-sm font-semibold transition ${entry === currentPage
                                                ? "border-teal-600 bg-teal-600 text-white"
                                                : "border-slate-200 text-slate-700 hover:border-teal-500 hover:text-teal-500 dark:border-slate-700 dark:text-slate-200"
                                                }`}
                                        >
                                            {entry}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        aria-label={t.nextPage}
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                                        className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-teal-500 hover:text-teal-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                    >
                                        <NextIcon className="h-4 w-4" />
                                    </button>
                                </nav>
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            {/* Create / Edit dialog */}
            <AnimatePresence>
                {modal && (
                    <UserFormDialog
                        key={modal.mode === "edit" ? `edit-${modal.user.id}` : "create"}
                        user={modal.mode === "edit" ? modal.user : null}
                        t={t}
                        isRtl={isRtl}
                        viewerIsSuperAdmin={viewerIsSuperAdmin}
                        onClose={closeModal}
                        onSubmit={submitUser}
                    />
                )}
            </AnimatePresence>

            {/* Delete confirmation dialog */}
            <AnimatePresence>
                {deleteTarget && (
                    <DeleteUserDialog
                        key={`delete-${deleteTarget.id}`}
                        user={deleteTarget}
                        t={t}
                        isRtl={isRtl}
                        onCancel={cancelDelete}
                        onConfirm={confirmDelete}
                    />
                )}
            </AnimatePresence>

            {/* Toasts */}
            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-4 end-4 z-[200] flex w-[min(92vw,420px)] flex-col gap-3"
            >
                <AnimatePresence initial={false}>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            layout
                            initial={{ opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: isRtl ? -24 : 24 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            role={toast.kind === "error" ? "alert" : "status"}
                            className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/40 dark:bg-slate-900 ${toast.kind === "success" ? "border-teal-600/40" : "border-rose-500/40"
                                }`}
                        >
                            {toast.kind === "success" ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                            ) : (
                                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                            )}
                            <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">
                                {toast.message}
                            </p>
                            <button
                                type="button"
                                onClick={() => dismissToast(toast.id)}
                                aria-label={t.dismiss}
                                className="rounded-md p-1 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}