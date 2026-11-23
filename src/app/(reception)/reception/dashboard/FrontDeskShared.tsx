// ============================================================================
// app/(reception)/reception/dashboard/FrontDeskShared.tsx
// Messages (AR/EN), shared class names, motion presets and formatters.
// ============================================================================
import type { Locale } from "@/lib/i18n/types";

const en = {
    pageTitle: "Front Desk / Today",
    breadcrumbRoot: "Reception",
    subtitle: "Live view of today's visits, coverage and billing",
    quickAppointment: "Quick Appointment",
    liveRealtime: "Live",
    livePolling: "Auto-refresh",
    liveConnecting: "Connecting",
    refresh: "Refresh",

    kpiAppointments: "Today's Appointments",
    kpiCompleted: "completed",
    kpiUpcoming: "upcoming",
    kpiWaiting: "In Waiting Room",
    kpiPatients: "Patients",
    kpiNphies: "NPHIES Status",
    kpiEligible: "Eligible",
    kpiAuthPending: "Auth Pending",
    kpiBilling: "Pending ZATCA Billing",
    kpiUnpaid: "Unpaid Visits",

    queueTitle: "Today's Live Patient Queue",
    tabAll: "All",
    tabScheduled: "Scheduled",
    tabWaiting: "Waiting",
    tabInClinic: "In Clinic",
    tabCompleted: "Completed",
    colTime: "Time & Token",
    colPatient: "Patient & National ID",
    colDoctor: "Doctor & Clinic",
    colCoverage: "Coverage / NPHIES",
    colStatus: "Visit Status",
    colActions: "Quick Actions",
    search: "Search patient, ID, token, doctor…",
    allClinics: "All clinics",
    resetFilters: "Reset filters",

    statusLabels: {
        SCHEDULED: "Scheduled",
        CONFIRMED: "Confirmed",
        WAITING: "Waiting",
        IN_PROGRESS: "In Clinic",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled",
        NO_SHOW: "No-show",
    },
    coverageLabels: {
        CASH: "Cash",
        ELIGIBLE: "Eligible",
        PRE_AUTH_PENDING: "Pre-Auth Pending",
        PARTIAL: "Partially Covered",
        INELIGIBLE: "Not Eligible",
        NOT_VERIFIED: "Not Verified",
    },
    nphiesStatus: {
        COMPLETE: "Complete",
        QUEUED: "Under review",
        PARTIAL: "Partial",
        ERROR: "Rejected",
    },
    codes: {
        ELIGIBLE: "Coverage is active and eligible.",
        NO_COVERAGE: "This patient has no insurance coverage on file.",
        PROVIDER_INACTIVE: "The insurance company is inactive.",
        MISSING_MEMBER_ID: "The insurance member ID is missing.",
        POLICY_INACTIVE: "The insurance policy is inactive.",
        POLICY_EXPIRED: "The insurance policy has expired.",
        POLICY_PENDING: "No policy is linked yet. Awaiting insurer review.",
        PARTIAL_COVERAGE: "Coverage is only partially confirmed.",
        NPHIES_ERROR: "NPHIES could not complete the eligibility check. Please try again.",
    },

    checkIn: "Check-In",
    verifyNphies: "Verify NPHIES",
    createInvoice: "Create Invoice",
    viewInvoice: "View Invoice",
    checkedIn: "Checked in",
    rowActions: "More actions",
    menuConfirm: "Confirm appointment",
    menuCheckIn: "Check-In",
    menuSendToClinic: "Send to clinic",
    menuCancel: "Cancel appointment",
    menuNoShow: "Mark as no-show",
    confirmCancel: "Cancel this appointment?",
    confirmNoShow: "Mark this patient as a no-show?",

    empty: "No visits match your view.",
    emptyToday: "No appointments for today yet.",
    loadFailed: "Unable to load the front desk.",
    retry: "Retry",
    previous: "Previous page",
    next: "Next page",
    showing: "Showing",
    of: "of",
    visits: "visits",

    registerPatient: "+ Register New Patient",
    instantCheck: "Instant NPHIES Eligibility Check",
    walkIn: "Walk-in Visit",
    feedTitle: "Live NPHIES Feed",
    feedEmpty: "No NPHIES activity yet.",
    feedCopay: "Co-pay {value}%",
    feedPolicyInactive: "Policy inactive for {name}",
    nphiesSimulator: "Simulator",
    nphiesProduction: "Production",
    feed: {
        ELIGIBILITY: {
            COMPLETE: "Eligibility check completed for {name}",
            QUEUED: "Eligibility pending for {name}",
            PARTIAL: "Eligibility partially confirmed for {name}",
            ERROR: "Eligibility check failed for {name}",
        },
        PRE_AUTHORIZATION: {
            COMPLETE: "Approval #{ref} Approved",
            QUEUED: "Auth pending • {name}",
            PARTIAL: "Approval #{ref} partially approved",
            ERROR: "Approval #{ref} rejected",
        },
        CLAIM: {
            COMPLETE: "Claim #{ref} accepted",
            QUEUED: "Claim #{ref} under review",
            PARTIAL: "Claim #{ref} partially accepted",
            ERROR: "Claim #{ref} rejected",
        },
        E_PRESCRIPTION: {
            COMPLETE: "E-prescription #{ref} approved",
            QUEUED: "E-prescription #{ref} pending",
            PARTIAL: "E-prescription #{ref} partially approved",
            ERROR: "E-prescription #{ref} rejected",
        },
        POLL: {
            COMPLETE: "Status check #{ref} completed",
            QUEUED: "Status check #{ref} still pending",
            PARTIAL: "Status check #{ref} partially resolved",
            ERROR: "Status check #{ref} failed",
        },
    },
    unknownPatient: "a patient",

    toastBooked: "Appointment booked successfully.",
    toastWalkIn: "Walk-in added to the waiting room.",
    toastCheckedIn: "Patient checked in.",
    toastConfirmed: "Appointment confirmed.",
    toastSentToClinic: "Patient sent to the clinic.",
    toastCancelled: "Appointment cancelled.",
    toastNoShow: "Marked as no-show.",
    toastEligible: "Coverage verified:",
    toastEligibilityPending: "Eligibility is under insurer review.",
    toastEligibilityPartial: "Coverage is only partially confirmed.",
    failed: "The operation could not be completed. Please try again.",
    close: "Close",
    cancel: "Cancel",
    loading: "Loading…",
    none: "—",

    patientSearch: "Search by name, ID, file no. or phone",
    patientLabel: "Patient",
    change: "Change",
    noPatients: "No patients found.",
    registerInstead: "Register a new patient",
    searching: "Searching…",
    errPatient: "Select a patient.",
    errDoctor: "Select a doctor.",
    errSlot: "Select a time slot.",

    qaTitle: "Quick Appointment",
    qaClinic: "Clinic",
    qaChooseClinic: "Select clinic",
    qaDoctor: "Doctor",
    qaChooseDoctor: "Select doctor",
    qaDate: "Date",
    qaSlots: "Available slots",
    qaPickDoctor: "Select a clinic and doctor first.",
    qaNoSlots: "No available slots on this date.",
    qaNoDoctors: "No doctors with active shifts in this clinic.",
    qaReason: "Reason for visit (optional)",
    qaBook: "Book Appointment",
    qaBooking: "Booking…",

    wiTitle: "Walk-in Visit",
    wiHint: "The patient is added to the waiting room immediately.",
    wiDoctor: "Doctor",
    wiChooseDoctor: "Select doctor",
    wiOffDuty: "off duty",
    wiAdd: "Add to Waiting Room",
    wiAdding: "Adding…",

    elTitle: "Instant NPHIES Eligibility Check",
    elHint: "Enter the National ID / Iqama of a registered patient.",
    elNationalId: "National ID / Iqama",
    elNationalIdPlaceholder: "10-digit ID number",
    elInvalidId: "Enter a valid 10-digit ID starting with 1 or 2.",
    elRun: "Check Eligibility",
    elRunning: "Checking…",
    elPatient: "Patient",
    elStatus: "Result",
    elPayer: "Insurer",
    elPolicy: "Policy",
    elCopay: "Co-pay",
    elReference: "Reference",
    elLatency: "Response time",
    elMode: "NPHIES mode",
    elCashFallback: "Policy inactive — collect payment in cash from the patient.",
    elCopayPercent: "{value}%",
    elCopayFixed: "{value} SAR fixed",
    elCopayCap: "cap {value} SAR",
};

const ar: typeof en = {
    pageTitle: "مكتب الاستقبال / اليوم",
    breadcrumbRoot: "الاستقبال",
    subtitle: "نظرة مباشرة على زيارات اليوم والتغطية التأمينية والفوترة",
    quickAppointment: "حجز موعد سريع",
    liveRealtime: "مباشر",
    livePolling: "تحديث تلقائي",
    liveConnecting: "جارٍ الاتصال",
    refresh: "تحديث",

    kpiAppointments: "مواعيد اليوم",
    kpiCompleted: "مكتملة",
    kpiUpcoming: "قادمة",
    kpiWaiting: "في غرفة الانتظار",
    kpiPatients: "مرضى",
    kpiNphies: "حالة نفيس",
    kpiEligible: "مؤهّل",
    kpiAuthPending: "بانتظار الموافقة",
    kpiBilling: "فوترة زاتكا المعلّقة",
    kpiUnpaid: "زيارات غير مفوترة",

    queueTitle: "قائمة المرضى المباشرة لليوم",
    tabAll: "الكل",
    tabScheduled: "مجدول",
    tabWaiting: "في الانتظار",
    tabInClinic: "في العيادة",
    tabCompleted: "مكتمل",
    colTime: "الوقت والرمز",
    colPatient: "المريض والهوية",
    colDoctor: "الطبيب والعيادة",
    colCoverage: "التغطية / نفيس",
    colStatus: "حالة الزيارة",
    colActions: "إجراءات سريعة",
    search: "ابحث بالمريض أو الهوية أو الرمز أو الطبيب…",
    allClinics: "جميع العيادات",
    resetFilters: "إعادة ضبط التصفية",

    statusLabels: {
        SCHEDULED: "مجدول",
        CONFIRMED: "مؤكد",
        WAITING: "في الانتظار",
        IN_PROGRESS: "في العيادة",
        COMPLETED: "مكتمل",
        CANCELLED: "ملغي",
        NO_SHOW: "لم يحضر",
    },
    coverageLabels: {
        CASH: "نقدي",
        ELIGIBLE: "مؤهّل",
        PRE_AUTH_PENDING: "بانتظار الموافقة المسبقة",
        PARTIAL: "تغطية جزئية",
        INELIGIBLE: "غير مؤهّل",
        NOT_VERIFIED: "لم يتم التحقق",
    },
    nphiesStatus: {
        COMPLETE: "مكتمل",
        QUEUED: "قيد المراجعة",
        PARTIAL: "جزئي",
        ERROR: "مرفوض",
    },
    codes: {
        ELIGIBLE: "التغطية سارية والمريض مؤهّل.",
        NO_COVERAGE: "لا توجد تغطية تأمينية مسجلة لهذا المريض.",
        PROVIDER_INACTIVE: "شركة التأمين غير نشطة.",
        MISSING_MEMBER_ID: "رقم عضوية التأمين غير متوفر.",
        POLICY_INACTIVE: "وثيقة التأمين غير نشطة.",
        POLICY_EXPIRED: "انتهت صلاحية وثيقة التأمين.",
        POLICY_PENDING: "لا توجد وثيقة مرتبطة بعد. بانتظار مراجعة شركة التأمين.",
        PARTIAL_COVERAGE: "التغطية مؤكدة جزئيًا فقط.",
        NPHIES_ERROR: "تعذّر إتمام فحص الأهلية عبر منصة نفيس. يرجى المحاولة مرة أخرى.",
    },

    checkIn: "تسجيل الوصول",
    verifyNphies: "التحقق من نفيس",
    createInvoice: "إنشاء فاتورة",
    viewInvoice: "عرض الفاتورة",
    checkedIn: "تم تسجيل الوصول",
    rowActions: "المزيد من الإجراءات",
    menuConfirm: "تأكيد الموعد",
    menuCheckIn: "تسجيل الوصول",
    menuSendToClinic: "إدخال إلى العيادة",
    menuCancel: "إلغاء الموعد",
    menuNoShow: "تسجيل عدم الحضور",
    confirmCancel: "هل تريد إلغاء هذا الموعد؟",
    confirmNoShow: "تسجيل هذا المريض كغائب (لم يحضر)؟",

    empty: "لا توجد زيارات مطابقة.",
    emptyToday: "لا توجد مواعيد لهذا اليوم بعد.",
    loadFailed: "تعذر تحميل مكتب الاستقبال.",
    retry: "إعادة المحاولة",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
    showing: "عرض",
    of: "من",
    visits: "زيارة",

    registerPatient: "+ تسجيل مريض جديد",
    instantCheck: "فحص أهلية نفيس الفوري",
    walkIn: "زيارة بدون موعد",
    feedTitle: "بث نفيس المباشر",
    feedEmpty: "لا يوجد نشاط في نفيس بعد.",
    feedCopay: "نسبة التحمّل {value}%",
    feedPolicyInactive: "وثيقة التأمين غير فعالة للمريض {name}",
    nphiesSimulator: "محاكي",
    nphiesProduction: "إنتاج",
    feed: {
        ELIGIBILITY: {
            COMPLETE: "اكتمل فحص الأهلية للمريض {name}",
            QUEUED: "فحص الأهلية قيد المراجعة للمريض {name}",
            PARTIAL: "تأكدت الأهلية جزئيًا للمريض {name}",
            ERROR: "فشل فحص الأهلية للمريض {name}",
        },
        PRE_AUTHORIZATION: {
            COMPLETE: "تمت الموافقة #{ref}",
            QUEUED: "موافقة معلّقة • {name}",
            PARTIAL: "موافقة جزئية #{ref}",
            ERROR: "تم رفض الموافقة #{ref}",
        },
        CLAIM: {
            COMPLETE: "تم قبول المطالبة #{ref}",
            QUEUED: "المطالبة #{ref} قيد المراجعة",
            PARTIAL: "قبول جزئي للمطالبة #{ref}",
            ERROR: "تم رفض المطالبة #{ref}",
        },
        E_PRESCRIPTION: {
            COMPLETE: "تمت الموافقة على الوصفة #{ref}",
            QUEUED: "الوصفة #{ref} قيد الانتظار",
            PARTIAL: "موافقة جزئية على الوصفة #{ref}",
            ERROR: "تم رفض الوصفة #{ref}",
        },
        POLL: {
            COMPLETE: "اكتملت متابعة الحالة #{ref}",
            QUEUED: "متابعة الحالة #{ref} ما زالت معلّقة",
            PARTIAL: "تمت متابعة الحالة #{ref} جزئيًا",
            ERROR: "فشلت متابعة الحالة #{ref}",
        },
    },
    unknownPatient: "مريض",

    toastBooked: "تم حجز الموعد بنجاح.",
    toastWalkIn: "تمت إضافة الزيارة إلى غرفة الانتظار.",
    toastCheckedIn: "تم تسجيل وصول المريض.",
    toastConfirmed: "تم تأكيد الموعد.",
    toastSentToClinic: "تم إدخال المريض إلى العيادة.",
    toastCancelled: "تم إلغاء الموعد.",
    toastNoShow: "تم تسجيل عدم الحضور.",
    toastEligible: "تم التحقق من التغطية:",
    toastEligibilityPending: "الأهلية قيد مراجعة شركة التأمين.",
    toastEligibilityPartial: "التغطية مؤكدة جزئيًا فقط.",
    failed: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
    close: "إغلاق",
    cancel: "إلغاء",
    loading: "جارٍ التحميل…",
    none: "—",

    patientSearch: "ابحث بالاسم أو الهوية أو رقم الملف أو الجوال",
    patientLabel: "المريض",
    change: "تغيير",
    noPatients: "لم يتم العثور على مرضى.",
    registerInstead: "تسجيل مريض جديد",
    searching: "جارٍ البحث…",
    errPatient: "اختر المريض.",
    errDoctor: "اختر الطبيب.",
    errSlot: "اختر وقتًا للموعد.",

    qaTitle: "حجز موعد سريع",
    qaClinic: "العيادة",
    qaChooseClinic: "اختر العيادة",
    qaDoctor: "الطبيب",
    qaChooseDoctor: "اختر الطبيب",
    qaDate: "التاريخ",
    qaSlots: "الأوقات المتاحة",
    qaPickDoctor: "اختر العيادة والطبيب أولاً.",
    qaNoSlots: "لا توجد أوقات متاحة في هذا التاريخ.",
    qaNoDoctors: "لا يوجد أطباء لديهم دوام نشط في هذه العيادة.",
    qaReason: "سبب الزيارة (اختياري)",
    qaBook: "حجز الموعد",
    qaBooking: "جارٍ الحجز…",

    wiTitle: "زيارة بدون موعد",
    wiHint: "تتم إضافة المريض إلى غرفة الانتظار مباشرة.",
    wiDoctor: "الطبيب",
    wiChooseDoctor: "اختر الطبيب",
    wiOffDuty: "خارج الدوام",
    wiAdd: "إضافة إلى غرفة الانتظار",
    wiAdding: "جارٍ الإضافة…",

    elTitle: "فحص أهلية نفيس الفوري",
    elHint: "أدخل رقم الهوية / الإقامة لمريض مسجّل.",
    elNationalId: "رقم الهوية / الإقامة",
    elNationalIdPlaceholder: "رقم من 10 أرقام",
    elInvalidId: "أدخل رقمًا من 10 أرقام يبدأ بـ 1 أو 2.",
    elRun: "فحص الأهلية",
    elRunning: "جارٍ الفحص…",
    elPatient: "المريض",
    elStatus: "النتيجة",
    elPayer: "شركة التأمين",
    elPolicy: "الوثيقة",
    elCopay: "نسبة التحمّل",
    elReference: "المرجع",
    elLatency: "زمن الاستجابة",
    elMode: "وضع نفيس",
    elCashFallback: "وثيقة التأمين غير فعالة — يرجى تحصيل المبلغ نقدًا من المريض.",
    elCopayPercent: "{value}%",
    elCopayFixed: "{value} ريال ثابت",
    elCopayCap: "بحد أقصى {value} ريال",
};

export const messages = { en, ar } as const;
export type Messages = (typeof messages)[Locale];

export function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * Localizes a server-action error: when the action's error `code` has a dedicated message
 * (NO_COVERAGE, PROVIDER_INACTIVE, MISSING_MEMBER_ID, ...), use it; otherwise fall back to the
 * server text, then to the generic failure message.
 */
export function actionErrorMessage(
    t: Messages,
    code: string | undefined,
    fallback: string | undefined,
): string {
    if (code !== undefined && Object.prototype.hasOwnProperty.call(t.codes, code)) {
        return t.codes[code as keyof Messages["codes"]];
    }

    return fallback ?? t.failed;
}

/* ------------------------------ styles ------------------------------ */

export const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

export const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:border-teal-500 hover:text-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const cardSurface =
    "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60";

/* Custom dropdown (SelectBox) — dark slate surface, teal-500 border on open/focus. */

export const selectTriggerClass =
    "flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-start text-sm text-slate-900 outline-none transition-colors duration-150 hover:border-teal-500/60 focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";

export const selectTriggerOpenClass = "!border-teal-500 ring-2 ring-teal-500/20";

export const selectPanelClass =
    "z-[160] overflow-y-auto rounded-xl border border-teal-500 bg-white p-1.5 text-sm shadow-2xl shadow-black/40 dark:bg-slate-950";

export const selectOptionClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-slate-800 transition-colors duration-150 dark:text-slate-200";

export const selectOptionSelectedClass =
    "bg-teal-500/15 font-semibold text-teal-700 dark:text-teal-300";

export const selectOptionActiveClass = "bg-teal-500/10";

export const selectGroupLabelClass =
    "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export const backdropMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeOut" },
} as const;

export const panelMotion = {
    initial: { opacity: 0, scale: 0.96, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: 10 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
} as const;

/* ----------------------------- formatters ----------------------------- */

function intlTag(locale: Locale): string {
    return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US";
}

export function formatTime(iso: string, timeZone: string, locale: Locale): string {
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

export function formatLongDate(date: string, locale: Locale): string {
    const [y, m, d] = date.split("-").map(Number);

    return new Intl.DateTimeFormat(intlTag(locale), {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

export function relativeTime(iso: string, nowMs: number, locale: Locale): string {
    const seconds = Math.round((new Date(iso).getTime() - nowMs) / 1000);
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto", style: "narrow" });

    if (abs < 30) return rtf.format(0, "second");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");

    return rtf.format(Math.round(seconds / 86_400), "day");
}

export function displayDoctor(name: string, locale: Locale): string {
    if (/^(dr\.?|د\.?)\s/i.test(name)) return name;

    return locale === "ar" ? `د. ${name}` : `Dr. ${name}`;
}

export function shortRef(reference: string): string {
    return reference.split("-").pop() ?? reference;
}

export function addDaysToDate(date: string, days: number): string {
    const [y, m, d] = date.split("-").map(Number);

    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}