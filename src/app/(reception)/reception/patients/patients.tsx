"use client";

// ============================================================================
// app/(reception)/reception/patients/patients.tsx
// Reception Portal — Patients Directory & NPHIES Profiles (Mjdital).
//
//  - Chrome: ReceptionSidebar + ReceptionHeader (no duplicate "Quick Appointment" CTA in the body).
//  - Data: 100% database through ./actions (no mock arrays). The whole directory is loaded ONCE on
//    mount (one server round-trip). Search, the coverage / NPHIES dropdowns, sorting, the Smart
//    Filter Reset and pagination run entirely in memory — zero server calls per keystroke or
//    dropdown change. The directory is re-read only after a real mutation (create / edit /
//    book visit) or an explicit Retry; "Verify NPHIES" patches the single returned row in place.
//  - Locale: `initialLocale` is passed by page.tsx (getLocale()) and seeds the locale state.
//  - NPHIES: "Verify NPHIES" / "Check NPHIES Eligibility" run through nphies.checkEligibility
//    (NPHIES_MODE = SIMULATOR | PRODUCTION) inside the server actions.
//  - AR/EN + RTL/LTR follow `locale`; Dark/Light follows the app-level `dark` class.
// ============================================================================

import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ComponentType,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowUpDown,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Eye,
    FileText,
    Info,
    LoaderCircle,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    ShieldCheck,
    ShieldPlus,
    UserRound,
    X,
} from "lucide-react";
import type { Gender, IdentityType, AppointmentStatus } from "@prisma/client";
import type { Locale } from "@/lib/i18n/types";
import ReceptionSidebar from "@/components/ReceptionSidebar/Sidebar";
import ReceptionHeader from "@/components/ReceptionHeader/Header";
import {
    bookPatientVisitAction,
    checkDraftEligibilityAction,
    createPatientAction,
    getPatientForEditAction,
    getPatientFormOptionsAction,
    getPatientProfileAction,
    getPatientsDirectoryAction,
    getVisitBookingOptionsAction,
    getVisitSlotsAction,
    updatePatientAction,
    verifyPatientNphiesAction,
    type EligibilityCheckData,
    type NphiesPatientState,
    type PatientCopay,
    type PatientCoverageFilter,
    type PatientDirectoryData,
    type PatientDirectoryStats,
    type PatientFormField,
    type PatientFormInput,
    type PatientFormOptions,
    type PatientNphiesFilter,
    type PatientProfileData,
    type PatientRow,
    type PatientSortDir,
    type PatientSortKey,
    type ProfileZatcaStatus,
    type VisitBookingOptions,
    type VisitSlot,
} from "./actions";

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */

const PATIENTS_HREF = "/reception/patients";
const PAGE_SIZE = 8;
const SEARCH_MAX_LENGTH = 80;
const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const SKELETON_ROWS = 8;

const AVATAR_COLORS = [
    "bg-teal-600",
    "bg-violet-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-emerald-600",
    "bg-fuchsia-500",
    "bg-blue-600",
    "bg-pink-600",
] as const;

/* ========================================================================== */
/* Messages (AR / EN)                                                         */
/* ========================================================================== */

const en = {
    pageTitle: "Patients Directory & NPHIES Profiles",
    breadcrumbRoot: "Reception",
    breadcrumbPage: "Patients",
    tableTitle: "Patients Directory",
    statTotal: "Total Patients",
    statInsured: "Insured",
    statCash: "Cash",
    modeSimulator: "NPHIES Simulator",
    modeProduction: "NPHIES Production",
    searchPlaceholder: "Search by National ID, Iqama, MRN, or Mobile Number...",
    searchLabel: "Search patients",
    allCoverage: "All Coverage",
    coverageInsured: "Insured (NPHIES)",
    coverageCash: "Cash Patients",
    nphiesStatus: "NPHIES Status",
    allStatuses: "All Statuses",
    stEligible: "Eligible",
    stPending: "Pending",
    stExpired: "Expired",
    stNoCoverage: "No Coverage",
    resetFilters: "Reset filters",
    register: "Register New Patient",

    colPatient: "MRN & Patient Name",
    colId: "National ID & VAT",
    colMobile: "Mobile & Demographics",
    colInsurance: "Insurance & NPHIES",
    colActions: "Actions",
    sortBy: "Sort by",
    saudi: "Saudi",
    resident: "Resident",
    vatPercent: "{value}% VAT",
    yrs: "yrs",
    male: "Male",
    female: "Female",
    copayPercent: "{value}% Co-pay",
    copayFixed: "{value} SAR Co-pay",
    copayCap: "Max {value} SAR",
    cashPatient: "Cash Patient",
    selfPay: "Self-pay",
    expiredOn: "Expired {date}",

    verify: "Verify NPHIES",
    verifying: "Verifying…",
    addInsurance: "Add Insurance",
    bookVisit: "Book Visit",
    viewProfile: "View Profile",
    edit: "Edit",

    showing: "Showing",
    of: "of",
    patients: "patients",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    empty: "No patients have been registered yet.",
    emptyFiltered: "No patients match your search or filters.",
    loadFailed: "Unable to load the patients directory.",
    retry: "Retry",
    refreshing: "Updating…",

    close: "Close",
    cancel: "Cancel",
    none: "—",
    failed: "The operation could not be completed. Please try again.",
    selectPlaceholder: "Select…",
    noOptions: "No options available",

    formRegisterTitle: "Register New Patient",
    formEditTitle: "Edit Patient",
    secPersonal: "Personal & ZATCA Information",
    secInsurance: "Insurance & Live NPHIES Check",
    fldNameEn: "Full Name (English)",
    fldNameAr: "Full Name (Arabic)",
    fldIdType: "ID Type",
    optNationalId: "National ID",
    optIqama: "Iqama (Resident)",
    fldIdNumber: "ID Number",
    fldNationality: "Nationality",
    optSaudi: "Saudi Arabia",
    optNonSaudi: "Other nationality (Resident)",
    vatExempt: "VAT Exempt - 0%",
    vatStandard: "VAT 15%",
    fldDob: "Date of Birth",
    fldGender: "Gender",
    fldMobile: "Mobile Number",
    fldInsured: "Insured (NPHIES)",
    fldPayer: "Insurance Payer",
    fldPolicy: "Policy Plan",
    fldMember: "Member / Card ID",
    selectPayer: "Select payer",
    selectPolicy: "Select policy plan",
    selectGender: "Select gender",
    policyExpiredTag: "Expired",
    noPolicies: "No active policy plans for this payer",
    checkEligibility: "Check NPHIES Eligibility",
    checking: "Checking NPHIES…",
    eligStatus: "Status",
    eligActive: "Active Coverage",
    eligInactive: "Policy Inactive / Expired",
    eligPending: "Under insurer review",
    eligError: "Eligibility check failed",
    eligCopay: "Co-payment",
    eligPlan: "Plan",
    eligRef: "NPHIES Ref",
    eligVerifiedNow: "Verified just now",
    eligCashFallback: "Collect payment in cash, or renew the policy.",
    eligReuse: "This result is saved with the patient.",
    save: "Save Patient Profile",
    saving: "Saving…",
    errNameEn: "Enter the full name using English letters.",
    errNameAr: "Enter the full name using Arabic letters.",
    errNationalId: "Enter a valid 10-digit ID number.",
    errIdMismatchSaudi: "A Saudi National ID must start with 1.",
    errIdMismatchResident: "An Iqama number must start with 2.",
    errDob: "Enter a valid date of birth.",
    errGender: "Select a gender.",
    errPhone: "Enter a valid Saudi mobile number (05XXXXXXXX).",
    errPayer: "Select an insurance payer.",
    errPolicy: "Select a policy plan.",
    errMember: "Enter a valid member / card ID.",

    bookTitle: "Book Visit",
    bookPatient: "Patient",
    bookClinic: "Clinic",
    bookChooseClinic: "Select clinic",
    bookDoctor: "Doctor",
    bookChooseDoctor: "Select doctor",
    bookDate: "Date",
    bookSlots: "Available slots",
    bookPickDoctor: "Select a clinic and doctor first.",
    bookNoSlots: "No available slots on this date.",
    bookNoDoctors: "No doctors with active shifts in this clinic.",
    bookReason: "Reason for visit (optional)",
    bookConfirm: "Book Appointment",
    booking: "Booking…",
    bookExpiredWarning: "This patient's policy is expired. Collect cash or renew the policy before service.",
    bookCashNote: "Cash patient — payment is collected at the desk.",
    offDuty: "off duty",

    profileTitle: "Patient Profile",
    profileSubtitle: "Administrative & operational history",
    profileInfo: "Details",
    profileMobile: "Mobile",
    profileId: "ID",
    profileDob: "Date of birth",
    profileMember: "Member ID",
    profilePlan: "Plan",
    profileRegistered: "Registered",
    profileLastCheck: "Last NPHIES check",
    tabVisits: "Visits",
    tabInvoices: "ZATCA Invoices",
    tabNphies: "NPHIES Log",
    upcoming: "Upcoming",
    past: "Past",
    noVisits: "No visits recorded.",
    noInvoices: "No invoices issued.",
    noNphies: "No NPHIES transactions yet.",
    invoiceB2c: "Simplified Invoice · B2C",
    invoiceB2b: "Tax Invoice · B2B",
    invoiceInsurance: "Tax Invoice B2B · Insurance",
    invoiceCredit: "Credit Note",
    invoiceDebit: "Debit Note",
    invoiceTotal: "Total",
    invoiceVat: "VAT",
    vatExemptShort: "VAT exempt",
    txEligibility: "Eligibility Check",
    txPreAuth: "Pre-Authorization",
    txClaim: "Claim",
    txPrescription: "E-Prescription",
    txPoll: "Status Check",
    preAuthRef: "Approval ref",
    policyActive: "Policy active",
    policyInactive: "Policy inactive",
    latency: "Response",

    visitStatus: {
        SCHEDULED: "Scheduled",
        CONFIRMED: "Confirmed",
        WAITING: "Waiting",
        IN_PROGRESS: "In Clinic",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled",
        NO_SHOW: "No-show",
    },
    zatcaStatus: {
        CLEARED: "Cleared",
        REPORTED: "Reported",
        PENDING: "Pending",
        REJECTED: "Rejected",
        NOT_SUBMITTED: "Not submitted",
    },
    txStatus: {
        COMPLETE: "Complete",
        QUEUED: "Under review",
        PARTIAL: "Partial",
        ERROR: "Rejected",
    },

    toastCreated: "Patient registered successfully.",
    toastUpdated: "Patient profile updated.",
    toastBooked: "Appointment booked successfully.",
    toastVerified: "Coverage verified:",
    toastPending: "Eligibility is under insurer review.",
    toastExpired: "Policy inactive — collect cash or renew the policy via Edit.",
    toastEligError: "NPHIES could not complete the eligibility check.",

    errors: {
        UNAUTHORIZED: "Your session has expired. Sign in and try again.",
        DUPLICATE_NATIONAL_ID: "A patient with this ID number is already registered.",
        RECORD_NOT_FOUND: "The record could not be found. Refresh and try again.",
        NO_COVERAGE: "This is a cash patient. There is no insurance coverage to verify.",
        PROVIDER_INACTIVE: "The insurance company is inactive.",
        MISSING_MEMBER_ID: "The insurance member ID is missing.",
        NPHIES_CONFIGURATION: "NPHIES is not configured for this center. Contact your administrator.",
        SLOT_TAKEN: "This slot was just taken. Pick another time.",
        SLOT_UNAVAILABLE: "The selected slot is no longer available.",
        PATIENT_BUSY: "This patient already has an appointment at this time.",
        NO_CLINIC: "No active clinic is configured for this center.",
        POLICY_EXPIRED: "The selected policy is expired or inactive. Choose an active policy.",
        DATABASE_ERROR: "The operation could not be completed. Please try again.",
    } as Record<string, string>,
};

const ar: typeof en = {
    pageTitle: "دليل المرضى وملفات نفيس",
    breadcrumbRoot: "الاستقبال",
    breadcrumbPage: "المرضى",
    tableTitle: "دليل المرضى",
    statTotal: "إجمالي المرضى",
    statInsured: "مؤمَّن",
    statCash: "نقدي",
    modeSimulator: "محاكي نفيس",
    modeProduction: "نفيس (إنتاج)",
    searchPlaceholder: "ابحث برقم الهوية أو الإقامة أو رقم الملف أو الجوال...",
    searchLabel: "بحث في المرضى",
    allCoverage: "كل أنواع التغطية",
    coverageInsured: "مؤمَّن (نفيس)",
    coverageCash: "مرضى نقدي",
    nphiesStatus: "حالة نفيس",
    allStatuses: "كل الحالات",
    stEligible: "مؤهَّل",
    stPending: "قيد الانتظار",
    stExpired: "منتهي",
    stNoCoverage: "بدون تغطية",
    resetFilters: "إعادة ضبط التصفية",
    register: "تسجيل مريض جديد",

    colPatient: "رقم الملف واسم المريض",
    colId: "الهوية والضريبة",
    colMobile: "الجوال والبيانات",
    colInsurance: "التأمين ونفيس",
    colActions: "الإجراءات",
    sortBy: "ترتيب حسب",
    saudi: "سعودي",
    resident: "مقيم",
    vatPercent: "ضريبة {value}%",
    yrs: "سنة",
    male: "ذكر",
    female: "أنثى",
    copayPercent: "تحمّل {value}%",
    copayFixed: "تحمّل {value} ريال",
    copayCap: "بحد أقصى {value} ريال",
    cashPatient: "مريض نقدي",
    selfPay: "دفع ذاتي",
    expiredOn: "انتهت في {date}",

    verify: "فحص نفيس",
    verifying: "جارٍ الفحص…",
    addInsurance: "إضافة تأمين",
    bookVisit: "حجز زيارة",
    viewProfile: "عرض الملف",
    edit: "تعديل",

    showing: "عرض",
    of: "من",
    patients: "مريض",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
    page: "صفحة",
    empty: "لم يتم تسجيل أي مريض بعد.",
    emptyFiltered: "لا يوجد مرضى مطابقون للبحث أو التصفية.",
    loadFailed: "تعذر تحميل دليل المرضى.",
    retry: "إعادة المحاولة",
    refreshing: "جارٍ التحديث…",

    close: "إغلاق",
    cancel: "إلغاء",
    none: "—",
    failed: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
    selectPlaceholder: "اختر…",
    noOptions: "لا توجد خيارات",

    formRegisterTitle: "تسجيل مريض جديد",
    formEditTitle: "تعديل بيانات المريض",
    secPersonal: "البيانات الشخصية والضريبية",
    secInsurance: "التأمين وفحص نفيس المباشر",
    fldNameEn: "الاسم الكامل (إنجليزي)",
    fldNameAr: "الاسم الكامل (عربي)",
    fldIdType: "نوع الهوية",
    optNationalId: "هوية وطنية",
    optIqama: "إقامة (مقيم)",
    fldIdNumber: "رقم الهوية",
    fldNationality: "الجنسية",
    optSaudi: "المملكة العربية السعودية",
    optNonSaudi: "جنسية أخرى (مقيم)",
    vatExempt: "معفى من الضريبة - 0%",
    vatStandard: "ضريبة 15%",
    fldDob: "تاريخ الميلاد",
    fldGender: "الجنس",
    fldMobile: "رقم الجوال",
    fldInsured: "مؤمَّن (نفيس)",
    fldPayer: "شركة التأمين",
    fldPolicy: "خطة الوثيقة",
    fldMember: "رقم العضوية / البطاقة",
    selectPayer: "اختر شركة التأمين",
    selectPolicy: "اختر خطة الوثيقة",
    selectGender: "اختر الجنس",
    policyExpiredTag: "منتهية",
    noPolicies: "لا توجد خطط فعّالة لهذه الشركة",
    checkEligibility: "فحص أهلية نفيس",
    checking: "جارٍ فحص نفيس…",
    eligStatus: "الحالة",
    eligActive: "تغطية سارية",
    eligInactive: "الوثيقة غير فعالة / منتهية",
    eligPending: "قيد مراجعة شركة التأمين",
    eligError: "فشل فحص الأهلية",
    eligCopay: "نسبة التحمّل",
    eligPlan: "الخطة",
    eligRef: "مرجع نفيس",
    eligVerifiedNow: "تم التحقق الآن",
    eligCashFallback: "حصّل المبلغ نقدًا أو جدّد الوثيقة.",
    eligReuse: "تُحفظ هذه النتيجة مع المريض.",
    save: "حفظ ملف المريض",
    saving: "جارٍ الحفظ…",
    errNameEn: "أدخل الاسم الكامل بأحرف إنجليزية.",
    errNameAr: "أدخل الاسم الكامل بأحرف عربية.",
    errNationalId: "أدخل رقم هوية صحيحًا من 10 أرقام.",
    errIdMismatchSaudi: "الهوية الوطنية السعودية يجب أن تبدأ بالرقم 1.",
    errIdMismatchResident: "رقم الإقامة يجب أن يبدأ بالرقم 2.",
    errDob: "أدخل تاريخ ميلاد صحيحًا.",
    errGender: "اختر الجنس.",
    errPhone: "أدخل رقم جوال سعودي صحيحًا (05XXXXXXXX).",
    errPayer: "اختر شركة التأمين.",
    errPolicy: "اختر خطة الوثيقة.",
    errMember: "أدخل رقم عضوية / بطاقة صحيحًا.",

    bookTitle: "حجز زيارة",
    bookPatient: "المريض",
    bookClinic: "العيادة",
    bookChooseClinic: "اختر العيادة",
    bookDoctor: "الطبيب",
    bookChooseDoctor: "اختر الطبيب",
    bookDate: "التاريخ",
    bookSlots: "الأوقات المتاحة",
    bookPickDoctor: "اختر العيادة والطبيب أولاً.",
    bookNoSlots: "لا توجد أوقات متاحة في هذا التاريخ.",
    bookNoDoctors: "لا يوجد أطباء لديهم دوام نشط في هذه العيادة.",
    bookReason: "سبب الزيارة (اختياري)",
    bookConfirm: "حجز الموعد",
    booking: "جارٍ الحجز…",
    bookExpiredWarning: "وثيقة هذا المريض منتهية. حصّل المبلغ نقدًا أو جدّد الوثيقة قبل تقديم الخدمة.",
    bookCashNote: "مريض نقدي — يتم تحصيل المبلغ عند المكتب.",
    offDuty: "خارج الدوام",

    profileTitle: "ملف المريض",
    profileSubtitle: "السجل الإداري والتشغيلي",
    profileInfo: "البيانات",
    profileMobile: "الجوال",
    profileId: "الهوية",
    profileDob: "تاريخ الميلاد",
    profileMember: "رقم العضوية",
    profilePlan: "الخطة",
    profileRegistered: "تاريخ التسجيل",
    profileLastCheck: "آخر فحص نفيس",
    tabVisits: "الزيارات",
    tabInvoices: "فواتير زاتكا",
    tabNphies: "سجل نفيس",
    upcoming: "القادمة",
    past: "السابقة",
    noVisits: "لا توجد زيارات مسجلة.",
    noInvoices: "لا توجد فواتير صادرة.",
    noNphies: "لا توجد معاملات نفيس بعد.",
    invoiceB2c: "فاتورة مبسطة · B2C",
    invoiceB2b: "فاتورة ضريبية · B2B",
    invoiceInsurance: "فاتورة ضريبية B2B · تأمين",
    invoiceCredit: "إشعار دائن",
    invoiceDebit: "إشعار مدين",
    invoiceTotal: "الإجمالي",
    invoiceVat: "الضريبة",
    vatExemptShort: "معفاة من الضريبة",
    txEligibility: "فحص الأهلية",
    txPreAuth: "موافقة مسبقة",
    txClaim: "مطالبة",
    txPrescription: "وصفة إلكترونية",
    txPoll: "متابعة الحالة",
    preAuthRef: "رقم الموافقة",
    policyActive: "الوثيقة فعالة",
    policyInactive: "الوثيقة غير فعالة",
    latency: "زمن الاستجابة",

    visitStatus: {
        SCHEDULED: "مجدول",
        CONFIRMED: "مؤكد",
        WAITING: "في الانتظار",
        IN_PROGRESS: "في العيادة",
        COMPLETED: "مكتمل",
        CANCELLED: "ملغي",
        NO_SHOW: "لم يحضر",
    },
    zatcaStatus: {
        CLEARED: "معتمدة",
        REPORTED: "تم الإبلاغ",
        PENDING: "قيد الانتظار",
        REJECTED: "مرفوضة",
        NOT_SUBMITTED: "لم تُرسل",
    },
    txStatus: {
        COMPLETE: "مكتمل",
        QUEUED: "قيد المراجعة",
        PARTIAL: "جزئي",
        ERROR: "مرفوض",
    },

    toastCreated: "تم تسجيل المريض بنجاح.",
    toastUpdated: "تم تحديث ملف المريض.",
    toastBooked: "تم حجز الموعد بنجاح.",
    toastVerified: "تم التحقق من التغطية:",
    toastPending: "الأهلية قيد مراجعة شركة التأمين.",
    toastExpired: "الوثيقة غير فعالة — حصّل المبلغ نقدًا أو جدّد الوثيقة عبر التعديل.",
    toastEligError: "تعذّر إتمام فحص الأهلية عبر نفيس.",

    errors: {
        UNAUTHORIZED: "انتهت جلستك. سجّل الدخول وحاول مرة أخرى.",
        DUPLICATE_NATIONAL_ID: "يوجد مريض مسجّل بنفس رقم الهوية.",
        RECORD_NOT_FOUND: "تعذّر العثور على السجل. حدّث الصفحة وحاول مرة أخرى.",
        NO_COVERAGE: "هذا مريض نقدي. لا توجد تغطية تأمينية للتحقق منها.",
        PROVIDER_INACTIVE: "شركة التأمين غير نشطة.",
        MISSING_MEMBER_ID: "رقم عضوية التأمين غير متوفر.",
        NPHIES_CONFIGURATION: "نفيس غير مُهيّأ لهذا المركز. تواصل مع المسؤول.",
        SLOT_TAKEN: "تم حجز هذا الوقت للتو. اختر وقتًا آخر.",
        SLOT_UNAVAILABLE: "الوقت المختار لم يعد متاحًا.",
        PATIENT_BUSY: "لدى هذا المريض موعد في نفس الوقت.",
        NO_CLINIC: "لا توجد عيادة نشطة لهذا المركز.",
        POLICY_EXPIRED: "الوثيقة المختارة منتهية أو غير نشطة. اختر وثيقة فعّالة.",
        DATABASE_ERROR: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
    },
};

const messages = { en, ar } as const;
type Messages = typeof en;

function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function errorText(t: Messages, code: string | undefined, fallback: string | undefined): string {
    if (code !== undefined && Object.prototype.hasOwnProperty.call(t.errors, code)) {
        return t.errors[code] ?? t.failed;
    }

    return fallback ?? t.failed;
}

/* ========================================================================== */
/* Styles                                                                     */
/* ========================================================================== */

const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const invalidInput = "!border-rose-500 focus:!border-rose-500 focus:!ring-rose-500/20";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-150 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const cardSurface =
    "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60";

const selectTriggerClass =
    "flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-start text-sm text-slate-900 outline-none transition-colors duration-150 hover:border-teal-500/60 focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";

const selectTriggerOpenClass = "!border-teal-500 ring-2 ring-teal-500/20";

const selectPanelClass =
    "fixed z-[200] overflow-y-auto rounded-xl border border-teal-500 bg-white p-1.5 text-sm shadow-2xl shadow-black/40 dark:bg-slate-950";

const selectOptionClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-slate-800 transition-colors duration-150 dark:text-slate-200";

const selectOptionSelectedClass = "bg-teal-500/15 font-semibold text-teal-700 dark:text-teal-300";
const selectOptionActiveClass = "bg-teal-500/10";

const backdropMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeOut" },
} as const;

const panelMotion = {
    initial: { opacity: 0, scale: 0.96, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: 10 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
} as const;

/* ========================================================================== */
/* Formatters & pure helpers                                                  */
/* ========================================================================== */

function intlTag(locale: Locale): string {
    return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US";
}

function fmtDateTime(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function fmtDate(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            day: "numeric",
            month: "short",
            year: "numeric",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function fmtTime(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

function fmtMoney(value: number, locale: Locale): string {
    try {
        return new Intl.NumberFormat(intlTag(locale), {
            style: "currency",
            currency: "SAR",
            minimumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${value.toFixed(2)} SAR`;
    }
}

function fmtNumber(value: number, locale: Locale): string {
    return new Intl.NumberFormat(intlTag(locale)).format(value);
}

function formatPhone(phone: string | null): string {
    if (phone === null || phone === "") return "—";

    const match = /^\+966(5\d)(\d{3})(\d{4})$/.exec(phone);

    return match ? `+966 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

function toLatinDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (char) => String(char.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (char) => String(char.charCodeAt(0) - 0x06f0));
}

function normalizeSaudiMobile(raw: string): string | null {
    let digits = toLatinDigits(raw).replace(/[\s\-().+]/g, "");

    if (!/^\d+$/.test(digits)) return null;

    if (digits.startsWith("00966")) digits = digits.slice(5);
    else if (digits.startsWith("966")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);

    return /^5\d{8}$/.test(digits) ? `+966${digits}` : null;
}

function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? "?";
    const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";

    return `${first}${second}`.toUpperCase();
}

function avatarColor(id: string): string {
    let hash = 0;

    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;

    return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

function displayDoctor(name: string, locale: Locale): string {
    if (/^(dr\.?|د\.?)\s/i.test(name)) return name;

    return locale === "ar" ? `د. ${name}` : `Dr. ${name}`;
}

function pageWindow(current: number, total: number): Array<number | "gap-start" | "gap-end"> {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

    const pages: Array<number | "gap-start" | "gap-end"> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) pages.push("gap-start");
    for (let page = start; page <= end; page++) pages.push(page);
    if (end < total - 1) pages.push("gap-end");

    pages.push(total);

    return pages;
}

function copayLabel(copay: PatientCopay, t: Messages): string {
    const base =
        copay.kind === "PERCENT"
            ? fill(t.copayPercent, { value: copay.value })
            : fill(t.copayFixed, { value: copay.value });

    return base;
}

/* ------------------------- in-memory directory logic ------------------------- */

interface SearchableRow {
    row: PatientRow;
    en: string;
    ar: string;
    file: string;
    nid: string;
    phone: string;
}

/** Precomputed, lower-cased search haystacks (built once per data load, not per keystroke). */
function toSearchable(row: PatientRow): SearchableRow {
    return {
        row,
        en: row.fullNameEn.toLowerCase(),
        ar: row.fullNameAr,
        file: row.fileNumber.toLowerCase(),
        nid: row.nationalIdSearch,
        phone: (row.phone ?? "").replace(/\D/g, ""),
    };
}

/** Phone-number variants for a numeric term (05…, 5…, 966…, 00966…), mirroring the old server search. */
function phoneSearchTerms(term: string): string[] {
    const latin = toLatinDigits(term).replace(/[\s\-().+]/g, "");

    if (!/^\d{3,}$/.test(latin)) return [];

    const variants = new Set<string>([latin]);

    if (latin.startsWith("00966")) variants.add(latin.slice(5));
    if (latin.startsWith("966")) variants.add(latin.slice(3));
    if (latin.startsWith("0")) variants.add(latin.slice(1));

    return [...variants].filter((variant) => variant.length >= 3);
}

interface PreparedSearch {
    term: string;
    lower: string;
    latin: string;
    phones: string[];
}

function prepareSearch(raw: string): PreparedSearch {
    const term = raw.trim().slice(0, SEARCH_MAX_LENGTH);

    return {
        term,
        lower: term.toLowerCase(),
        latin: toLatinDigits(term).toLowerCase(),
        phones: phoneSearchTerms(term),
    };
}

function matchesSearch(item: SearchableRow, search: PreparedSearch): boolean {
    if (item.en.includes(search.lower)) return true;
    if (item.ar.includes(search.term)) return true;
    if (item.file.includes(search.latin)) return true;
    if (item.nid.includes(search.latin)) return true;

    return search.phones.some((variant) => item.phone.includes(variant));
}

function compareRows(a: PatientRow, b: PatientRow, sort: PatientSortKey, dir: PatientSortDir): number {
    const sign = dir === "asc" ? 1 : -1;
    let result = 0;

    if (sort === "nationalId") {
        result = a.nationalIdSearch.localeCompare(b.nationalIdSearch);
    } else if (sort === "insurance") {
        const left = a.payerNameEn;
        const right = b.payerNameEn;

        // Same ordering as the database: NULLs last when ascending, first when descending.
        if (left === null && right !== null) return sign;
        if (left !== null && right === null) return -sign;
        if (left !== null && right !== null) result = left.localeCompare(right, "en");
    } else {
        result = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    }

    if (result !== 0) return result * sign;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function computeStats(rows: PatientRow[]): PatientDirectoryStats {
    const total = rows.length;
    const insured = rows.filter((row) => row.insured).length;
    const insuredPercent = total > 0 ? Math.round((insured / total) * 100) : 0;

    return {
        total,
        insured,
        cash: total - insured,
        insuredPercent,
        cashPercent: total > 0 ? 100 - insuredPercent : 0,
    };
}

/* ========================================================================== */
/* SelectBox (custom dropdown)                                                */
/* ========================================================================== */

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectPlacement {
    left: number;
    width: number;
    top: number | null;
    bottom: number | null;
    maxHeight: number;
}

const SELECT_MAX_HEIGHT = 288;
const SELECT_GAP = 6;
const SELECT_MARGIN = 8;

type IconComponent = ComponentType<{ className?: string }>;

/**
 * Accessible custom select: dark slate-950 panel with a teal-500 border, rounded corners, hover /
 * keyboard highlight, a teal highlight + ✓ on the selected option, scrollable overflow, flips above
 * the trigger when there is no room below, portalled to <body> so modals never clip it, and fully
 * RTL / LTR aware.
 */
function SelectBox({
    id,
    value,
    onChange,
    options,
    placeholder = "",
    disabled = false,
    ariaLabel,
    isRtl,
    icon: Icon,
    className = "",
    invalidState = false,
    emptyLabel = "",
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    isRtl: boolean;
    icon?: IconComponent;
    className?: string;
    invalidState?: boolean;
    emptyLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [placement, setPlacement] = useState<SelectPlacement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const listId = useId();

    const selected = options.find((option) => option.value === value);

    const computePlacement = useCallback(() => {
        const trigger = triggerRef.current;

        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - SELECT_MARGIN;
        const above = rect.top - SELECT_MARGIN;
        const flip = below < 200 && above > below;
        const room = (flip ? above : below) - SELECT_GAP;

        setPlacement({
            left: rect.left,
            width: rect.width,
            top: flip ? null : rect.bottom + SELECT_GAP,
            bottom: flip ? window.innerHeight - rect.top + SELECT_GAP : null,
            maxHeight: Math.max(120, Math.min(SELECT_MAX_HEIGHT, room)),
        });
    }, []);

    const firstEnabled = useCallback(
        (from: number, step: 1 | -1): number => {
            if (options.length === 0) return -1;

            let index = from;

            for (let guard = 0; guard < options.length; guard++) {
                index = (index + step + options.length) % options.length;

                if (!options[index]?.disabled) return index;
            }

            return -1;
        },
        [options],
    );

    const openPanel = useCallback(() => {
        if (disabled) return;

        computePlacement();

        const selectedIndex = options.findIndex((option) => option.value === value);

        setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled(-1, 1));
        setOpen(true);
    }, [computePlacement, disabled, firstEnabled, options, value]);

    const closePanel = useCallback(() => setOpen(false), []);

    const choose = useCallback(
        (index: number) => {
            const option = options[index];

            if (!option || option.disabled) return;

            onChange(option.value);
            setOpen(false);
            triggerRef.current?.focus();
        },
        [onChange, options],
    );

    useLayoutEffect(() => {
        if (!open) return;

        computePlacement();

        const reposition = () => computePlacement();

        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);

        return () => {
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [open, computePlacement]);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;

            if (target && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) return;

            setOpen(false);
        };

        document.addEventListener("mousedown", onPointerDown);

        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open]);

    useEffect(() => {
        if (!open || active < 0) return;

        document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
    }, [open, active, listId]);

    useEffect(() => {
        if (disabled && open) setOpen(false);
    }, [disabled, open]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                if (!open) openPanel();
                else setActive((current) => firstEnabled(current, 1));
                break;
            case "ArrowUp":
                event.preventDefault();
                if (!open) openPanel();
                else setActive((current) => firstEnabled(current, -1));
                break;
            case "Home":
                if (open) {
                    event.preventDefault();
                    setActive(firstEnabled(-1, 1));
                }
                break;
            case "End":
                if (open) {
                    event.preventDefault();
                    setActive(firstEnabled(0, -1));
                }
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (!open) openPanel();
                else choose(active);
                break;
            case "Escape":
                if (open) {
                    event.preventDefault();
                    event.stopPropagation();
                    closePanel();
                }
                break;
            case "Tab":
                if (open) closePanel();
                break;
            default:
                break;
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
                disabled={disabled}
                onClick={() => (open ? closePanel() : openPanel())}
                onKeyDown={onKeyDown}
                className={`${selectTriggerClass} ${open ? selectTriggerOpenClass : ""} ${invalidState ? "!border-rose-500" : ""} ${className}`}
            >
                {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />}
                <span
                    className={`min-w-0 flex-1 truncate ${selected ? "" : "text-slate-500 dark:text-slate-400"}`}
                >
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 dark:text-slate-400 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open &&
                placement &&
                createPortal(
                    <div
                        ref={panelRef}
                        id={listId}
                        role="listbox"
                        dir={isRtl ? "rtl" : "ltr"}
                        className={selectPanelClass}
                        style={{
                            left: placement.left,
                            width: placement.width,
                            maxHeight: placement.maxHeight,
                            ...(placement.top !== null ? { top: placement.top } : {}),
                            ...(placement.bottom !== null ? { bottom: placement.bottom } : {}),
                        }}
                    >
                        {options.length === 0 && (
                            <div className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{emptyLabel}</div>
                        )}
                        {options.map((option, index) => {
                            const isSelected = option.value === value;

                            return (
                                <button
                                    key={option.value}
                                    id={`${listId}-${index}`}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    aria-disabled={option.disabled}
                                    tabIndex={-1}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() => !option.disabled && setActive(index)}
                                    onClick={() => choose(index)}
                                    className={`${selectOptionClass} ${isSelected ? selectOptionSelectedClass : ""} ${!isSelected && active === index ? selectOptionActiveClass : ""} ${option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
                                >
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {isSelected && (
                                        <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-300" aria-hidden />
                                    )}
                                </button>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </>
    );
}

/* ========================================================================== */
/* Small UI building blocks                                                   */
/* ========================================================================== */

function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

function StatSkeleton() {
    return <Skeleton className="h-11 w-40 rounded-full" />;
}

function RowSkeleton() {
    return (
        <tr className="border-t border-slate-200 dark:border-slate-800">
            <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3.5 w-24" />
                    </div>
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-28 rounded-md" />
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3.5 w-24" />
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-32 rounded-full" />
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-28 rounded-lg" />
                </div>
            </td>
        </tr>
    );
}

function Avatar({ row, size = "md" }: { row: Pick<PatientRow, "id" | "fullNameEn">; size?: "md" | "lg" }) {
    return (
        <span
            aria-hidden
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColor(row.id)} ${size === "lg" ? "h-14 w-14 text-lg" : "h-12 w-12 text-sm"}`}
        >
            {initialsOf(row.fullNameEn)}
        </span>
    );
}

function NphiesBadge({ state, t }: { state: NphiesPatientState; t: Messages }) {
    const config: Record<NphiesPatientState, { label: string; cls: string; dot: string }> = {
        ELIGIBLE: {
            label: t.stEligible,
            cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            dot: "bg-emerald-500",
        },
        PENDING: {
            label: t.stPending,
            cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            dot: "bg-amber-500",
        },
        EXPIRED: {
            label: t.stExpired,
            cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
            dot: "bg-orange-500",
        },
        NO_COVERAGE: {
            label: t.stNoCoverage,
            cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
            dot: "bg-slate-400",
        },
    };
    const item = config[state];

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
            {item.label}
        </span>
    );
}

function VatBadge({ row, t }: { row: Pick<PatientRow, "residency" | "vatRate">; t: Messages }) {
    const saudi = row.residency === "SAUDI";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${saudi
                ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
                : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                }`}
        >
            {!saudi && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
            {saudi ? t.saudi : t.resident}
            <span aria-hidden>•</span>
            {fill(t.vatPercent, { value: row.vatRate })}
        </span>
    );
}

function genderLabel(gender: Gender | null, t: Messages): string {
    return gender === "MALE" ? t.male : gender === "FEMALE" ? t.female : t.none;
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
    return (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {children}
        </label>
    );
}

function FieldError({ message }: { message?: string | undefined }) {
    if (!message) return null;

    return (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
            {message}
        </p>
    );
}

/* ========================================================================== */
/* ModalShell                                                                 */
/* ========================================================================== */

function ModalShell({
    title,
    titleId,
    onClose,
    children,
    footer,
    isRtl,
    closeLabel,
    maxWidth = "max-w-5xl",
}: {
    title: string;
    titleId: string;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
    isRtl: boolean;
    closeLabel: string;
    maxWidth?: string;
}) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKey);

        const previous = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    return createPortal(
        <motion.div
            {...backdropMotion}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 -sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.div
                {...panelMotion}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                className={`flex max-h-[94vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl shadow-black/50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100`}
            >
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                    <h2 id={titleId} className="text-2xl font-bold tracking-tight">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={closeLabel}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
                    {footer}
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
}

/* ========================================================================== */
/* Patient form modal (Register / Edit)                                       */
/* ========================================================================== */

interface FormState {
    fullNameEn: string;
    fullNameAr: string;
    identityType: IdentityType;
    nationalId: string;
    dateOfBirth: string;
    gender: Gender | "";
    phone: string;
    insured: boolean;
    payerId: string;
    policyId: string;
    memberId: string;
}

type FormErrors = Partial<Record<PatientFormField, string>>;

const EMPTY_FORM: FormState = {
    fullNameEn: "",
    fullNameAr: "",
    identityType: "NATIONAL_ID",
    nationalId: "",
    dateOfBirth: "",
    gender: "",
    phone: "",
    insured: false,
    payerId: "",
    policyId: "",
    memberId: "",
};

const ELIGIBILITY_FIELDS: ReadonlyArray<keyof FormState> = [
    "nationalId",
    "identityType",
    "payerId",
    "policyId",
    "memberId",
];

function validateForm(form: FormState, t: Messages, today: string, mode: "full" | "eligibility"): FormErrors {
    const errors: FormErrors = {};
    const nationalId = toLatinDigits(form.nationalId.trim());

    if (mode === "full") {
        if (!/^[A-Za-z][A-Za-z\s'.-]{1,99}$/.test(form.fullNameEn.trim())) errors.fullNameEn = t.errNameEn;
        if (!/^[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\s'.-]{1,99}$/.test(form.fullNameAr.trim())) {
            errors.fullNameAr = t.errNameAr;
        }
    }

    if (!/^[12]\d{9}$/.test(nationalId)) errors.nationalId = t.errNationalId;
    else if (form.identityType === "NATIONAL_ID" && !nationalId.startsWith("1")) errors.nationalId = t.errIdMismatchSaudi;
    else if (form.identityType === "IQAMA" && !nationalId.startsWith("2")) errors.nationalId = t.errIdMismatchResident;

    if (mode === "full") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) || form.dateOfBirth > today || form.dateOfBirth < "1900-01-01") {
            errors.dateOfBirth = t.errDob;
        }

        if (form.gender === "") errors.gender = t.errGender;
        if (normalizeSaudiMobile(form.phone) === null) errors.phone = t.errPhone;
    }

    if (form.insured || mode === "eligibility") {
        if (form.payerId === "") errors.payerId = t.errPayer;
        if (form.memberId.trim().length < 3) errors.memberId = t.errMember;
    }

    return errors;
}

function EligibilityBox({ data, t, locale }: { data: EligibilityCheckData; t: Messages; locale: Locale }) {
    const isAr = locale === "ar";
    const message = isAr ? data.messageAr : data.messageEn;

    const tone =
        data.state === "ELIGIBLE"
            ? {
                box: "border-teal-500 bg-teal-500/10 shadow-[0_0_24px_-8px_rgba(20,184,166,0.55)]",
                icon: "bg-teal-500 text-white",
                title: t.eligActive,
            }
            : data.state === "PENDING"
                ? { box: "border-amber-500 bg-amber-500/10", icon: "bg-amber-500 text-white", title: t.eligPending }
                : data.state === "EXPIRED"
                    ? { box: "border-orange-500 bg-orange-500/10", icon: "bg-orange-500 text-white", title: t.eligInactive }
                    : { box: "border-rose-500 bg-rose-500/10", icon: "bg-rose-500 text-white", title: t.eligError };

    const statusLabel =
        data.state === "ELIGIBLE" ? t.stEligible : data.state === "PENDING" ? t.stPending : data.state === "EXPIRED" ? t.stExpired : t.eligError;

    return (
        <div className="space-y-2">
            <div className={`rounded-xl border p-4 ${tone.box}`} role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
                        {data.state === "ELIGIBLE" ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t.eligStatus}: {statusLabel}
                        <span aria-hidden className="mx-2">•</span>
                        {tone.title}
                    </p>
                </div>

                <dl className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    {data.copay !== null && data.state === "ELIGIBLE" && (
                        <div className="flex flex-wrap gap-x-2">
                            <dt className="text-slate-500 dark:text-slate-400">{t.eligCopay}:</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">
                                {data.copay.kind === "PERCENT" ? `${data.copay.value}%` : `${data.copay.value} SAR`}
                                {data.copay.cap !== null && ` (${fill(t.copayCap, { value: data.copay.cap })})`}
                            </dd>
                        </div>
                    )}
                    {data.planName !== null && (
                        <div className="flex flex-wrap gap-x-2">
                            <dt className="text-slate-500 dark:text-slate-400">{t.eligPlan}:</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">
                                {(isAr ? data.payerNameAr : data.payerNameEn) ?? ""} · {data.planName}
                            </dd>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-500 dark:text-slate-400">{t.eligRef}:</dt>
                        <dd dir="ltr" className="font-medium text-slate-900 dark:text-white">
                            #{data.referenceNumber}
                        </dd>
                    </div>
                    {message !== null && data.state !== "ELIGIBLE" && (
                        <p className="pt-1 text-slate-700 dark:text-slate-300">{message}</p>
                    )}
                    {data.state === "EXPIRED" && (
                        <p className="pt-1 font-medium text-orange-700 dark:text-orange-300">{t.eligCashFallback}</p>
                    )}
                </dl>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-teal-700 dark:text-teal-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t.eligVerifiedNow} · {data.mode === "SIMULATOR" ? t.modeSimulator : t.modeProduction} · {data.latencyMs}ms
            </p>
        </div>
    );
}

function PatientFormModal({
    locale,
    t,
    patientId,
    startInsured,
    options,
    optionsLoading,
    onClose,
    onSaved,
}: {
    locale: Locale;
    t: Messages;
    patientId: string | null;
    startInsured: boolean;
    options: PatientFormOptions | null;
    optionsLoading: boolean;
    onClose: () => void;
    onSaved: (row: PatientRow, mode: "create" | "update") => void;
}) {
    const isRtl = locale === "ar";
    const isEdit = patientId !== null;
    const titleId = useId();

    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, insured: startInsured });
    const [initialPolicyId, setInitialPolicyId] = useState("");
    const [loadingValues, setLoadingValues] = useState(isEdit);
    const [errors, setErrors] = useState<FormErrors>({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [checking, setChecking] = useState(false);
    const [eligibility, setEligibility] = useState<EligibilityCheckData | null>(null);
    const [checkError, setCheckError] = useState("");

    const today = options?.today ?? new Date().toISOString().slice(0, 10);

    /* Load the patient's existing values when editing. */
    useEffect(() => {
        if (patientId === null) return;

        let cancelled = false;

        void (async () => {
            const result = await getPatientForEditAction(patientId);

            if (cancelled) return;

            if (result.success && result.data) {
                const data = result.data;

                setForm({
                    fullNameEn: data.fullNameEn,
                    fullNameAr: data.fullNameAr,
                    identityType: data.identityType,
                    nationalId: data.nationalId,
                    dateOfBirth: data.dateOfBirth,
                    gender: data.gender,
                    phone: data.phone,
                    insured: data.insured || startInsured,
                    payerId: data.payerId,
                    policyId: data.policyId,
                    memberId: data.memberId,
                });
                setInitialPolicyId(data.policyId);
            } else {
                setFormError(errorText(t, result.code, result.error));
            }

            setLoadingValues(false);
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId, startInsured]);

    const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => {
            if (current[key as PatientFormField] === undefined) return current;

            const next = { ...current };

            delete next[key as PatientFormField];

            return next;
        });

        if (ELIGIBILITY_FIELDS.includes(key)) {
            setEligibility(null);
            setCheckError("");
        }
    }, []);

    const payer = useMemo(
        () => options?.payers.find((item) => item.id === form.payerId) ?? null,
        [options, form.payerId],
    );

    const payerOptions: SelectOption[] = useMemo(
        () =>
            (options?.payers ?? []).map((item) => ({
                value: item.id,
                label: locale === "ar" ? item.nameAr : item.nameEn,
            })),
        [options, locale],
    );

    const policyOptions: SelectOption[] = useMemo(
        () =>
            (payer?.policies ?? []).map((policy) => {
                const name = locale === "ar" ? (policy.nameAr ?? policy.nameEn) : policy.nameEn;

                return {
                    value: policy.id,
                    label: policy.expired ? `${name} · ${t.policyExpiredTag}` : name,
                    disabled: policy.expired && policy.id !== initialPolicyId,
                };
            }),
        [payer, locale, t.policyExpiredTag, initialPolicyId],
    );

    const nationalityValue = form.identityType === "NATIONAL_ID" ? "SA" : "OTHER";
    const saudi = form.identityType === "NATIONAL_ID";

    const onPayerChange = (value: string) => {
        update("payerId", value);

        const next = options?.payers.find((item) => item.id === value);
        const valid = (next?.policies ?? []).filter((policy) => !policy.expired);

        update("policyId", valid.length === 1 ? (valid[0]?.id ?? "") : "");
    };

    const onIdentityChange = (value: IdentityType) => {
        update("identityType", value);
    };

    const runCheck = async () => {
        const found = validateForm(form, t, today, "eligibility");

        if (Object.keys(found).length > 0) {
            setErrors((current) => ({ ...current, ...found }));

            return;
        }

        setChecking(true);
        setCheckError("");
        setEligibility(null);

        const result = await checkDraftEligibilityAction({
            identityType: form.identityType,
            nationalId: toLatinDigits(form.nationalId.trim()),
            fullNameEn: form.fullNameEn,
            fullNameAr: form.fullNameAr,
            dateOfBirth: form.dateOfBirth,
            gender: form.gender,
            phone: form.phone,
            payerId: form.payerId,
            policyId: form.policyId,
            memberId: form.memberId.trim(),
        });

        setChecking(false);

        if (result.success && result.data) {
            setEligibility(result.data);
        } else {
            if (result.field !== undefined) {
                setErrors((current) => ({ ...current, [result.field as PatientFormField]: errorText(t, result.code, result.error) }));
            } else {
                setCheckError(errorText(t, result.code, result.error));
            }
        }
    };

    const submit = async () => {
        setFormError("");

        const found = validateForm(form, t, today, "full");

        if (form.insured && policyOptions.length > 0 && form.policyId === "") found.policyId = t.errPolicy;

        if (Object.keys(found).length > 0) {
            setErrors(found);

            return;
        }

        setSaving(true);

        const input: PatientFormInput = {
            ...(patientId !== null ? { id: patientId } : {}),
            fullNameEn: form.fullNameEn,
            fullNameAr: form.fullNameAr,
            identityType: form.identityType,
            nationalId: toLatinDigits(form.nationalId.trim()),
            dateOfBirth: form.dateOfBirth,
            gender: form.gender,
            phone: form.phone,
            insured: form.insured,
            payerId: form.insured ? form.payerId : "",
            policyId: form.insured ? form.policyId : "",
            memberId: form.insured ? form.memberId.trim() : "",
            eligibilityReference:
                form.insured && eligibility !== null && eligibility.state !== "ERROR"
                    ? eligibility.referenceNumber
                    : null,
        };

        const result = isEdit ? await updatePatientAction(input) : await createPatientAction(input);

        setSaving(false);

        if (result.success && result.data) {
            onSaved(result.data.row, isEdit ? "update" : "create");

            return;
        }

        const message = errorText(t, result.code, result.error);

        if (result.field !== undefined) setErrors({ [result.field]: message });
        else setFormError(message);
    };

    const insuranceDisabled = !form.insured;
    const busy = saving || loadingValues;

    return (
        <ModalShell
            title={isEdit ? t.formEditTitle : t.formRegisterTitle}
            titleId={titleId}
            onClose={onClose}
            isRtl={isRtl}
            closeLabel={t.close}
            footer={
                <>
                    {formError !== "" && (
                        <p role="alert" className="me-auto flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                            <CircleAlert className="h-4 w-4 shrink-0" />
                            {formError}
                        </p>
                    )}
                    <button type="button" onClick={onClose} className={`${outlineButton} h-11`}>
                        {t.cancel}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={busy} className={`${tealButton} h-11 px-6`}>
                        {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {saving ? t.saving : t.save}
                    </button>
                </>
            }
        >
            <div className="grid gap-8 lg:grid-cols-2">
                {/* ------------------------- Personal & ZATCA ------------------------- */}
                <section aria-labelledby={`${titleId}-personal`} className="space-y-5">
                    <h3 id={`${titleId}-personal`} className="text-base font-semibold text-slate-900 dark:text-white">
                        {t.secPersonal}
                    </h3>

                    {loadingValues ? (
                        <div className="space-y-5">
                            {Array.from({ length: 8 }, (_, index) => (
                                <div key={index} className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-11 w-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <div>
                                <FieldLabel htmlFor={`${titleId}-nameEn`}>{t.fldNameEn}</FieldLabel>
                                <input
                                    id={`${titleId}-nameEn`}
                                    dir="ltr"
                                    value={form.fullNameEn}
                                    onChange={(event) => update("fullNameEn", event.target.value)}
                                    autoComplete="off"
                                    className={`${baseInput} ${errors.fullNameEn ? invalidInput : ""} ${isRtl ? "text-end" : ""}`}
                                />
                                <FieldError message={errors.fullNameEn} />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-nameAr`}>{t.fldNameAr}</FieldLabel>
                                <input
                                    id={`${titleId}-nameAr`}
                                    dir="rtl"
                                    lang="ar"
                                    value={form.fullNameAr}
                                    onChange={(event) => update("fullNameAr", event.target.value)}
                                    autoComplete="off"
                                    className={`${baseInput} ${errors.fullNameAr ? invalidInput : ""}`}
                                />
                                <FieldError message={errors.fullNameAr} />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-idType`}>{t.fldIdType}</FieldLabel>
                                <SelectBox
                                    id={`${titleId}-idType`}
                                    value={form.identityType}
                                    onChange={(value) => onIdentityChange(value === "IQAMA" ? "IQAMA" : "NATIONAL_ID")}
                                    options={[
                                        { value: "NATIONAL_ID", label: t.optNationalId },
                                        { value: "IQAMA", label: t.optIqama },
                                    ]}
                                    isRtl={isRtl}
                                    ariaLabel={t.fldIdType}
                                />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-idNumber`}>{t.fldIdNumber}</FieldLabel>
                                <input
                                    id={`${titleId}-idNumber`}
                                    dir="ltr"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={form.nationalId}
                                    onChange={(event) => update("nationalId", toLatinDigits(event.target.value).replace(/\D/g, ""))}
                                    autoComplete="off"
                                    className={`${baseInput} ${errors.nationalId ? invalidInput : ""} ${isRtl ? "text-end" : ""}`}
                                />
                                <FieldError message={errors.nationalId} />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-nationality`}>{t.fldNationality}</FieldLabel>
                                <div className="flex items-stretch gap-2">
                                    <div className="min-w-0 flex-1">
                                        <SelectBox
                                            id={`${titleId}-nationality`}
                                            value={nationalityValue}
                                            onChange={(value) => onIdentityChange(value === "SA" ? "NATIONAL_ID" : "IQAMA")}
                                            options={[
                                                { value: "SA", label: t.optSaudi },
                                                { value: "OTHER", label: t.optNonSaudi },
                                            ]}
                                            isRtl={isRtl}
                                            ariaLabel={t.fldNationality}
                                        />
                                    </div>
                                    <span
                                        className={`inline-flex shrink-0 items-center rounded-lg px-3 text-xs font-semibold ${saudi
                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                            : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                                            }`}
                                    >
                                        {saudi ? t.vatExempt : t.vatStandard}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-dob`}>{t.fldDob}</FieldLabel>
                                <input
                                    id={`${titleId}-dob`}
                                    type="date"
                                    dir="ltr"
                                    min="1900-01-01"
                                    max={today}
                                    value={form.dateOfBirth}
                                    onChange={(event) => update("dateOfBirth", event.target.value)}
                                    className={`${baseInput} dark:[color-scheme:dark] ${errors.dateOfBirth ? invalidInput : ""} ${isRtl ? "text-end" : ""}`}
                                />
                                <FieldError message={errors.dateOfBirth} />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-gender`}>{t.fldGender}</FieldLabel>
                                <SelectBox
                                    id={`${titleId}-gender`}
                                    value={form.gender}
                                    onChange={(value) => update("gender", value === "MALE" || value === "FEMALE" ? value : "")}
                                    options={[
                                        { value: "MALE", label: t.male },
                                        { value: "FEMALE", label: t.female },
                                    ]}
                                    placeholder={t.selectGender}
                                    isRtl={isRtl}
                                    ariaLabel={t.fldGender}
                                    invalidState={errors.gender !== undefined}
                                />
                                <FieldError message={errors.gender} />
                            </div>

                            <div>
                                <FieldLabel htmlFor={`${titleId}-phone`}>{t.fldMobile}</FieldLabel>
                                <input
                                    id={`${titleId}-phone`}
                                    dir="ltr"
                                    inputMode="tel"
                                    placeholder="+966 5X XXX XXXX"
                                    value={form.phone}
                                    onChange={(event) => update("phone", event.target.value)}
                                    onBlur={() => {
                                        const normalized = normalizeSaudiMobile(form.phone);

                                        if (normalized !== null) update("phone", formatPhone(normalized));
                                    }}
                                    autoComplete="off"
                                    className={`${baseInput} ${errors.phone ? invalidInput : ""} ${isRtl ? "text-end" : ""}`}
                                />
                                <FieldError message={errors.phone} />
                            </div>
                        </>
                    )}
                </section>

                {/* ------------------------- Insurance & NPHIES ------------------------- */}
                <section aria-labelledby={`${titleId}-insurance`} className="space-y-5">
                    <h3 id={`${titleId}-insurance`} className="text-base font-semibold text-slate-900 dark:text-white">
                        {t.secInsurance}
                    </h3>

                    <div className="flex items-center justify-between gap-4">
                        <span id={`${titleId}-insured`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t.fldInsured}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={form.insured}
                            aria-labelledby={`${titleId}-insured`}
                            disabled={loadingValues}
                            onClick={() => {
                                update("insured", !form.insured);
                                setEligibility(null);
                                setCheckError("");
                            }}
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${form.insured ? "bg-teal-500" : "bg-slate-300 dark:bg-slate-700"}`}
                        >
                            <span
                                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${form.insured
                                    ? isRtl
                                        ? "-translate-x-6"
                                        : "translate-x-6"
                                    : isRtl
                                        ? "-translate-x-1"
                                        : "translate-x-1"
                                    }`}
                            />
                        </button>
                    </div>

                    <div className={insuranceDisabled ? "space-y-5 opacity-50" : "space-y-5"}>
                        <div>
                            <FieldLabel htmlFor={`${titleId}-payer`}>{t.fldPayer}</FieldLabel>
                            {optionsLoading && options === null ? (
                                <Skeleton className="h-11 w-full rounded-lg" />
                            ) : (
                                <SelectBox
                                    id={`${titleId}-payer`}
                                    value={form.payerId}
                                    onChange={onPayerChange}
                                    options={payerOptions}
                                    placeholder={t.selectPayer}
                                    disabled={insuranceDisabled}
                                    isRtl={isRtl}
                                    ariaLabel={t.fldPayer}
                                    invalidState={errors.payerId !== undefined}
                                    emptyLabel={t.noOptions}
                                />
                            )}
                            <FieldError message={errors.payerId} />
                        </div>

                        <div>
                            <FieldLabel htmlFor={`${titleId}-policy`}>{t.fldPolicy}</FieldLabel>
                            {optionsLoading && options === null ? (
                                <Skeleton className="h-11 w-full rounded-lg" />
                            ) : (
                                <SelectBox
                                    id={`${titleId}-policy`}
                                    value={form.policyId}
                                    onChange={(value) => update("policyId", value)}
                                    options={policyOptions}
                                    placeholder={form.payerId === "" ? t.selectPayer : t.selectPolicy}
                                    disabled={insuranceDisabled || form.payerId === ""}
                                    isRtl={isRtl}
                                    ariaLabel={t.fldPolicy}
                                    invalidState={errors.policyId !== undefined}
                                    emptyLabel={t.noPolicies}
                                />
                            )}
                            <FieldError message={errors.policyId} />
                        </div>

                        <div>
                            <FieldLabel htmlFor={`${titleId}-member`}>{t.fldMember}</FieldLabel>
                            <input
                                id={`${titleId}-member`}
                                dir="ltr"
                                value={form.memberId}
                                maxLength={40}
                                disabled={insuranceDisabled}
                                onChange={(event) => update("memberId", event.target.value)}
                                autoComplete="off"
                                className={`${baseInput} ${errors.memberId ? invalidInput : ""} ${isRtl ? "text-end" : ""}`}
                            />
                            <FieldError message={errors.memberId} />
                        </div>

                        <button
                            type="button"
                            onClick={() => void runCheck()}
                            disabled={insuranceDisabled || checking || loadingValues}
                            className={`${tealButton} h-12 w-full text-base`}
                        >
                            {checking ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                            {checking ? t.checking : t.checkEligibility}
                        </button>

                        {eligibility !== null && <EligibilityBox data={eligibility} t={t} locale={locale} />}

                        {checkError !== "" && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 rounded-xl border border-rose-500 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                {checkError}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </ModalShell>
    );
}

/* ========================================================================== */
/* Book Visit modal (patient pre-filled)                                      */
/* ========================================================================== */

function BookVisitModal({
    locale,
    t,
    patient,
    onClose,
    onBooked,
    onError,
}: {
    locale: Locale;
    t: Messages;
    patient: PatientRow;
    onClose: () => void;
    onBooked: () => void;
    onError: (message: string) => void;
}) {
    const isRtl = locale === "ar";
    const titleId = useId();

    const [options, setOptions] = useState<VisitBookingOptions | null>(null);
    const [loadingOptions, setLoadingOptions] = useState(true);
    const [clinicId, setClinicId] = useState("");
    const [doctorId, setDoctorId] = useState("");
    const [date, setDate] = useState("");
    const [slots, setSlots] = useState<VisitSlot[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [slotKey, setSlotKey] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const slotSeq = useRef(0);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const result = await getVisitBookingOptionsAction();

            if (cancelled) return;

            if (result.success && result.data) {
                setOptions(result.data);
                setDate(result.data.today);
            } else {
                setError(errorText(t, result.code, result.error));
            }

            setLoadingOptions(false);
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doctorsInClinic = useMemo(
        () => (options?.doctors ?? []).filter((doctor) => doctor.clinicId === clinicId && doctor.hasActiveShifts),
        [options, clinicId],
    );

    const clinicOptions: SelectOption[] = useMemo(
        () =>
            (options?.clinics ?? []).map((clinic) => ({
                value: clinic.id,
                label: locale === "ar" ? clinic.nameAr : clinic.nameEn,
            })),
        [options, locale],
    );

    const doctorOptions: SelectOption[] = useMemo(
        () =>
            doctorsInClinic.map((doctor) => {
                const name = displayDoctor(locale === "ar" ? doctor.fullNameAr : doctor.fullNameEn, locale);
                const specialty = locale === "ar" ? doctor.specialtyAr : doctor.specialtyEn;
                const off = doctor.presence === "OFF_DUTY" ? ` · ${t.offDuty}` : "";

                return { value: doctor.id, label: `${name} — ${specialty}${off}` };
            }),
        [doctorsInClinic, locale, t.offDuty],
    );

    /* Load the available slots whenever doctor / date change. */
    useEffect(() => {
        if (doctorId === "" || date === "") {
            setSlots([]);

            return;
        }

        const seq = ++slotSeq.current;

        setSlotsLoading(true);
        setSlotKey("");

        void (async () => {
            const result = await getVisitSlotsAction({ doctorId, date });

            if (seq !== slotSeq.current) return;

            setSlotsLoading(false);

            if (result.success && result.data) {
                setSlots(result.data.slots);
                setError("");
            } else {
                setSlots([]);
                setError(errorText(t, result.code, result.error));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doctorId, date]);

    const selectedSlot = slots.find((slot) => `${slot.shiftId}|${slot.startMinute}` === slotKey) ?? null;
    const timezone = options?.timezone ?? "Asia/Riyadh";

    const submit = async () => {
        if (selectedSlot === null || doctorId === "") return;

        setSubmitting(true);
        setError("");

        const result = await bookPatientVisitAction({
            patientId: patient.id,
            doctorId,
            shiftId: selectedSlot.shiftId,
            date,
            startMinute: selectedSlot.startMinute,
            ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
        });

        setSubmitting(false);

        if (result.success) {
            onBooked();

            return;
        }

        const message = errorText(t, result.code, result.error);

        setError(message);
        onError(message);
    };

    const patientName = locale === "ar" ? patient.fullNameAr : patient.fullNameEn;
    const secondary = locale === "ar" ? patient.fullNameEn : patient.fullNameAr;

    return (
        <ModalShell
            title={t.bookTitle}
            titleId={titleId}
            onClose={onClose}
            isRtl={isRtl}
            closeLabel={t.close}
            maxWidth="max-w-2xl"
            footer={
                <>
                    {error !== "" && (
                        <p role="alert" className="me-auto flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                            <CircleAlert className="h-4 w-4 shrink-0" />
                            {error}
                        </p>
                    )}
                    <button type="button" onClick={onClose} className={`${outlineButton} h-11`}>
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={selectedSlot === null || submitting}
                        className={`${tealButton} h-11 px-6`}
                    >
                        {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {submitting ? t.booking : t.bookConfirm}
                    </button>
                </>
            }
        >
            <div className="space-y-5">
                {/* Pre-filled patient card */}
                <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{t.bookPatient}</p>
                    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                        <Avatar row={patient} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{patientName}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
                                <span dir="ltr">{patient.fileNumber}</span>
                                <span aria-hidden>•</span>
                                <span dir={locale === "ar" ? "ltr" : "rtl"}>{secondary}</span>
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                            <NphiesBadge state={patient.nphiesState} t={t} />
                            <span className="max-w-[10rem] truncate text-xs text-slate-500 dark:text-slate-400">
                                {patient.insured
                                    ? ((locale === "ar" ? patient.payerNameAr : patient.payerNameEn) ?? "")
                                    : t.cashPatient}
                            </span>
                        </div>
                    </div>
                    {patient.nphiesState === "EXPIRED" && (
                        <p className="mt-2 flex items-start gap-2 rounded-lg border border-orange-500/60 bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            {t.bookExpiredWarning}
                        </p>
                    )}
                    {!patient.insured && (
                        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            {t.bookCashNote}
                        </p>
                    )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor={`${titleId}-clinic`}>{t.bookClinic}</FieldLabel>
                        {loadingOptions ? (
                            <Skeleton className="h-11 w-full rounded-lg" />
                        ) : (
                            <SelectBox
                                id={`${titleId}-clinic`}
                                value={clinicId}
                                onChange={(value) => {
                                    setClinicId(value);
                                    setDoctorId("");
                                }}
                                options={clinicOptions}
                                placeholder={t.bookChooseClinic}
                                isRtl={isRtl}
                                ariaLabel={t.bookClinic}
                                emptyLabel={t.noOptions}
                            />
                        )}
                    </div>

                    <div>
                        <FieldLabel htmlFor={`${titleId}-doctor`}>{t.bookDoctor}</FieldLabel>
                        {loadingOptions ? (
                            <Skeleton className="h-11 w-full rounded-lg" />
                        ) : (
                            <SelectBox
                                id={`${titleId}-doctor`}
                                value={doctorId}
                                onChange={setDoctorId}
                                options={doctorOptions}
                                placeholder={t.bookChooseDoctor}
                                disabled={clinicId === ""}
                                isRtl={isRtl}
                                ariaLabel={t.bookDoctor}
                                emptyLabel={t.bookNoDoctors}
                            />
                        )}
                    </div>
                </div>

                <div>
                    <FieldLabel htmlFor={`${titleId}-date`}>{t.bookDate}</FieldLabel>
                    <input
                        id={`${titleId}-date`}
                        type="date"
                        dir="ltr"
                        min={options?.today}
                        max={options?.maxDate}
                        value={date}
                        disabled={loadingOptions}
                        onChange={(event) => setDate(event.target.value)}
                        className={`${baseInput} dark:[color-scheme:dark] ${isRtl ? "text-end" : ""}`}
                    />
                </div>

                <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{t.bookSlots}</p>
                    {doctorId === "" ? (
                        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {t.bookPickDoctor}
                        </p>
                    ) : slotsLoading ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {Array.from({ length: 8 }, (_, index) => (
                                <Skeleton key={index} className="h-10 rounded-lg" />
                            ))}
                        </div>
                    ) : slots.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {t.bookNoSlots}
                        </p>
                    ) : (
                        <div role="listbox" aria-label={t.bookSlots} className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pe-1 sm:grid-cols-4">
                            {slots.map((slot) => {
                                const key = `${slot.shiftId}|${slot.startMinute}`;
                                const isSelected = key === slotKey;

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => setSlotKey(key)}
                                        className={`h-10 rounded-lg border text-sm font-medium transition-colors duration-150 ${isSelected
                                            ? "border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-teal-500/60 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200"
                                            }`}
                                    >
                                        <span dir="ltr">{fmtTime(slot.startIso, timezone, locale)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {selectedSlot !== null && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {locale === "ar" ? selectedSlot.serviceNameAr : selectedSlot.serviceNameEn} · {selectedSlot.durationMinutes} min
                        </p>
                    )}
                </div>

                <div>
                    <FieldLabel htmlFor={`${titleId}-reason`}>{t.bookReason}</FieldLabel>
                    <textarea
                        id={`${titleId}-reason`}
                        rows={2}
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className={`${baseInput} h-auto resize-none py-2.5`}
                    />
                </div>
            </div>
        </ModalShell>
    );
}

/* ========================================================================== */
/* Profile drawer (administrative / operational history only)                 */
/* ========================================================================== */

type ProfileTab = "visits" | "invoices" | "nphies";

function ZatcaBadge({ status, t }: { status: ProfileZatcaStatus; t: Messages }) {
    const cls: Record<ProfileZatcaStatus, string> = {
        CLEARED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        REPORTED: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
        PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        NOT_SUBMITTED: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    };

    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls[status]}`}>
            {t.zatcaStatus[status]}
        </span>
    );
}

function VisitStatusBadge({ status, t }: { status: AppointmentStatus; t: Messages }) {
    const tone =
        status === "COMPLETED"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : status === "CANCELLED" || status === "NO_SHOW"
                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                : status === "IN_PROGRESS" || status === "WAITING"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-sky-500/15 text-sky-700 dark:text-sky-300";

    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{t.visitStatus[status]}</span>
    );
}

function ProfileDrawer({
    locale,
    t,
    patientId,
    verifying,
    onClose,
    onBook,
    onEdit,
    onVerify,
}: {
    locale: Locale;
    t: Messages;
    patientId: string;
    verifying: boolean;
    onClose: () => void;
    onBook: (row: PatientRow) => void;
    onEdit: (row: PatientRow) => void;
    onVerify: (row: PatientRow) => Promise<PatientRow | null>;
}) {
    const isRtl = locale === "ar";
    const titleId = useId();
    const [profile, setProfile] = useState<PatientProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<ProfileTab>("visits");

    const load = useCallback(async () => {
        const result = await getPatientProfileAction(patientId);

        if (result.success && result.data) {
            setProfile(result.data);
            setError("");
        } else {
            setError(errorText(t, result.code, result.error));
        }

        setLoading(false);
    }, [patientId, t]);

    useEffect(() => {
        setLoading(true);
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKey);

        const previous = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    const verify = async () => {
        if (!profile) return;

        const updated = await onVerify(profile.row);

        if (updated) void load();
    };

    const row = profile?.row ?? null;
    const timezone = profile?.timezone ?? "Asia/Riyadh";
    const upcoming = profile?.visits.filter((visit) => visit.isUpcoming) ?? [];
    const past = profile?.visits.filter((visit) => !visit.isUpcoming) ?? [];

    const txLabel = (type: ProfileNphiesEntryType): string =>
        type === "ELIGIBILITY"
            ? t.txEligibility
            : type === "PRE_AUTHORIZATION"
                ? t.txPreAuth
                : type === "CLAIM"
                    ? t.txClaim
                    : type === "E_PRESCRIPTION"
                        ? t.txPrescription
                        : t.txPoll;

    const tabs: Array<{ key: ProfileTab; label: string; count: number }> = [
        { key: "visits", label: t.tabVisits, count: profile?.visits.length ?? 0 },
        { key: "invoices", label: t.tabInvoices, count: profile?.invoices.length ?? 0 },
        { key: "nphies", label: t.tabNphies, count: profile?.nphiesLog.length ?? 0 },
    ];

    return createPortal(
        <motion.div
            {...backdropMotion}
            className="fixed inset-0 z-[100] bg-slate-950/70 -sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.aside
                initial={{ x: isRtl ? -48 : 48, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: isRtl ? -48 : 48, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                dir={isRtl ? "rtl" : "ltr"}
                className="absolute inset-y-0 end-0 flex w-full max-w-xl flex-col border-s border-slate-200 bg-white text-slate-900 shadow-2xl shadow-black/50 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100"
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                    <div className="min-w-0">
                        <h2 id={titleId} className="text-xl font-bold tracking-tight">
                            {t.profileTitle}
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.profileSubtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t.close}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="space-y-5 p-6">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-14 w-14 rounded-full" />
                                <div className="space-y-2">
                                    <Skeleton className="h-5 w-48" />
                                    <Skeleton className="h-4 w-32" />
                                </div>
                            </div>
                            <Skeleton className="h-28 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-lg" />
                            {Array.from({ length: 4 }, (_, index) => (
                                <Skeleton key={index} className="h-16 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : error !== "" || !profile || !row ? (
                        <div className="flex flex-col items-center gap-3 p-10 text-center">
                            <CircleAlert className="h-8 w-8 text-rose-500" />
                            <p className="text-sm text-slate-600 dark:text-slate-300">{error || t.loadFailed}</p>
                            <button type="button" onClick={() => { setLoading(true); void load(); }} className={`${outlineButton} h-10`}>
                                {t.retry}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6 p-6">
                            {/* Identity */}
                            <div className="flex items-center gap-4">
                                <Avatar row={row} size="lg" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-lg font-bold text-slate-900 dark:text-white">
                                        {locale === "ar" ? row.fullNameAr : row.fullNameEn}
                                    </p>
                                    <p className="truncate text-sm text-slate-500 dark:text-slate-400" dir={locale === "ar" ? "ltr" : "rtl"}>
                                        {locale === "ar" ? row.fullNameEn : row.fullNameAr}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span dir="ltr" className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                            {row.fileNumber}
                                        </span>
                                        <NphiesBadge state={row.nphiesState} t={t} />
                                        <VatBadge row={row} t={t} />
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div className={`${cardSurface} p-4`}>
                                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{t.profileInfo}</h3>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileId}</dt>
                                        <dd dir="ltr" className={`font-medium ${isRtl ? "text-end" : ""}`}>{row.nationalIdMasked}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileMobile}</dt>
                                        <dd dir="ltr" className={`font-medium ${isRtl ? "text-end" : ""}`}>{formatPhone(row.phone)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileDob}</dt>
                                        <dd className="font-medium">
                                            {profile.dateOfBirth ? fmtDate(`${profile.dateOfBirth}T00:00:00Z`, "UTC", locale) : t.none}
                                            {row.ageYears !== null && ` · ${row.ageYears} ${t.yrs}`}
                                            {row.gender !== null && ` · ${genderLabel(row.gender, t)}`}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileRegistered}</dt>
                                        <dd className="font-medium">{fmtDate(profile.registeredAt, timezone, locale)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.colInsurance}</dt>
                                        <dd className="font-medium">
                                            {row.insured ? ((locale === "ar" ? row.payerNameAr : row.payerNameEn) ?? t.none) : t.cashPatient}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profilePlan}</dt>
                                        <dd className="font-medium">
                                            {row.insured ? ((locale === "ar" ? (row.policyNameAr ?? row.policyNameEn) : row.policyNameEn) ?? t.none) : t.none}
                                            {row.copay !== null && ` · ${copayLabel(row.copay, t)}`}
                                        </dd>
                                    </div>
                                    {row.insured && (
                                        <>
                                            <div>
                                                <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileMember}</dt>
                                                <dd dir="ltr" className={`font-medium ${isRtl ? "text-end" : ""}`}>{profile.memberIdMasked ?? t.none}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-500 dark:text-slate-400">{t.profileLastCheck}</dt>
                                                <dd className="font-medium">
                                                    {row.lastVerifiedAt ? fmtDateTime(row.lastVerifiedAt, timezone, locale) : t.none}
                                                </dd>
                                            </div>
                                        </>
                                    )}
                                </dl>
                            </div>

                            {/* Tabs */}
                            <div>
                                <div role="tablist" aria-label={t.profileTitle} className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-950/60">
                                    {tabs.map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            role="tab"
                                            aria-selected={tab === item.key}
                                            onClick={() => setTab(item.key)}
                                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${tab === item.key
                                                ? "bg-white text-teal-700 shadow-sm dark:bg-slate-800 dark:text-teal-300"
                                                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                                }`}
                                        >
                                            {item.label}
                                            <span className="ms-1.5 text-xs opacity-70">{item.count}</span>
                                        </button>
                                    ))}
                                </div>

                                <div role="tabpanel" className="mt-4 space-y-3">
                                    {tab === "visits" && (
                                        <>
                                            {profile.visits.length === 0 && <EmptyNote text={t.noVisits} />}
                                            {upcoming.length > 0 && <SectionLabel text={t.upcoming} />}
                                            {upcoming.map((visit) => (
                                                <VisitCard key={visit.id} visit={visit} t={t} locale={locale} timezone={timezone} />
                                            ))}
                                            {past.length > 0 && <SectionLabel text={t.past} />}
                                            {past.map((visit) => (
                                                <VisitCard key={visit.id} visit={visit} t={t} locale={locale} timezone={timezone} />
                                            ))}
                                        </>
                                    )}

                                    {tab === "invoices" && (
                                        <>
                                            {profile.invoices.length === 0 && <EmptyNote text={t.noInvoices} />}
                                            {profile.invoices.map((invoice) => {
                                                const typeLabel =
                                                    invoice.invoiceType === null
                                                        ? null
                                                        : invoice.isInsurance
                                                            ? t.invoiceInsurance
                                                            : invoice.invoiceType === "SIMPLIFIED_B2C"
                                                                ? t.invoiceB2c
                                                                : invoice.invoiceType === "TAX_B2B"
                                                                    ? t.invoiceB2b
                                                                    : invoice.invoiceType === "CREDIT_NOTE"
                                                                        ? t.invoiceCredit
                                                                        : t.invoiceDebit;

                                                return (
                                                    <div key={invoice.id} className={`${cardSurface} p-4`}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p dir="ltr" className={`flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white ${isRtl ? "justify-end" : ""}`}>
                                                                    <FileText className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                                                    {invoice.reference}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    {fmtDateTime(invoice.issuedAt, timezone, locale)}
                                                                    {typeLabel !== null && ` · ${typeLabel}`}
                                                                </p>
                                                                {invoice.payerName !== null && (
                                                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{invoice.payerName}</p>
                                                                )}
                                                            </div>
                                                            <ZatcaBadge status={invoice.zatcaStatus} t={t} />
                                                        </div>
                                                        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                                                            <span className="text-slate-500 dark:text-slate-400">
                                                                {invoice.vatExempt ? t.vatExemptShort : `${t.invoiceVat} ${fmtMoney(invoice.vatAmount, locale)}`}
                                                            </span>
                                                            <span className="font-semibold text-slate-900 dark:text-white">
                                                                {t.invoiceTotal}: {fmtMoney(invoice.grandTotal, locale)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {tab === "nphies" && (
                                        <>
                                            {profile.nphiesLog.length === 0 && <EmptyNote text={t.noNphies} />}
                                            {profile.nphiesLog.map((entry) => {
                                                const message = locale === "ar" ? entry.messageAr : entry.messageEn;
                                                const tone =
                                                    entry.status === "COMPLETE"
                                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                        : entry.status === "ERROR"
                                                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300";

                                                return (
                                                    <div key={entry.id} className={`${cardSurface} p-4`}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                                                                    <ShieldCheck className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                                                                    {txLabel(entry.transactionType)}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    {fmtDateTime(entry.createdAt, timezone, locale)} · {entry.mode === "SIMULATOR" ? t.modeSimulator : t.modeProduction}
                                                                </p>
                                                            </div>
                                                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
                                                                {t.txStatus[entry.status]}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                                                            <p dir="ltr" className={isRtl ? "text-end" : ""}>#{entry.referenceNumber}</p>
                                                            {entry.policyActive !== null && (
                                                                <p>
                                                                    {entry.policyActive ? t.policyActive : t.policyInactive}
                                                                    {entry.copayPercentage !== null && ` · ${fill(t.copayPercent, { value: entry.copayPercentage })}`}
                                                                </p>
                                                            )}
                                                            {entry.preAuthRef !== null && (
                                                                <p>
                                                                    {t.preAuthRef}: <span dir="ltr">{entry.preAuthRef}</span>
                                                                </p>
                                                            )}
                                                            {message !== null && <p>{message}</p>}
                                                            <p className="text-slate-400 dark:text-slate-500">
                                                                {t.latency}: {entry.latencyMs}ms
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {row !== null && (
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
                        {row.insured && (
                            <button
                                type="button"
                                onClick={() => void verify()}
                                disabled={verifying}
                                className={`${outlineButton} h-11`}
                            >
                                {verifying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                {verifying ? t.verifying : t.verify}
                            </button>
                        )}
                        <button type="button" onClick={() => onEdit(row)} className={`${outlineButton} h-11`}>
                            <Pencil className="h-4 w-4" />
                            {t.edit}
                        </button>
                        <button type="button" onClick={() => onBook(row)} className={`${tealButton} h-11`}>
                            <Plus className="h-4 w-4" />
                            {t.bookVisit}
                        </button>
                    </div>
                )}
            </motion.aside>
        </motion.div>,
        document.body,
    );
}

type ProfileNphiesEntryType = PatientProfileData["nphiesLog"][number]["transactionType"];

function EmptyNote({ text }: { text: string }) {
    return (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {text}
        </p>
    );
}

function SectionLabel({ text }: { text: string }) {
    return <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{text}</p>;
}

function VisitCard({
    visit,
    t,
    locale,
    timezone,
}: {
    visit: PatientProfileData["visits"][number];
    t: Messages;
    locale: Locale;
    timezone: string;
}) {
    return (
        <div className={`${cardSurface} flex items-start justify-between gap-3 p-4`}>
            <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <CalendarDays className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    {fmtDateTime(visit.scheduledAt, timezone, locale)}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                    {displayDoctor(locale === "ar" ? visit.doctorNameAr : visit.doctorNameEn, locale)} ·{" "}
                    {locale === "ar" ? visit.specialtyAr : visit.specialtyEn}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {locale === "ar" ? visit.clinicNameAr : visit.clinicNameEn}
                </p>
            </div>
            <VisitStatusBadge status={visit.status} t={t} />
        </div>
    );
}

/* ========================================================================== */
/* Page                                                                       */
/* ========================================================================== */

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type FormModalState = { patientId: string | null; startInsured: boolean } | null;

export default function PatientsDirectoryPage({ initialLocale }: { initialLocale: Locale }) {
    const [locale, setLocale] = useState(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    /* Search / filter / sort / page state: all applied in memory, never sent to the server. */
    const [search, setSearch] = useState("");
    const [coverage, setCoverage] = useState<PatientCoverageFilter>("ALL");
    const [nphiesFilter, setNphiesFilter] = useState<PatientNphiesFilter>("ALL");
    const [sort, setSort] = useState<PatientSortKey>("created");
    const [dir, setDir] = useState<PatientSortDir>("desc");
    const [page, setPage] = useState(1);

    const [data, setData] = useState<PatientDirectoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState("");

    const [options, setOptions] = useState<PatientFormOptions | null>(null);
    const [optionsLoading, setOptionsLoading] = useState(true);

    const [formModal, setFormModal] = useState<FormModalState>(null);
    const [bookPatient, setBookPatient] = useState<PatientRow | null>(null);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const t = messages[locale];
    const isRtl = locale === "ar";

    const tRef = useRef<Messages>(t);
    const seqRef = useRef(0);
    const hasDataRef = useRef(false);
    const toastIdRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    /* Follow later app-level language switches (html[lang]); the first value comes from initialLocale. */
    useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => setLocale(root.lang === "en" ? "en" : "ar"));

        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    /* ------------------------------- toasts ------------------------------- */

    const dismissToast = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushToast = useCallback(
        (kind: ToastKind, message: string) => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
            window.setTimeout(() => dismissToast(id), TOAST_MS);
        },
        [dismissToast],
    );

    /* ------------------------- data loading (one fetch) ------------------------- */

    /**
     * Reads the whole directory. Called once on mount, after a mutation (force) and from Retry.
     * With `force` and data already on screen the table stays visible and a small "Updating…"
     * indicator is shown instead of the skeleton.
     */
    const load = useCallback(
        async (force: boolean): Promise<void> => {
            const seq = ++seqRef.current;

            if (force && hasDataRef.current) setRefreshing(true);
            else setLoading(true);

            const result = await getPatientsDirectoryAction();

            if (seq !== seqRef.current) return;

            setRefreshing(false);
            setLoading(false);

            if (result.success && result.data) {
                hasDataRef.current = true;
                setData(result.data);
                setLoadError("");
            } else if (!hasDataRef.current) {
                setLoadError(errorText(tRef.current, result.code, result.error));
            } else {
                pushToast("error", errorText(tRef.current, result.code, result.error));
            }
        },
        [pushToast],
    );

    useEffect(() => {
        void load(false);
    }, [load]);

    /* Payers / policies are loaded once (separate from the directory). */
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const result = await getPatientFormOptionsAction();

            if (cancelled) return;

            if (result.success && result.data) setOptions(result.data);

            setOptionsLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    /** Replaces a single row in memory (used after "Verify NPHIES": no re-fetch needed). */
    const patchRow = useCallback((updated: PatientRow) => {
        setData((current) => {
            if (!current) return current;

            return {
                ...current,
                rows: current.rows.map((row) => (row.id === updated.id ? updated : row)),
            };
        });
    }, []);

    /** Inserts / replaces a saved row immediately so the table is correct before the background refresh. */
    const upsertRow = useCallback((saved: PatientRow) => {
        setData((current) => {
            if (!current) return current;

            const exists = current.rows.some((row) => row.id === saved.id);

            return {
                ...current,
                rows: exists
                    ? current.rows.map((row) => (row.id === saved.id ? saved : row))
                    : [saved, ...current.rows],
            };
        });
    }, []);

    /* ------------------------ in-memory search & filters ------------------------ */

    const allRows = useMemo<PatientRow[]>(() => data?.rows ?? [], [data]);

    const searchable = useMemo<SearchableRow[]>(() => allRows.map(toSearchable), [allRows]);

    const filteredRows = useMemo<PatientRow[]>(() => {
        const prepared = prepareSearch(search);

        return searchable
            .filter((item) => {
                if (coverage === "INSURED" && !item.row.insured) return false;
                if (coverage === "CASH" && item.row.insured) return false;
                if (nphiesFilter !== "ALL" && item.row.nphiesState !== nphiesFilter) return false;

                return prepared.term === "" || matchesSearch(item, prepared);
            })
            .map((item) => item.row)
            .sort((a, b) => compareRows(a, b, sort, dir));
    }, [searchable, search, coverage, nphiesFilter, sort, dir]);

    const stats = useMemo<PatientDirectoryStats | null>(() => {
        if (data === null) return null;

        return data.truncated ? data.stats : computeStats(data.rows);
    }, [data]);

    const hasActiveFilters = search.trim() !== "" || coverage !== "ALL" || nphiesFilter !== "ALL";

    const resetFilters = useCallback(() => {
        setSearch("");
        setCoverage("ALL");
        setNphiesFilter("ALL");
        setSort("created");
        setDir("desc");
        setPage(1);
    }, []);

    const toggleSort = (key: Exclude<PatientSortKey, "created">) => {
        setPage(1);

        if (sort !== key) {
            setSort(key);
            setDir("asc");
        } else if (dir === "asc") {
            setDir("desc");
        } else {
            setSort("created");
            setDir("desc");
        }
    };

    /* ------------------------------- actions ------------------------------- */

    const handleVerify = useCallback(
        async (row: PatientRow): Promise<PatientRow | null> => {
            setBusyId(row.id);

            const result = await verifyPatientNphiesAction(row.id);

            setBusyId(null);

            if (!result.success || !result.data) {
                pushToast("error", errorText(tRef.current, result.code, result.error));

                return null;
            }

            const { row: updated, eligibility } = result.data;
            const tm = tRef.current;

            patchRow(updated);

            if (eligibility.state === "ELIGIBLE") {
                const payer = (locale === "ar" ? eligibility.payerNameAr : eligibility.payerNameEn) ?? "";
                const copay = eligibility.copay !== null ? ` · ${copayLabel(eligibility.copay, tm)}` : "";

                pushToast("success", `${tm.toastVerified} ${payer}${copay}`.trim());
            } else if (eligibility.state === "PENDING") {
                pushToast("info", tm.toastPending);
            } else if (eligibility.state === "EXPIRED") {
                pushToast("error", tm.toastExpired);
            } else {
                pushToast("error", (locale === "ar" ? eligibility.messageAr : eligibility.messageEn) ?? tm.toastEligError);
            }

            return updated;
        },
        [locale, patchRow, pushToast],
    );

    const openCreate = () => setFormModal({ patientId: null, startInsured: false });
    const openEdit = (row: PatientRow, startInsured = false) => {
        setProfileId(null);
        setFormModal({ patientId: row.id, startInsured });
    };
    const openBook = (row: PatientRow) => {
        setProfileId(null);
        setBookPatient(row);
    };

    const handleSaved = (saved: PatientRow, mode: "create" | "update") => {
        setFormModal(null);
        pushToast("success", mode === "create" ? tRef.current.toastCreated : tRef.current.toastUpdated);

        upsertRow(saved);

        if (mode === "create") {
            setSort("created");
            setDir("desc");
            setPage(1);
        }

        // A real mutation happened: refresh the directory once in the background.
        void load(true);
    };

    /* ------------------------------ derived UI ------------------------------ */

    const showSkeleton = loading;
    const total = filteredRows.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount);
    const rows = useMemo(
        () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [filteredRows, currentPage],
    );
    const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(total, currentPage * PAGE_SIZE);

    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    const coverageOptions: SelectOption[] = [
        { value: "ALL", label: t.allCoverage },
        { value: "INSURED", label: t.coverageInsured },
        { value: "CASH", label: t.coverageCash },
    ];

    const nphiesOptions: SelectOption[] = [
        { value: "ALL", label: t.allStatuses },
        { value: "ELIGIBLE", label: t.stEligible },
        { value: "PENDING", label: t.stPending },
        { value: "EXPIRED", label: t.stExpired },
        { value: "NO_COVERAGE", label: t.stNoCoverage },
    ];

    const sortIconClass = (key: Exclude<PatientSortKey, "created">) =>
        `h-3.5 w-3.5 ${sort === key ? "text-teal-600 dark:text-teal-400" : "text-slate-400"}`;

    const ariaSort = (key: Exclude<PatientSortKey, "created">): "ascending" | "descending" | "none" =>
        sort !== key ? "none" : dir === "asc" ? "ascending" : "descending";

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <ReceptionSidebar
                    locale={locale}
                    activeHref={PATIENTS_HREF}
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <main className="min-w-0 flex-1">
                    <ReceptionHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        {/* Title + summary pills */}
                        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                            <div>
                                <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <span>/</span>
                                    <span className="text-teal-700 dark:text-teal-400">{t.breadcrumbPage}</span>
                                </div>
                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                                    {t.pageTitle}
                                </h1>
                            </div>

                            <div className="flex flex-wrap items-center gap-3" aria-live="polite">
                                {showSkeleton || !stats ? (
                                    <>
                                        <StatSkeleton />
                                        <StatSkeleton />
                                        <StatSkeleton />
                                    </>
                                ) : (
                                    <>
                                        <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                            {t.statTotal}: <span dir="ltr">{fmtNumber(stats.total, locale)}</span>
                                        </span>
                                        <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                            {t.statInsured}: <span dir="ltr">{stats.insuredPercent}%</span>
                                        </span>
                                        <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                            {t.statCash}: <span dir="ltr">{stats.cashPercent}%</span>
                                        </span>
                                    </>
                                )}
                                {data && (
                                    <span
                                        className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold ${data.nphiesMode === "PRODUCTION"
                                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                            : "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                            }`}
                                    >
                                        <span className={`h-2 w-2 rounded-full ${data.nphiesMode === "PRODUCTION" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                        {data.nphiesMode === "PRODUCTION" ? t.modeProduction : t.modeSimulator}
                                    </span>
                                )}
                            </div>
                        </header>

                        {/* Search + filters + register */}
                        <section className="flex flex-col gap-3 xl:flex-row xl:items-center" aria-label={t.searchLabel}>
                            <div className="relative min-w-0 flex-1">
                                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    maxLength={SEARCH_MAX_LENGTH}
                                    onChange={(event) => {
                                        setSearch(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t.searchPlaceholder}
                                    aria-label={t.searchLabel}
                                    className={`${baseInput} h-14 !rounded-xl ps-12 text-base`}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <div className="w-48">
                                    <SelectBox
                                        value={coverage}
                                        onChange={(value) => {
                                            setCoverage(value === "INSURED" || value === "CASH" ? value : "ALL");
                                            setPage(1);
                                        }}
                                        options={coverageOptions}
                                        isRtl={isRtl}
                                        ariaLabel={t.allCoverage}
                                        className="!h-14 !rounded-xl"
                                    />
                                </div>
                                <div className="w-48">
                                    <SelectBox
                                        value={nphiesFilter}
                                        onChange={(value) => {
                                            setNphiesFilter(
                                                value === "ELIGIBLE" || value === "PENDING" || value === "EXPIRED" || value === "NO_COVERAGE"
                                                    ? value
                                                    : "ALL",
                                            );
                                            setPage(1);
                                        }}
                                        options={nphiesOptions}
                                        placeholder={t.nphiesStatus}
                                        isRtl={isRtl}
                                        ariaLabel={t.nphiesStatus}
                                        className="!h-14 !rounded-xl"
                                    />
                                </div>

                                {/* Smart reset: only rendered while a search / filter is active. */}
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className={`${outlineButton} h-14 !rounded-xl`}
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        {t.resetFilters}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className={`${tealButton} h-14 !rounded-xl px-6 text-base shadow-lg shadow-teal-500/20`}
                                >
                                    <Plus className="h-5 w-5" />
                                    {t.register}
                                </button>
                            </div>
                        </section>

                        {/* Directory table */}
                        <section className={`${cardSurface} overflow-hidden`} aria-labelledby="patients-table-title">
                            <div className="flex items-center justify-between gap-3 px-6 py-5">
                                <h2 id="patients-table-title" className="text-xl font-bold text-slate-900 dark:text-white">
                                    {t.tableTitle}
                                </h2>
                                {refreshing && (
                                    <span className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                        {t.refreshing}
                                    </span>
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1180px] border-collapse text-start">
                                    <thead>
                                        <tr className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                            <th scope="col" className="px-6 py-3.5 text-start">{t.colPatient}</th>
                                            <th scope="col" aria-sort={ariaSort("nationalId")} className="px-6 py-3.5 text-start">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort("nationalId")}
                                                    aria-label={`${t.sortBy} ${t.colId}`}
                                                    className="inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors duration-150 hover:text-teal-600 dark:hover:text-teal-400"
                                                >
                                                    {t.colId}
                                                    <ArrowUpDown className={sortIconClass("nationalId")} />
                                                </button>
                                            </th>
                                            <th scope="col" className="px-6 py-3.5 text-start">{t.colMobile}</th>
                                            <th scope="col" aria-sort={ariaSort("insurance")} className="px-6 py-3.5 text-start">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort("insurance")}
                                                    aria-label={`${t.sortBy} ${t.colInsurance}`}
                                                    className="inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors duration-150 hover:text-teal-600 dark:hover:text-teal-400"
                                                >
                                                    {t.colInsurance}
                                                    <ArrowUpDown className={sortIconClass("insurance")} />
                                                </button>
                                            </th>
                                            <th scope="col" className="px-6 py-3.5 text-start">{t.colActions}</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {showSkeleton &&
                                            Array.from({ length: SKELETON_ROWS }, (_, index) => <RowSkeleton key={index} />)}

                                        {!showSkeleton && loadError !== "" && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-16 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <CircleAlert className="h-8 w-8 text-rose-500" />
                                                        <p className="text-sm text-slate-600 dark:text-slate-300">{t.loadFailed}</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">{loadError}</p>
                                                        <button type="button" onClick={() => void load(true)} className={`${outlineButton} h-10`}>
                                                            {t.retry}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {!showSkeleton && loadError === "" && rows.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <UserRound className="h-8 w-8 text-slate-400" />
                                                        {hasActiveFilters ? t.emptyFiltered : t.empty}
                                                        {hasActiveFilters && (
                                                            <button type="button" onClick={resetFilters} className={`${outlineButton} h-10`}>
                                                                <RotateCcw className="h-4 w-4" />
                                                                {t.resetFilters}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {!showSkeleton &&
                                            rows.map((row) => {
                                                const verifying = busyId === row.id;
                                                const name = isRtl ? row.fullNameAr : row.fullNameEn;
                                                const secondary = isRtl ? row.fullNameEn : row.fullNameAr;

                                                return (
                                                    <tr
                                                        key={row.id}
                                                        className="border-t border-slate-200 transition-colors duration-150 hover:bg-teal-500/5 dark:border-slate-800"
                                                    >
                                                        {/* MRN & name */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-4">
                                                                <Avatar row={row} />
                                                                <div className="min-w-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setProfileId(row.id)}
                                                                        title={t.viewProfile}
                                                                        className="max-w-full text-start text-base font-semibold text-slate-900 transition-colors duration-150 hover:text-teal-600 focus:outline-none focus-visible:text-teal-600 dark:text-white dark:hover:text-teal-400"
                                                                    >
                                                                        <span dir="ltr" className="font-medium text-slate-500 dark:text-slate-400">
                                                                            {row.fileNumber}
                                                                        </span>
                                                                        <span aria-hidden className="mx-2 text-slate-400">•</span>
                                                                        <span>{name}</span>
                                                                    </button>
                                                                    <p
                                                                        dir={isRtl ? "ltr" : "rtl"}
                                                                        lang={isRtl ? "en" : "ar"}
                                                                        className={`mt-1 truncate text-sm text-slate-500 dark:text-slate-400 ${isRtl ? "text-end" : "text-start"}`}
                                                                    >
                                                                        {secondary}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* National ID & VAT */}
                                                        <td className="px-6 py-4">
                                                            <p dir="ltr" className={`text-base font-medium text-slate-800 dark:text-slate-100 ${isRtl ? "text-end" : ""}`}>
                                                                {row.nationalIdMasked}
                                                            </p>
                                                            <div className="mt-1.5">
                                                                <VatBadge row={row} t={t} />
                                                            </div>
                                                        </td>

                                                        {/* Mobile & demographics */}
                                                        <td className="px-6 py-4">
                                                            <p dir="ltr" className={`text-base font-medium text-slate-800 dark:text-slate-100 ${isRtl ? "text-end" : ""}`}>
                                                                {formatPhone(row.phone)}
                                                            </p>
                                                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                                {row.ageYears !== null ? `${row.ageYears} ${t.yrs}` : t.none}, {genderLabel(row.gender, t)}
                                                            </p>
                                                        </td>

                                                        {/* Insurance & NPHIES */}
                                                        <td className="px-6 py-4">
                                                            {row.insured ? (
                                                                <>
                                                                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                                                                        {(isRtl ? row.payerNameAr : row.payerNameEn) ?? t.none}
                                                                    </p>
                                                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                                        <NphiesBadge state={row.nphiesState} t={t} />
                                                                        {row.copay !== null && (
                                                                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                                                <span aria-hidden>•</span>
                                                                                {copayLabel(row.copay, t)}
                                                                                {row.copay.cap !== null && ` (${fill(t.copayCap, { value: row.copay.cap })})`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {row.nphiesState === "EXPIRED" && row.policyExpiry !== null && (
                                                                        <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">
                                                                            {fill(t.expiredOn, { date: fmtDate(`${row.policyExpiry}T00:00:00Z`, "UTC", locale) })}
                                                                        </p>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-base font-semibold text-slate-900 dark:text-white">{t.cashPatient}</span>
                                                                    <span className="inline-flex rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                                                                        {t.selfPay}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap items-center gap-2.5">
                                                                {row.insured ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleVerify(row)}
                                                                        disabled={verifying}
                                                                        className="inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-sm font-semibold text-teal-600 transition-colors duration-150 hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-wait disabled:opacity-60 dark:text-teal-400"
                                                                    >
                                                                        {verifying && <LoaderCircle className="h-4 w-4 animate-spin" />}
                                                                        {verifying ? t.verifying : t.verify}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openEdit(row, true)}
                                                                        className="inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-sm font-semibold text-teal-600 transition-colors duration-150 hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-400"
                                                                    >
                                                                        <ShieldPlus className="h-4 w-4" />
                                                                        {t.addInsurance}
                                                                    </button>
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    onClick={() => openBook(row)}
                                                                    className={`${outlineButton} h-10 !border-teal-600/60 !text-teal-700 hover:!bg-teal-500/10 dark:!border-teal-500/50 dark:!text-teal-300`}
                                                                >
                                                                    <Plus className="h-4 w-4" />
                                                                    {t.bookVisit}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setProfileId(row.id)}
                                                                    aria-label={`${t.viewProfile}: ${name}`}
                                                                    title={t.viewProfile}
                                                                    className={`${outlineButton} h-10 w-10 !px-0`}
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEdit(row)}
                                                                    aria-label={`${t.edit}: ${name}`}
                                                                    title={t.edit}
                                                                    className={`${outlineButton} h-10 w-10 !px-0`}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer: range + pagination */}
                            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row dark:border-slate-800">
                                <div className="text-sm text-slate-600 dark:text-slate-300">
                                    {showSkeleton ? (
                                        <Skeleton className="h-4 w-48" />
                                    ) : (
                                        <>
                                            {t.showing} <span dir="ltr">{fmtNumber(from, locale)}–{fmtNumber(to, locale)}</span> {t.of}{" "}
                                            <span dir="ltr">{fmtNumber(total, locale)}</span> {t.patients}
                                        </>
                                    )}
                                </div>

                                <nav aria-label={t.page} className="flex flex-wrap items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage <= 1 || showSkeleton}
                                        aria-label={t.previous}
                                        className={`${outlineButton} h-10 w-10 !px-0`}
                                    >
                                        <PrevIcon className="h-4 w-4" />
                                    </button>

                                    {pageWindow(currentPage, pageCount).map((item) =>
                                        typeof item === "number" ? (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => setPage(item)}
                                                aria-current={item === currentPage ? "page" : undefined}
                                                disabled={showSkeleton}
                                                className={`h-10 min-w-10 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 ${item === currentPage
                                                    ? "bg-teal-600 text-white"
                                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    }`}
                                            >
                                                <span dir="ltr">{fmtNumber(item, locale)}</span>
                                            </button>
                                        ) : (
                                            <span key={item} aria-hidden className="px-1 text-slate-400">…</span>
                                        ),
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                                        disabled={currentPage >= pageCount || showSkeleton}
                                        aria-label={t.next}
                                        className={`${outlineButton} h-10 w-10 !px-0`}
                                    >
                                        <NextIcon className="h-4 w-4" />
                                    </button>
                                </nav>
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            {/* Modals & drawer */}
            <AnimatePresence>
                {formModal !== null && (
                    <PatientFormModal
                        key={`form-${formModal.patientId ?? "new"}`}
                        locale={locale}
                        t={t}
                        patientId={formModal.patientId}
                        startInsured={formModal.startInsured}
                        options={options}
                        optionsLoading={optionsLoading}
                        onClose={() => setFormModal(null)}
                        onSaved={handleSaved}
                    />
                )}

                {bookPatient !== null && (
                    <BookVisitModal
                        key={`book-${bookPatient.id}`}
                        locale={locale}
                        t={t}
                        patient={bookPatient}
                        onClose={() => setBookPatient(null)}
                        onBooked={() => {
                            setBookPatient(null);
                            pushToast("success", tRef.current.toastBooked);
                            void load(true);
                        }}
                        onError={() => undefined}
                    />
                )}

                {profileId !== null && (
                    <ProfileDrawer
                        key={`profile-${profileId}`}
                        locale={locale}
                        t={t}
                        patientId={profileId}
                        verifying={busyId === profileId}
                        onClose={() => setProfileId(null)}
                        onBook={openBook}
                        onEdit={(row) => openEdit(row)}
                        onVerify={handleVerify}
                    />
                )}
            </AnimatePresence>

            {/* Toast stack (above modals / drawer / select panels) */}
            <div
                aria-live="polite"
                aria-atomic="false"
                className="pointer-events-none fixed bottom-4 end-4 z-[300] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:end-6"
            >
                <AnimatePresence initial={false}>
                    {toasts.map((toast) => {
                        const tone =
                            toast.kind === "success"
                                ? "border-emerald-500/40 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                                : toast.kind === "error"
                                    ? "border-rose-500/40 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                                    : "border-teal-500/40 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100";
                        const iconTone =
                            toast.kind === "success"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : toast.kind === "error"
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-teal-600 dark:text-teal-400";
                        const ToastIcon: IconComponent =
                            toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? CircleAlert : Info;

                        return (
                            <motion.div
                                key={toast.id}
                                layout
                                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                role={toast.kind === "error" ? "alert" : "status"}
                                className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl shadow-black/30 ${tone}`}
                            >
                                <ToastIcon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} />
                                <p className="min-w-0 flex-1 break-words leading-relaxed">{toast.message}</p>
                                <button
                                    type="button"
                                    onClick={() => dismissToast(toast.id)}
                                    aria-label={t.close}
                                    className="-me-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:hover:bg-slate-800 dark:hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}