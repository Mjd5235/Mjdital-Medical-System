"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DoctorProfessionalRank } from "@prisma/client";
import {
    Activity,
    BriefcaseMedical,
    Building2,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Contact,
    Eye,
    EyeOff,
    FileBadge,
    FileText,
    Filter,
    KeyRound,
    LoaderCircle,
    Lock,
    Mail,
    MoreHorizontal,
    Pencil,
    Percent,
    Plus,
    Search,
    Stethoscope,
    Trash2,
    UserRound,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createDoctorAction,
    deleteDoctorAction,
    getDoctorFormOptions,
    getDoctorsAction,
    regenerateTempPasswordAction,
    updateDoctorAction,
    type CreateDoctorInput,
    type DoctorRow,
} from "./actions";

const PAGE_SIZE = 4;

type DoctorListItem = Omit<DoctorRow, "services"> & {
    services: Array<{ id: string; name: string }>;
};

type DoctorFormOptions = {
    clinics: Array<{ id: string; nameEn: string; nameAr: string; isActive: boolean }>;
    services: Array<{
        id: string;
        clinicId: string;
        nameEn: string;
        nameAr: string;
        code: string;
        isActive: boolean;
    }>;
};

type FormErrors = Partial<
    Record<
        | "email"
        | "firstName"
        | "lastName"
        | "temporaryPassword"
        | "nationalId"
        | "scfhsLicenseNumber"
        | "professionalRank"
        | "specialty"
        | "clinicId"
        | "serviceIds"
        | "commissionRate",
        string
    >
>;

type Notice = {
    kind: "success" | "error";
    message: string;
};

type ModalState = { mode: "create" } | { mode: "edit"; doctor: DoctorRow } | null;

const SPECIALTIES: ReadonlyArray<{ en: string; ar: string }> = [
    { en: "Cardiology", ar: "أمراض القلب" },
    { en: "Pediatrics", ar: "طب الأطفال" },
    { en: "Dermatology", ar: "الأمراض الجلدية" },
    { en: "Orthopedics", ar: "جراحة العظام" },
    { en: "Internal Medicine", ar: "الطب الباطني" },
    { en: "General Practice", ar: "الطب العام" },
    { en: "Obstetrics & Gynecology", ar: "النساء والولادة" },
    { en: "Ophthalmology", ar: "طب العيون" },
    { en: "Ear, Nose & Throat (ENT)", ar: "الأنف والأذن والحنجرة" },
    { en: "Neurology", ar: "طب الأعصاب" },
    { en: "Psychiatry", ar: "الطب النفسي" },
    { en: "Dentistry", ar: "طب الأسنان" },
    { en: "Urology", ar: "المسالك البولية" },
    { en: "Radiology", ar: "الأشعة" },
    { en: "Endocrinology", ar: "الغدد الصماء والسكري" },
    { en: "Gastroenterology", ar: "الجهاز الهضمي" },
    { en: "Pulmonology", ar: "أمراض الصدر" },
    { en: "Nephrology", ar: "أمراض الكلى" },
    { en: "Oncology", ar: "الأورام" },
    { en: "Emergency Medicine", ar: "طب الطوارئ" },
    { en: "Physiotherapy", ar: "العلاج الطبيعي" },
    { en: "General Surgery", ar: "الجراحة العامة" },
];

const messages = {
    en: {
        title: "Doctors & Practitioners",
        breadcrumbRoot: "Admin",
        subtitle: "Manage clinical profiles, credentials and access",
        add: "Add New Doctor",
        search: "Search doctors, ID or license",
        allClinics: "All clinics",
        allStatuses: "All statuses",
        filters: "Filters",
        resetFilters: "Reset filters",
        profile: "Doctor Profile",
        nationalId: "National ID / Iqama",
        license: "SCFHS License No.",
        clinic: "Assigned Clinic",
        services: "Offered Services",
        commission: "Commission Rate",
        status: "Account Status",
        active: "Active",
        invited: "Invited",
        noAccount: "No account",
        rowActions: "Row actions",
        empty: "No doctors found.",
        loading: "Loading doctors…",
        retryLoading: "Reload",
        retry: "Retry",
        loadFailed: "Unable to load doctors.",
        optionsError: "Unable to load clinics and services.",
        modalAdd: "Add New Doctor & Practitioner",
        modalEdit: "Edit Practitioner",
        credentials: "Authentication & Credentials",
        email: "Doctor Email",
        emailPlaceholder: "doctor@hospital.sa",
        firstName: "First Name",
        firstNamePlaceholder: "Enter first name",
        lastName: "Last Name",
        lastNamePlaceholder: "Enter last name",
        inviteHint: "The doctor will sign in using this temporary password and change it on first login.",
        tempPassword: "Temporary Password",
        tempPasswordPlaceholder: "Set an initial temporary password or generate one",
        tempPasswordEditPlaceholder: "Leave blank to keep the current password",
        tempPasswordEditHint:
            "Entering a new password replaces the current one and forces the doctor to change it at next sign-in.",
        generate: "Generate",
        showPassword: "Show password",
        hidePassword: "Hide password",
        medical: "Medical & Licensing (NPHIES Requirements)",
        nationalIdLabel: "National ID / Iqama Number",
        nationalIdPlaceholder: "Enter national ID or iqama number",
        licenseLabel: "SCFHS License Number",
        licensePlaceholder: "Enter SCFHS license number",
        rank: "Professional Rank",
        chooseRank: "Select professional rank",
        specialty: "Specialty",
        chooseSpecialty: "Select specialty",
        integration: "System & Financial Integration",
        assignedClinic: "Assigned Clinic",
        chooseClinic: "Select clinic",
        offeredServices: "Offered Services",
        selectClinicFirst: "Please select a clinic first.",
        noServices: "No active services are available for this clinic.",
        noClinics: "No active clinics available.",
        commissionInput: "Doctor Commission (%)",
        commissionPlaceholder: "e.g. 12",
        save: "Save Doctor",
        saveEdit: "Save Changes",
        saving: "Creating doctor…",
        savingEdit: "Saving changes…",
        cancel: "Cancel",
        close: "Close",
        menuEdit: "Edit Practitioner",
        menuDelete: "Delete Practitioner",
        menuRegenerate: "Regenerate & Copy Temp Password",
        deleteTitle: "Delete practitioner?",
        deleteBody:
            "This permanently removes the doctor profile, the linked user account and its audit trail. This action cannot be undone.",
        deleteConfirm: "Delete permanently",
        deleting: "Deleting…",
        deleted: "Practitioner deleted successfully.",
        regenerated: "New temporary password generated and copied to the clipboard.",
        copyFailed: "Password generated, but copying failed. Copy it manually:",
        generatedCopied:
            "A temporary password was generated for this account and copied to the clipboard.",
        invalidEmail: "Enter a valid email address.",
        invalidName: "Enter between 1 and 100 characters.",
        invalidPassword:
            "Use 8+ characters with uppercase, lowercase and a number, without spaces.",
        invalidNational: "Enter a valid 10-digit ID starting with 1 (National ID) or 2 (Iqama).",
        invalidLicense: "Enter a valid SCFHS license number.",
        invalidRank: "Select a professional rank.",
        invalidSpecialty: "Select a specialty.",
        invalidClinic: "Select an active clinic.",
        invalidServices: "Select at least one service from the selected clinic.",
        invalidCommission: "Enter a commission between 0 and 100 with at most two decimal places.",
        failed: "The operation could not be completed. Please try again.",
        success: "Doctor created successfully. Share the temporary password with the doctor securely.",
        updated: "Practitioner updated successfully.",
        previous: "Previous page",
        next: "Next page",
        showing: "Showing",
        of: "of",
        doctors: "doctors",
    },
    ar: {
        title: "الأطباء والممارسون الصحيون",
        breadcrumbRoot: "الإدارة",
        subtitle: "إدارة الملفات المهنية والتراخيص وصلاحيات الوصول",
        add: "إضافة طبيب جديد",
        search: "البحث بالاسم أو الهوية أو الترخيص",
        allClinics: "جميع العيادات",
        allStatuses: "جميع الحالات",
        filters: "التصفية",
        resetFilters: "إعادة ضبط التصفية",
        profile: "ملف الطبيب",
        nationalId: "رقم الهوية / الإقامة",
        license: "رقم ترخيص الهيئة",
        clinic: "العيادة",
        services: "الخدمات المقدمة",
        commission: "نسبة العمولة",
        status: "حالة الحساب",
        active: "نشط",
        invited: "بانتظار التفعيل",
        noAccount: "بدون حساب",
        rowActions: "إجراءات الصف",
        empty: "لا توجد نتائج.",
        loading: "جارٍ تحميل الأطباء…",
        retryLoading: "إعادة التحميل",
        retry: "إعادة المحاولة",
        loadFailed: "تعذر تحميل الأطباء.",
        optionsError: "تعذر تحميل العيادات والخدمات.",
        modalAdd: "إضافة طبيب وممارس جديد",
        modalEdit: "تعديل بيانات الممارس",
        credentials: "بيانات الدخول والتواصل",
        email: "البريد الإلكتروني للطبيب",
        emailPlaceholder: "doctor@hospital.sa",
        firstName: "الاسم الأول",
        firstNamePlaceholder: "أدخل الاسم الأول",
        lastName: "اسم العائلة",
        lastNamePlaceholder: "أدخل اسم العائلة",
        inviteHint: "سيستخدم الطبيب كلمة المرور المؤقتة لتسجيل الدخول، وسيُطلب منه تغييرها عند أول دخول.",
        tempPassword: "كلمة المرور المؤقتة",
        tempPasswordPlaceholder: "حدد كلمة مرور مؤقتة أو قم بتوليدها",
        tempPasswordEditPlaceholder: "اتركه فارغًا للإبقاء على كلمة المرور الحالية",
        tempPasswordEditHint:
            "إدخال كلمة مرور جديدة يستبدل الحالية ويُلزم الطبيب بتغييرها عند أول تسجيل دخول.",
        generate: "توليد",
        showPassword: "إظهار كلمة المرور",
        hidePassword: "إخفاء كلمة المرور",
        medical: "البيانات الطبية والتراخيص (متطلبات نفيس)",
        nationalIdLabel: "رقم الهوية الوطنية / الإقامة",
        nationalIdPlaceholder: "أدخل رقم الهوية أو الإقامة",
        licenseLabel: "رقم ترخيص الهيئة السعودية للتخصصات الصحية",
        licensePlaceholder: "أدخل رقم الترخيص",
        rank: "المرتبة المهنية",
        chooseRank: "اختر المرتبة المهنية",
        specialty: "التخصص",
        chooseSpecialty: "اختر التخصص",
        integration: "إعدادات النظام والمالية",
        assignedClinic: "العيادة",
        chooseClinic: "اختر العيادة",
        offeredServices: "الخدمات المقدمة",
        selectClinicFirst: "يرجى اختيار العيادة أولاً.",
        noServices: "لا توجد خدمات نشطة لهذه العيادة.",
        noClinics: "لا توجد عيادات نشطة.",
        commissionInput: "عمولة الطبيب (%)",
        commissionPlaceholder: "مثال: 12",
        save: "حفظ الطبيب",
        saveEdit: "حفظ التعديلات",
        saving: "جارٍ إنشاء الطبيب…",
        savingEdit: "جارٍ حفظ التعديلات…",
        cancel: "إلغاء",
        close: "إغلاق",
        menuEdit: "تعديل الممارس",
        menuDelete: "حذف الممارس",
        menuRegenerate: "إعادة توليد ونسخ كلمة المرور المؤقتة",
        deleteTitle: "حذف الممارس؟",
        deleteBody:
            "سيؤدي ذلك إلى حذف ملف الطبيب وحساب المستخدم المرتبط وسجل التدقيق الخاص به نهائيًا. لا يمكن التراجع عن هذا الإجراء.",
        deleteConfirm: "حذف نهائي",
        deleting: "جارٍ الحذف…",
        deleted: "تم حذف الممارس بنجاح.",
        regenerated: "تم توليد كلمة مرور مؤقتة جديدة ونسخها إلى الحافظة.",
        copyFailed: "تم توليد كلمة المرور لكن تعذر نسخها. انسخها يدويًا:",
        generatedCopied: "تم توليد كلمة مرور مؤقتة لهذا الحساب ونسخها إلى الحافظة.",
        invalidEmail: "أدخل بريدًا إلكترونيًا صحيحًا.",
        invalidName: "أدخل من حرف واحد إلى 100 حرف.",
        invalidPassword: "استخدم 8 أحرف أو أكثر تشمل حرفًا كبيرًا وصغيرًا ورقمًا وبدون مسافات.",
        invalidNational: "أدخل رقمًا من 10 أرقام يبدأ بـ 1 (هوية وطنية) أو 2 (إقامة).",
        invalidLicense: "أدخل رقم ترخيص صحيحًا.",
        invalidRank: "اختر المرتبة المهنية.",
        invalidSpecialty: "اختر التخصص.",
        invalidClinic: "اختر عيادة نشطة.",
        invalidServices: "اختر خدمة واحدة على الأقل من العيادة المحددة.",
        invalidCommission: "أدخل عمولة بين 0 و100 وبحد أقصى منزلتين عشريتين.",
        failed: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
        success: "تم إنشاء الطبيب بنجاح. شارك كلمة المرور المؤقتة مع الطبيب بطريقة آمنة.",
        updated: "تم تحديث بيانات الممارس بنجاح.",
        previous: "الصفحة السابقة",
        next: "الصفحة التالية",
        showing: "عرض",
        of: "من",
        doctors: "طبيب",
    },
} as const;

type Messages = (typeof messages)[Locale];

const rankLabels: Record<DoctorProfessionalRank, { en: string; ar: string }> = {
    CONSULTANT: { en: "Consultant", ar: "استشاري" },
    SPECIALIST: { en: "Specialist", ar: "أخصائي" },
    RESIDENT: { en: "Resident", ar: "طبيب مقيم" },
    GENERAL_PRACTITIONER: { en: "General Practitioner", ar: "طبيب عام" },
    REGISTRAR: { en: "Registrar", ar: "مسجل" },
};

const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:border-teal-500 hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

function toListItem(doctor: DoctorRow, locale: Locale): DoctorListItem {
    return {
        ...doctor,
        services: doctor.services.map((service) => ({
            id: service.id,
            name: locale === "ar" ? service.nameAr : service.nameEn,
        })),
    };
}

function displayName(name: string, locale: Locale): string {
    if (/^(dr\.?|د\.?)\s/i.test(name)) return name;
    return locale === "ar" ? `د. ${name}` : `Dr. ${name}`;
}

function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

function maskIdentity(value: string): string {
    return value.length > 4 ? `${value.slice(0, 2)}•••••${value.slice(-4)}` : value;
}

function pageWindow(current: number, total: number): number[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const start = Math.min(Math.max(1, current - 2), total - 4);
    return Array.from({ length: 5 }, (_, index) => start + index);
}

function randomIndex(max: number): number {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    let value: number;

    do {
        crypto.getRandomValues(buffer);
        value = buffer[0] as number;
    } while (value >= limit);

    return value % max;
}

function generatePassword(length = 14): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%&*?";
    const all = upper + lower + digits + symbols;
    const pick = (set: string) => set[randomIndex(set.length)] as string;

    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

    while (chars.length < length) {
        chars.push(pick(all));
    }

    for (let index = chars.length - 1; index > 0; index--) {
        const swap = randomIndex(index + 1);
        [chars[index], chars[swap]] = [chars[swap] as string, chars[index] as string];
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

function Field({
    id,
    label,
    error,
    required = true,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    required?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
                {label}
                {required && <span className="ms-1 text-teal-400">*</span>}
            </label>
            {children}
            {error && (
                <span role="alert" className="mt-1 block text-xs text-rose-400">
                    {error}
                </span>
            )}
        </div>
    );
}

function SectionTitle({
    icon: Icon,
    children,
}: {
    icon: typeof UserRound;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <Icon className="h-7 w-7 shrink-0 text-teal-400" strokeWidth={1.6} />
            <h3 className="shrink-0 text-base font-bold text-slate-900 dark:text-slate-100">{children}</h3>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700/70" />
        </div>
    );
}

function StatusBadge({
    status,
    t,
}: {
    status: DoctorListItem["accountStatus"];
    t: Messages;
}) {
    const config =
        status === "ACTIVE"
            ? {
                label: t.active,
                wrap: "bg-emerald-500/10 text-emerald-400",
                dot: "bg-emerald-400",
            }
            : status === "INVITED"
                ? {
                    label: t.invited,
                    wrap: "bg-sky-500/10 text-sky-400",
                    dot: "bg-sky-400",
                }
                : {
                    label: t.noAccount,
                    wrap: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
                    dot: "bg-slate-500 dark:bg-slate-400",
                };

    return (
        <span
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold ${config.wrap}`}
        >
            <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}

function RowActions({
    doctor,
    t,
    isRtl,
    busy,
    onEdit,
    onDelete,
    onRegenerate,
}: {
    doctor: DoctorListItem;
    t: Messages;
    isRtl: boolean;
    busy: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onRegenerate: () => void;
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
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = isRtl ? rect.left : rect.right - width;
        left = Math.min(Math.max(margin, left), viewportWidth - width - margin);

        const spaceBelow = viewportHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        let top =
            height + gap <= spaceBelow || spaceBelow >= spaceAbove
                ? rect.bottom + gap
                : rect.top - height - gap;

        top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - height - margin));

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

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
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

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={busy}
                onClick={() => setOpen((value) => !value)}
                className={`grid h-11 w-11 place-items-center rounded-lg border text-slate-600 dark:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 ${open
                    ? "border-teal-500 bg-teal-600/10 text-teal-400"
                    : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
            >
                {busy ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-teal-400" />
                ) : (
                    <MoreHorizontal className="h-5 w-5" />
                )}
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
                        className="z-[150] w-[300px] max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-sm shadow-2xl shadow-black/50"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onEdit)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start font-medium text-slate-900 dark:text-slate-100 transition hover:bg-slate-100 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 focus:outline-none"
                        >
                            <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuEdit}
                        </button>

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onDelete)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start font-medium text-rose-400 transition hover:bg-rose-500/10 focus:bg-rose-500/10 focus:outline-none"
                        >
                            <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuDelete}
                        </button>

                        {doctor.mustChangePassword && (
                            <>
                                <div className="my-2 h-px bg-slate-200 dark:bg-slate-700/70" />
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => choose(onRegenerate)}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start font-medium text-teal-400 transition hover:bg-teal-600/10 focus:bg-teal-600/10 focus:outline-none"
                                >
                                    <KeyRound className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                    {t.menuRegenerate}
                                </button>
                            </>
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
}

function validateForm(
    data: FormData,
    extras: { clinicId: string; serviceIds: string[]; temporaryPassword: string; isEdit: boolean },
    clinics: DoctorFormOptions["clinics"],
    services: DoctorFormOptions["services"],
    specialties: ReadonlyArray<{ en: string; ar: string }>,
    t: Messages,
): { input?: CreateDoctorInput; errors: FormErrors } {
    const errors: FormErrors = {};

    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const firstName = String(data.get("firstName") ?? "").trim();
    const lastName = String(data.get("lastName") ?? "").trim();
    const nationalId = String(data.get("nationalId") ?? "").trim();
    const scfhsLicenseNumber = String(data.get("scfhsLicenseNumber") ?? "").trim();
    const professionalRank = String(data.get("professionalRank") ?? "");
    const specialty = String(data.get("specialty") ?? "").trim();
    const commissionText = String(data.get("commissionRate") ?? "").trim();
    const commissionRate = Number(commissionText);
    const { clinicId, temporaryPassword, isEdit } = extras;

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = t.invalidEmail;
    }

    if (firstName.length < 1 || firstName.length > 100 || /[<>]/.test(firstName)) {
        errors.firstName = t.invalidName;
    }

    if (lastName.length < 1 || lastName.length > 100 || /[<>]/.test(lastName)) {
        errors.lastName = t.invalidName;
    }

    if (
        (!isEdit && temporaryPassword.length === 0) ||
        (temporaryPassword.length > 0 &&
            (temporaryPassword.length < 8 ||
                temporaryPassword.length > 128 ||
                /\s/.test(temporaryPassword) ||
                !/[a-z]/.test(temporaryPassword) ||
                !/[A-Z]/.test(temporaryPassword) ||
                !/\d/.test(temporaryPassword)))
    ) {
        errors.temporaryPassword = t.invalidPassword;
    }

    if (!/^[12]\d{9}$/.test(nationalId)) {
        errors.nationalId = t.invalidNational;
    }

    if (
        scfhsLicenseNumber.length < 3 ||
        scfhsLicenseNumber.length > 50 ||
        !/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(scfhsLicenseNumber)
    ) {
        errors.scfhsLicenseNumber = t.invalidLicense;
    }

    if (
        !Object.values(DoctorProfessionalRank).includes(
            professionalRank as DoctorProfessionalRank,
        )
    ) {
        errors.professionalRank = t.invalidRank;
    }

    const matchedSpecialty = specialties.find((item) => item.en === specialty);

    if (!matchedSpecialty) {
        errors.specialty = t.invalidSpecialty;
    }

    if (!clinics.some((clinic) => clinic.id === clinicId)) {
        errors.clinicId = t.invalidClinic;
    }

    const validServiceIds = new Set(
        services.filter((service) => service.clinicId === clinicId).map((service) => service.id),
    );
    const serviceIds = [...new Set(extras.serviceIds)].filter((id) => validServiceIds.has(id));

    if (serviceIds.length === 0) {
        errors.serviceIds = t.invalidServices;
    }

    if (
        commissionText === "" ||
        !Number.isFinite(commissionRate) ||
        commissionRate < 0 ||
        commissionRate > 100 ||
        !/^\d{1,3}(?:\.\d{1,2})?$/.test(commissionText)
    ) {
        errors.commissionRate = t.invalidCommission;
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    return {
        errors,
        input: {
            email,
            firstName,
            lastName,
            nationalId,
            scfhsLicenseNumber,
            professionalRank: professionalRank as DoctorProfessionalRank,
            specialty,
            specialtyAr: matchedSpecialty?.ar ?? specialty,
            clinicId,
            serviceIds,
            commissionRate,
            temporaryPassword,
        },
    };
}

function DoctorFormModal({
    doctor,
    options,
    optionsLoading,
    optionsError,
    locale,
    t,
    onClose,
    onSubmit,
    onReloadOptions,
}: {
    doctor: DoctorRow | null;
    options: DoctorFormOptions;
    optionsLoading: boolean;
    optionsError: string;
    locale: Locale;
    t: Messages;
    onClose: () => void;
    onSubmit: (input: CreateDoctorInput) => Promise<string | null>;
    onReloadOptions: () => void;
}) {
    const isEdit = Boolean(doctor);
    const isRtl = locale === "ar";

    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [formError, setFormError] = useState("");
    const [clinicId, setClinicId] = useState(doctor?.clinicId ?? "");
    const [serviceIds, setServiceIds] = useState<string[]>(
        doctor ? doctor.services.map((service) => service.id) : [],
    );
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const clinicOptions = useMemo(() => {
        if (doctor && !options.clinics.some((clinic) => clinic.id === doctor.clinicId)) {
            return [
                ...options.clinics,
                {
                    id: doctor.clinicId,
                    nameEn: doctor.clinicName,
                    nameAr: doctor.clinicName,
                    isActive: false,
                },
            ];
        }

        return options.clinics;
    }, [doctor, options.clinics]);

    const specialtyOptions = useMemo(() => {
        if (doctor && !SPECIALTIES.some((item) => item.en === doctor.specialty)) {
            return [...SPECIALTIES, { en: doctor.specialty, ar: doctor.specialtyAr }];
        }

        return SPECIALTIES;
    }, [doctor]);

    const filteredServices = useMemo(
        () => (clinicId ? options.services.filter((service) => service.clinicId === clinicId) : []),
        [options.services, clinicId],
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) onClose();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [saving, onClose]);

    const clearError = (key: keyof FormErrors) =>
        setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));

    function handleGenerate() {
        setPassword(generatePassword());
        setShowPassword(true);
        clearError("temporaryPassword");
    }

    function changeClinic(nextClinicId: string) {
        setClinicId(nextClinicId);
        setServiceIds([]);
        setErrors((current) => ({ ...current, clinicId: undefined, serviceIds: undefined }));
    }

    function toggleService(serviceId: string, checked: boolean) {
        setServiceIds((current) =>
            checked ? [...new Set([...current, serviceId])] : current.filter((id) => id !== serviceId),
        );
        clearError("serviceIds");
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");

        if (optionsLoading || optionsError) {
            setFormError(optionsError || t.optionsError);
            return;
        }

        const validation = validateForm(
            new FormData(event.currentTarget),
            { clinicId, serviceIds, temporaryPassword: password, isEdit },
            clinicOptions,
            options.services,
            specialtyOptions,
            t,
        );

        setErrors(validation.errors);

        if (!validation.input) return;

        setSaving(true);

        try {
            const error = await onSubmit(validation.input);
            if (error) setFormError(error);
        } catch {
            setFormError(t.failed);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 dark:bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="doctor-modal-title"
                className="my-auto w-full max-w-[810px] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-black/60"
            >
                <form noValidate onSubmit={handleSubmit}>
                    <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                        <h2
                            id="doctor-modal-title"
                            className="text-xl font-extrabold text-slate-900 dark:text-white sm:text-2xl"
                        >
                            {isEdit ? t.modalEdit : t.modalAdd}
                        </h2>

                        <button
                            type="button"
                            aria-label={t.close}
                            disabled={saving}
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="max-h-[calc(100dvh-190px)] space-y-7 overflow-y-auto px-5 pb-6 sm:px-7">
                        <section className="space-y-4">
                            <SectionTitle icon={UserRound}>{t.credentials}</SectionTitle>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.2fr_1fr_1fr]">
                                <Field id="doctor-email" label={t.email} error={errors.email}>
                                    <span className="relative block">
                                        <Mail className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-email"
                                            className={`${baseInput} ps-11`}
                                            type="email"
                                            name="email"
                                            defaultValue={doctor?.email ?? ""}
                                            autoComplete="off"
                                            maxLength={254}
                                            placeholder={t.emailPlaceholder}
                                            aria-invalid={Boolean(errors.email)}
                                            disabled={saving}
                                            onChange={() => clearError("email")}
                                        />
                                    </span>
                                </Field>

                                <Field id="doctor-first-name" label={t.firstName} error={errors.firstName}>
                                    <span className="relative block">
                                        <UserRound className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-first-name"
                                            className={`${baseInput} ps-11`}
                                            name="firstName"
                                            defaultValue={doctor?.firstName ?? ""}
                                            placeholder={t.firstNamePlaceholder}
                                            autoComplete="off"
                                            maxLength={100}
                                            aria-invalid={Boolean(errors.firstName)}
                                            disabled={saving}
                                            onChange={() => clearError("firstName")}
                                        />
                                    </span>
                                </Field>

                                <Field id="doctor-last-name" label={t.lastName} error={errors.lastName}>
                                    <span className="relative block">
                                        <UserRound className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-last-name"
                                            className={`${baseInput} ps-11`}
                                            name="lastName"
                                            defaultValue={doctor?.lastName ?? ""}
                                            placeholder={t.lastNamePlaceholder}
                                            autoComplete="off"
                                            maxLength={100}
                                            aria-invalid={Boolean(errors.lastName)}
                                            disabled={saving}
                                            onChange={() => clearError("lastName")}
                                        />
                                    </span>
                                </Field>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300">{t.inviteHint}</p>

                            <Field
                                id="doctor-temp-password"
                                label={t.tempPassword}
                                required={!isEdit}
                                error={errors.temporaryPassword}
                            >
                                <span className="relative block">
                                    <Lock className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                    <input
                                        id="doctor-temp-password"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        dir="ltr"
                                        autoComplete="new-password"
                                        maxLength={128}
                                        placeholder={
                                            isEdit ? t.tempPasswordEditPlaceholder : t.tempPasswordPlaceholder
                                        }
                                        aria-invalid={Boolean(errors.temporaryPassword)}
                                        disabled={saving}
                                        onChange={(event) => {
                                            setPassword(event.target.value);
                                            clearError("temporaryPassword");
                                        }}
                                        className={`${baseInput} h-12 ps-11 pe-40 ${isRtl ? "text-end" : ""}`}
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? t.hidePassword : t.showPassword}
                                        disabled={saving}
                                        onClick={() => setShowPassword((value) => !value)}
                                        className="absolute end-[108px] top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-600 dark:text-slate-300 transition hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={handleGenerate}
                                        className="absolute end-2 top-1/2 h-9 -translate-y-1/2 rounded-md border border-teal-500 px-4 text-sm font-semibold text-teal-400 transition hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                                    >
                                        {t.generate}
                                    </button>
                                </span>
                            </Field>

                            {isEdit && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{t.tempPasswordEditHint}</p>
                            )}
                        </section>

                        <section className="space-y-4">
                            <SectionTitle icon={FileBadge}>{t.medical}</SectionTitle>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field
                                    id="doctor-national-id"
                                    label={t.nationalIdLabel}
                                    error={errors.nationalId}
                                >
                                    <span className="relative block">
                                        <Contact className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-national-id"
                                            name="nationalId"
                                            defaultValue={doctor?.nationalId ?? ""}
                                            placeholder={t.nationalIdPlaceholder}
                                            inputMode="numeric"
                                            autoComplete="off"
                                            maxLength={10}
                                            dir="ltr"
                                            className={`${baseInput} ps-11 ${isRtl ? "text-end" : ""}`}
                                            aria-invalid={Boolean(errors.nationalId)}
                                            disabled={saving}
                                            onChange={() => clearError("nationalId")}
                                        />
                                    </span>
                                </Field>

                                <Field
                                    id="doctor-license"
                                    label={t.licenseLabel}
                                    error={errors.scfhsLicenseNumber}
                                >
                                    <span className="relative block">
                                        <FileText className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-license"
                                            name="scfhsLicenseNumber"
                                            defaultValue={doctor?.scfhsLicenseNumber ?? ""}
                                            placeholder={t.licensePlaceholder}
                                            autoComplete="off"
                                            maxLength={50}
                                            dir="ltr"
                                            className={`${baseInput} ps-11 ${isRtl ? "text-end" : ""}`}
                                            aria-invalid={Boolean(errors.scfhsLicenseNumber)}
                                            disabled={saving}
                                            onChange={() => clearError("scfhsLicenseNumber")}
                                        />
                                    </span>
                                </Field>

                                <Field id="doctor-rank" label={t.rank} error={errors.professionalRank}>
                                    <span className="relative block">
                                        <BriefcaseMedical className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <select
                                            id="doctor-rank"
                                            name="professionalRank"
                                            defaultValue={doctor?.professionalRank ?? ""}
                                            className={`${baseInput} appearance-none ps-11 pe-10`}
                                            aria-invalid={Boolean(errors.professionalRank)}
                                            disabled={saving}
                                            onChange={() => clearError("professionalRank")}
                                        >
                                            <option value="" disabled>
                                                {t.chooseRank}
                                            </option>
                                            {Object.values(DoctorProfessionalRank).map((rank) => (
                                                <option key={rank} value={rank}>
                                                    {rankLabels[rank][locale]}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                    </span>
                                </Field>

                                <Field id="doctor-specialty" label={t.specialty} error={errors.specialty}>
                                    <span className="relative block">
                                        <Stethoscope className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <select
                                            id="doctor-specialty"
                                            name="specialty"
                                            defaultValue={doctor?.specialty ?? ""}
                                            className={`${baseInput} appearance-none ps-11 pe-10`}
                                            aria-invalid={Boolean(errors.specialty)}
                                            disabled={saving}
                                            onChange={() => clearError("specialty")}
                                        >
                                            <option value="" disabled>
                                                {t.chooseSpecialty}
                                            </option>
                                            {specialtyOptions.map((item) => (
                                                <option key={item.en} value={item.en}>
                                                    {isRtl ? item.ar : item.en}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                    </span>
                                </Field>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <SectionTitle icon={Activity}>{t.integration}</SectionTitle>

                            {optionsError && (
                                <div
                                    role="alert"
                                    className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400"
                                >
                                    <p>{optionsError}</p>
                                    <button
                                        type="button"
                                        onClick={onReloadOptions}
                                        className="mt-2 font-semibold text-teal-400 underline"
                                    >
                                        {t.retry}
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.35fr_.85fr]">
                                <Field id="doctor-clinic" label={t.assignedClinic} error={errors.clinicId}>
                                    <span className="relative block">
                                        <Building2 className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <select
                                            id="doctor-clinic"
                                            name="clinicId"
                                            value={clinicId}
                                            disabled={saving || optionsLoading || clinicOptions.length === 0}
                                            className={`${baseInput} h-12 appearance-none ps-11 pe-10`}
                                            onChange={(event) => changeClinic(event.target.value)}
                                        >
                                            <option value="">{optionsLoading ? "…" : t.chooseClinic}</option>
                                            {clinicOptions.map((clinic) => (
                                                <option key={clinic.id} value={clinic.id}>
                                                    {isRtl ? clinic.nameAr : clinic.nameEn}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                    </span>

                                    {!optionsLoading && clinicOptions.length === 0 && (
                                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t.noClinics}</span>
                                    )}
                                </Field>

                                <fieldset className="min-w-0" disabled={saving}>
                                    <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        {t.offeredServices}
                                        <span className="ms-1 text-teal-400">*</span>
                                    </legend>

                                    {!clinicId ? (
                                        <p className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-500 dark:text-slate-400">
                                            {t.selectClinicFirst}
                                        </p>
                                    ) : filteredServices.length === 0 ? (
                                        <p className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-500 dark:text-slate-400">
                                            {t.noServices}
                                        </p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {filteredServices.map((service) => {
                                                const checked = serviceIds.includes(service.id);

                                                return (
                                                    <label
                                                        key={service.id}
                                                        className={`inline-flex h-12 max-w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm transition ${checked
                                                            ? "border-teal-500 bg-teal-600/10 text-teal-300"
                                                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-500"
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            value={service.id}
                                                            checked={checked}
                                                            onChange={(event) =>
                                                                toggleService(service.id, event.target.checked)
                                                            }
                                                            className="h-4 w-4 rounded accent-teal-600"
                                                        />
                                                        <span className="max-w-32 truncate">
                                                            {isRtl ? service.nameAr : service.nameEn}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {errors.serviceIds && (
                                        <span role="alert" className="mt-1 block text-xs text-rose-400">
                                            {errors.serviceIds}
                                        </span>
                                    )}
                                </fieldset>

                                <Field
                                    id="doctor-commission"
                                    label={t.commissionInput}
                                    error={errors.commissionRate}
                                >
                                    <span className="relative block">
                                        <Percent className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                        <input
                                            id="doctor-commission"
                                            name="commissionRate"
                                            defaultValue={doctor?.commissionRate ?? ""}
                                            placeholder={t.commissionPlaceholder}
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            dir="ltr"
                                            className={`${baseInput} h-12 ps-11 ${isRtl ? "text-end" : ""}`}
                                            aria-invalid={Boolean(errors.commissionRate)}
                                            disabled={saving}
                                            onChange={() => clearError("commissionRate")}
                                        />
                                    </span>
                                </Field>
                            </div>
                        </section>

                        {formError && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <p>{formError}</p>
                            </div>
                        )}
                    </div>

                    <footer className="flex flex-col-reverse gap-3 border-t border-slate-200/80 dark:border-slate-700/70 px-5 py-5 sm:flex-row sm:justify-end sm:px-7">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={onClose}
                            className={`${outlineButton} h-12 px-8`}
                        >
                            {t.cancel}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                saving ||
                                optionsLoading ||
                                Boolean(optionsError) ||
                                clinicOptions.length === 0
                            }
                            className={`${tealButton} h-12 px-6`}
                        >
                            {saving ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4" />
                            )}
                            {saving
                                ? isEdit
                                    ? t.savingEdit
                                    : t.saving
                                : isEdit
                                    ? t.saveEdit
                                    : t.save}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );
}

export default function DoctorsManagementPage() {
    const [locale, setLocale] = useState<Locale>("ar");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [doctors, setDoctors] = useState<DoctorRow[]>([]);
    const [options, setOptions] = useState<DoctorFormOptions>({ clinics: [], services: [] });
    const [loading, setLoading] = useState(true);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [optionsError, setOptionsError] = useState("");
    const [query, setQuery] = useState("");
    const [clinicFilter, setClinicFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState<ModalState>(null);
    const [deleteTarget, setDeleteTarget] = useState<DoctorRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const t = messages[locale];
    const isRtl = locale === "ar";

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

    useEffect(() => {
        if (!notice) return;

        const timer = window.setTimeout(() => setNotice(null), 8000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const loadDoctors = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const first = await getDoctorsAction({ page: 1, pageSize: 100 });

            if (!first.success || !first.data) {
                setLoadError(first.error ?? t.loadFailed);
                setDoctors([]);
                return;
            }

            const rows = [...first.data.doctors];

            for (let nextPage = 2; nextPage <= first.data.totalPages; nextPage++) {
                const next = await getDoctorsAction({ page: nextPage, pageSize: 100 });

                if (!next.success || !next.data) {
                    setLoadError(next.error ?? t.loadFailed);
                    setDoctors([]);
                    return;
                }

                rows.push(...next.data.doctors);
            }

            setDoctors(rows);
        } catch {
            setLoadError(t.loadFailed);
            setDoctors([]);
        } finally {
            setLoading(false);
        }
    }, [t.loadFailed]);

    const loadOptions = useCallback(async () => {
        setOptionsLoading(true);
        setOptionsError("");

        try {
            const result = await getDoctorFormOptions();

            if (!result.success || !result.data) {
                setOptionsError(result.error ?? t.optionsError);
                setOptions({ clinics: [], services: [] });
                return;
            }

            setOptions(result.data);
        } catch {
            setOptionsError(t.optionsError);
            setOptions({ clinics: [], services: [] });
        } finally {
            setOptionsLoading(false);
        }
    }, [t.optionsError]);

    useEffect(() => {
        void loadDoctors();
        void loadOptions();
    }, [loadDoctors, loadOptions]);

    // Keep the UI resilient if a Server Action returns an unexpected payload shape.
    // The state is intended to contain DoctorRow[], but runtime data is not guaranteed.
    const safeDoctors = Array.isArray(doctors) ? doctors : [];

    const displayDoctors = useMemo(
        () => safeDoctors.map((doctor) => toListItem(doctor, locale)),
        [safeDoctors, locale],
    );

    const filteredDoctors = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase(locale);

        return displayDoctors.filter((doctor) => {
            const searchable = [
                doctor.fullName,
                doctor.email ?? "",
                doctor.nationalId,
                doctor.scfhsLicenseNumber,
                doctor.specialty,
                doctor.clinicName,
                ...doctor.services.map((service) => service.name),
            ]
                .join(" ")
                .toLocaleLowerCase(locale);

            return (
                (!normalized || searchable.includes(normalized)) &&
                (clinicFilter === "ALL" || doctor.clinicId === clinicFilter) &&
                (statusFilter === "ALL" || doctor.accountStatus === statusFilter)
            );
        });
    }, [displayDoctors, query, clinicFilter, statusFilter, locale]);

    const totalPages = Math.max(1, Math.ceil(filteredDoctors.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visibleDoctors = filteredDoctors.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    useEffect(() => {
        setPage(1);
    }, [query, clinicFilter, statusFilter]);

    function openCreate() {
        setNotice(null);
        setModal({ mode: "create" });
        void loadOptions();
    }

    function openEdit(doctor: DoctorRow) {
        setNotice(null);
        setModal({ mode: "edit", doctor });
        void loadOptions();
    }

    async function announceGeneratedPassword(email: string | null, password: string, base: string) {
        const copied = await copyText(`Email: ${email ?? ""} | Temporary Password: ${password}`);

        setNotice(
            copied
                ? { kind: "success", message: `${base} ${t.generatedCopied}` }
                : { kind: "error", message: `${base} ${t.copyFailed} ${password}` },
        );
    }

    async function submitDoctor(input: CreateDoctorInput): Promise<string | null> {
        setNotice(null);

        try {
            if (modal?.mode === "edit") {
                const result = await updateDoctorAction({ ...input, doctorId: modal.doctor.id });

                if (!result.success || !result.data) {
                    return result.error ?? t.failed;
                }

                const updated = result.data.doctor;

                setDoctors((current) => {
                    const currentDoctors = Array.isArray(current) ? current : [];
                    return currentDoctors.map((doctor) =>
                        doctor.id === updated.id ? updated : doctor,
                    );
                });
                setModal(null);

                if (result.data.generatedPassword) {
                    await announceGeneratedPassword(
                        updated.email,
                        result.data.generatedPassword,
                        t.updated,
                    );
                } else {
                    setNotice({ kind: "success", message: t.updated });
                }

                return null;
            }

            const result = await createDoctorAction(input);

            if (!result.success || !result.data) {
                return result.error ?? t.failed;
            }

            const created: DoctorRow = {
                ...result.data.doctor,
                accountStatus: "INVITED",
                mustChangePassword: true,
            };

            setDoctors((current) => {
                const currentDoctors = Array.isArray(current) ? current : [];
                return [
                    created,
                    ...currentDoctors.filter((doctor) => doctor.id !== created.id),
                ];
            });
            setModal(null);

            if (result.data.generatedPassword) {
                await announceGeneratedPassword(created.email, result.data.generatedPassword, t.success);
            } else {
                setNotice({ kind: "success", message: t.success });
            }

            return null;
        } catch {
            return t.failed;
        }
    }

    async function handleRegenerate(doctor: DoctorRow) {
        setNotice(null);
        setBusyId(doctor.id);

        try {
            const result = await regenerateTempPasswordAction(doctor.id);

            if (!result.success || !result.data) {
                setNotice({ kind: "error", message: result.error ?? t.failed });
                return;
            }

            const { email, temporaryPassword } = result.data;
            const copied = await copyText(`Email: ${email} | Temporary Password: ${temporaryPassword}`);

            setNotice(
                copied
                    ? { kind: "success", message: t.regenerated }
                    : { kind: "error", message: `${t.copyFailed} ${temporaryPassword}` },
            );
        } catch {
            setNotice({ kind: "error", message: t.failed });
        } finally {
            setBusyId(null);
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;

        setDeleting(true);
        setDeleteError("");

        try {
            const result = await deleteDoctorAction(deleteTarget.id);

            if (!result.success) {
                setDeleteError(result.error ?? t.failed);
                return;
            }

            const removedId = deleteTarget.id;

            setDoctors((current) =>
                (Array.isArray(current) ? current : []).filter(
                    (doctor) => doctor.id !== removedId,
                ),
            );
            setDeleteTarget(null);
            setNotice({ kind: "success", message: t.deleted });
        } catch {
            setDeleteError(t.failed);
        } finally {
            setDeleting(false);
        }
    }

    const showingFrom = filteredDoctors.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, filteredDoctors.length);
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref="/admin/clinical/providers"
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
                            </div>

                            <button
                                type="button"
                                onClick={openCreate}
                                className={`${tealButton} h-12 px-6 text-base`}
                            >
                                <Plus className="h-5 w-5" />
                                {t.add}
                            </button>
                        </header>

                        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1.7fr)_minmax(180px,1fr)_minmax(180px,.95fr)_auto]">
                            <label className="relative block">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t.search}
                                    aria-label={t.search}
                                    className={`${baseInput} h-[54px] bg-white dark:bg-slate-900/60 ps-12`}
                                />
                            </label>

                            <label className="relative block">
                                <Building2 className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                                <select
                                    value={clinicFilter}
                                    onChange={(event) => setClinicFilter(event.target.value)}
                                    aria-label={t.allClinics}
                                    className={`${baseInput} h-[54px] appearance-none bg-white dark:bg-slate-900/60 ps-12 pe-10`}
                                >
                                    <option value="ALL">{t.allClinics}</option>
                                    {options.clinics.map((clinic) => (
                                        <option key={clinic.id} value={clinic.id}>
                                            {isRtl ? clinic.nameAr : clinic.nameEn}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                            </label>

                            <label className="relative block">
                                <UserRound className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                    aria-label={t.allStatuses}
                                    className={`${baseInput} h-[54px] appearance-none bg-white dark:bg-slate-900/60 ps-12 pe-10`}
                                >
                                    <option value="ALL">{t.allStatuses}</option>
                                    <option value="ACTIVE">{t.active}</option>
                                    <option value="INVITED">{t.invited}</option>
                                    <option value="NO_ACCOUNT">{t.noAccount}</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                            </label>

                            <button
                                type="button"
                                title={t.resetFilters}
                                onClick={() => {
                                    setQuery("");
                                    setClinicFilter("ALL");
                                    setStatusFilter("ALL");
                                }}
                                className={`${outlineButton} h-[54px] bg-white dark:bg-slate-900/60 px-6`}
                            >
                                <Filter className="h-5 w-5" />
                                {t.filters}
                            </button>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xl shadow-black/20">
                            {loadError ? (
                                <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                                    <CircleAlert className="h-8 w-8 text-teal-500" />
                                    <p className="text-sm">{loadError}</p>
                                    <button
                                        type="button"
                                        onClick={() => void loadDoctors()}
                                        className={tealButton}
                                    >
                                        {t.retryLoading}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[1100px] border-collapse text-start">
                                            <thead>
                                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100">
                                                    <th className="px-6 py-5 text-start align-middle">{t.profile}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.nationalId}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.license}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.clinic}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.services}</th>
                                                    <th className="px-4 py-5 text-center align-middle">{t.commission}</th>
                                                    <th className="px-4 py-5 text-start align-middle">{t.status}</th>
                                                    <th className="w-16 px-4 py-5 align-middle">
                                                        <span className="sr-only">{t.rowActions}</span>
                                                    </th>
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                                {loading ? (
                                                    <tr>
                                                        <td colSpan={8} className="h-56 text-center align-middle">
                                                            <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-teal-500" />
                                                            <span className="mt-3 block text-sm text-slate-500 dark:text-slate-400">
                                                                {t.loading}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : visibleDoctors.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={8}
                                                            className="h-56 text-center align-middle text-sm text-slate-500 dark:text-slate-400"
                                                        >
                                                            {t.empty}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    visibleDoctors.map((doctor) => {
                                                        const source = doctors.find((item) => item.id === doctor.id);

                                                        return (
                                                            <tr
                                                                key={doctor.id}
                                                                className="transition hover:bg-slate-100 dark:hover:bg-slate-800/30"
                                                            >
                                                                <td className="px-6 py-5 align-middle">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-slate-700/60 text-base font-bold text-slate-900 dark:text-slate-100">
                                                                            {initials(doctor.fullName)}
                                                                        </div>

                                                                        <div className="min-w-0">
                                                                            <p className="max-w-56 truncate text-base font-bold text-slate-900 dark:text-white">
                                                                                {displayName(doctor.fullName, locale)}
                                                                            </p>
                                                                            <p className="mt-1 max-w-56 truncate text-sm text-slate-500 dark:text-slate-400">
                                                                                {rankLabels[doctor.professionalRank][locale]}{" "}
                                                                                · {doctor.specialty}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                                                    <span dir="ltr">{maskIdentity(doctor.nationalId)}</span>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                                                    <span dir="ltr">{doctor.scfhsLicenseNumber}</span>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                                                    {doctor.clinicName}
                                                                </td>

                                                                <td className="px-4 py-5 align-middle">
                                                                    <div className="flex max-w-64 flex-wrap gap-2">
                                                                        {doctor.services.map((service) => (
                                                                            <span
                                                                                key={service.id}
                                                                                className="inline-flex max-w-40 items-center gap-2 rounded-lg bg-teal-600/10 px-3 py-2 text-sm text-teal-300"
                                                                            >
                                                                                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500" />
                                                                                <span className="truncate">{service.name}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </td>

                                                                <td className="px-4 py-5 text-center align-middle text-base font-semibold text-slate-900 dark:text-slate-100">
                                                                    <span dir="ltr">{doctor.commissionRate}%</span>
                                                                </td>

                                                                <td className="px-4 py-5 align-middle">
                                                                    <StatusBadge status={doctor.accountStatus} t={t} />
                                                                </td>

                                                                <td className="px-4 py-5 text-end align-middle">
                                                                    {source && (
                                                                        <RowActions
                                                                            doctor={doctor}
                                                                            t={t}
                                                                            isRtl={isRtl}
                                                                            busy={busyId === doctor.id}
                                                                            onEdit={() => openEdit(source)}
                                                                            onDelete={() => {
                                                                                setDeleteError("");
                                                                                setDeleteTarget(source);
                                                                            }}
                                                                            onRegenerate={() => void handleRegenerate(source)}
                                                                        />
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {t.showing}{" "}
                                            <strong className="text-slate-900 dark:text-slate-100">
                                                {showingFrom}–{showingTo}
                                            </strong>{" "}
                                            {t.of} <strong className="text-slate-900 dark:text-slate-100">{filteredDoctors.length}</strong>{" "}
                                            {t.doctors}
                                        </p>

                                        <nav aria-label="Doctor pagination" className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                aria-label={t.previous}
                                                disabled={currentPage <= 1}
                                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-teal-500 hover:text-teal-400 disabled:opacity-40"
                                            >
                                                <PrevIcon className="h-4 w-4" />
                                            </button>

                                            {pageWindow(currentPage, totalPages).map((pageNumber) => (
                                                <button
                                                    type="button"
                                                    key={pageNumber}
                                                    aria-current={pageNumber === currentPage ? "page" : undefined}
                                                    onClick={() => setPage(pageNumber)}
                                                    className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-semibold transition ${pageNumber === currentPage
                                                        ? "border-teal-600 bg-teal-600 text-white"
                                                        : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-400"
                                                        }`}
                                                >
                                                    {pageNumber}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                aria-label={t.next}
                                                disabled={currentPage >= totalPages}
                                                onClick={() =>
                                                    setPage((value) => Math.min(totalPages, value + 1))
                                                }
                                                className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-teal-500 hover:text-teal-400 disabled:opacity-40"
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
                <DoctorFormModal
                    key={modal.mode === "edit" ? modal.doctor.id : "create"}
                    doctor={modal.mode === "edit" ? modal.doctor : null}
                    options={options}
                    optionsLoading={optionsLoading}
                    optionsError={optionsError}
                    locale={locale}
                    t={t}
                    onClose={() => setModal(null)}
                    onSubmit={submitDoctor}
                    onReloadOptions={() => void loadOptions()}
                />
            )}

            {deleteTarget && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/80 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !deleting) setDeleteTarget(null);
                    }}
                >
                    <section
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="delete-doctor-title"
                        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-black/60"
                    >
                        <div className="flex items-start gap-4">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-400">
                                <Trash2 className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                                <h2 id="delete-doctor-title" className="text-lg font-bold text-slate-900 dark:text-white">
                                    {t.deleteTitle}
                                </h2>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    {displayName(deleteTarget.fullName, locale)}
                                </p>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.deleteBody}</p>
                            </div>
                        </div>

                        {deleteError && (
                            <div
                                role="alert"
                                className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400"
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
                                className={`${outlineButton} h-11 px-6`}
                            >
                                {t.cancel}
                            </button>

                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => void confirmDelete()}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className={`fixed bottom-6 end-6 z-[200] flex max-w-md items-start gap-3 rounded-xl border bg-white dark:bg-slate-900 p-4 text-sm shadow-2xl shadow-black/50 ${notice.kind === "success" ? "border-teal-600/40" : "border-rose-500/40"
                        }`}
                >
                    {notice.kind === "success" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                    ) : (
                        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                    )}

                    <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">{notice.message}</p>

                    <button
                        type="button"
                        onClick={() => setNotice(null)}
                        aria-label={t.close}
                        className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}