// src/app/(admin)/admin/clinical/providers/page.tsx

"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import {
    DoctorProfessionalRank,
    IdentityType,
} from "@prisma/client";
import {
    Activity,
    BriefcaseMedical,
    Building2,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    FileBadge,
    Filter,
    LoaderCircle,
    Mail,
    Plus,
    Search,
    Send,
    Stethoscope,
    UserRound,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    createDoctorAction,
    getDoctorFormOptions,
    getDoctorsAction,
    type CreateDoctorInput,
    type DoctorActionResult,
    type DoctorRow,
} from "@/actions/ProvidersActions";

const PAGE_SIZE = 8;

type DoctorListItem = Omit<DoctorRow, "services"> & {
    accountStatus: "ACTIVE" | "INVITED" | "NO_ACCOUNT";
    services: Array<{ id: string; name: string }>;
};

type DoctorFormOptions = {
    clinics: Array<{ id: string; nameEn: string; nameAr: string; isActive: boolean }>;
    services: Array<{ id: string; clinicId: string; nameEn: string; nameAr: string; code: string; isActive: boolean }>;
};

function toListItem(doctor: DoctorRow, locale: Locale): DoctorListItem {
    return {
        ...doctor,
        clinicName: doctor.clinicName,
        accountStatus: doctor.accountStatus,
        services: doctor.services.map((service) => ({
            id: service.id,
            name: locale === "ar" ? service.nameAr : service.nameEn,
        })),
    };
}

type FormErrors = Partial<
    Record<
        | "email"
        | "firstName"
        | "lastName"
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

const messages = {
    en: {
        title: "Doctors & Healthcare Practitioners",
        subtitle: "Manage clinical profiles, credentials and access",
        add: "Add New Doctor",
        search: "Search doctors, ID or license",
        allClinics: "All clinics",
        allStatuses: "All statuses",
        filters: "Reset filters",
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
        empty: "No doctors found.",
        loading: "Loading doctors…",
        retry: "Retry",
        modal: "Add New Doctor & Practitioner",
        credentials: "Authentication & Credentials",
        email: "Doctor Email",
        firstName: "First Name",
        lastName: "Last Name",
        inviteHint:
            "An invitation email will be sent to set up the doctor's password.",
        medical: "Medical & Licensing",
        identityType: "Identity Type",
        national: "National ID",
        iqama: "Iqama",
        rank: "Professional Rank",
        specialty: "Specialty",
        chooseRank: "Select professional rank",
        enterSpecialty: "Enter specialty",
        integration: "System & Financial Integration",
        chooseClinic: "Select clinic",
        chooseServices: "Select one or more services",
        selectClinicFirst: "Please select a clinic first.",
        noServices: "No active services are available for this clinic.",
        noClinics: "No active clinics available.",
        commissionInput: "Doctor Commission (%)",
        save: "Save & Send Invite",
        saving: "Creating doctor…",
        cancel: "Cancel",
        close: "Close",
        invalidEmail: "Enter a valid email address.",
        invalidName: "Enter between 2 and 100 characters.",
        invalidNational: "Enter a valid 10-digit national ID.",
        invalidIqama: "Enter a valid 10-digit Iqama beginning with 2.",
        invalidLicense: "Enter a valid SCFHS license number.",
        invalidRank: "Select a professional rank.",
        invalidSpecialty: "Enter a specialty between 2 and 150 characters.",
        invalidClinic: "Select an active clinic.",
        invalidServices: "Select at least one service from the selected clinic.",
        invalidCommission:
            "Enter a commission between 0 and 100 with at most two decimal places.",
        failed: "The operation could not be completed. Please try again.",
        emailFailed:
            "The doctor was created, but the invitation email could not be sent.",
        success: "Doctor created and invitation sent successfully.",
        previous: "Previous page",
        next: "Next page",
        showing: "Showing",
        of: "of",
        doctors: "doctors",
        optionsError: "Unable to load clinics and services.",
        closeError: "Unable to load doctors.",
        retryLoading: "Reload",
    },
    ar: {
        title: "الأطباء والممارسين الصحيين",
        subtitle: "إدارة الملفات المهنية والتراخيص وصلاحيات الوصول",
        add: "إضافة طبيب جديد",
        search: "البحث بالاسم أو الهوية أو الترخيص",
        allClinics: "جميع العيادات",
        allStatuses: "جميع الحالات",
        filters: "إعادة ضبط التصفية",
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
        empty: "لا توجد نتائج.",
        loading: "جارٍ تحميل الأطباء…",
        retry: "إعادة المحاولة",
        modal: "إضافة طبيب وممارس جديد",
        credentials: "بيانات الدخول والتواصل",
        email: "البريد الإلكتروني للطبيب",
        firstName: "الاسم الأول",
        lastName: "اسم العائلة",
        inviteHint: "سيتم إرسال دعوة للطبيب لإعداد كلمة المرور وتفعيل الحساب.",
        medical: "البيانات الطبية والتراخيص",
        identityType: "نوع الهوية",
        national: "هوية وطنية",
        iqama: "إقامة",
        rank: "المرتبة المهنية",
        specialty: "التخصص",
        chooseRank: "اختر المرتبة المهنية",
        enterSpecialty: "أدخل التخصص",
        integration: "إعدادات النظام والمالية",
        chooseClinic: "اختر العيادة",
        chooseServices: "اختر خدمة واحدة أو أكثر",
        selectClinicFirst: "يرجى اختيار العيادة أولاً.",
        noServices: "لا توجد خدمات نشطة لهذه العيادة.",
        noClinics: "لا توجد عيادات نشطة.",
        commissionInput: "عمولة الطبيب (%)",
        save: "حفظ وإرسال الدعوة",
        saving: "جارٍ إنشاء الطبيب…",
        cancel: "إلغاء",
        close: "إغلاق",
        invalidEmail: "أدخل بريدًا إلكترونيًا صحيحًا.",
        invalidName: "أدخل من حرفين إلى 100 حرف.",
        invalidNational: "أدخل رقم هوية وطنية صحيحًا مكونًا من 10 أرقام.",
        invalidIqama: "أدخل رقم إقامة صحيحًا من 10 أرقام يبدأ بالرقم 2.",
        invalidLicense: "أدخل رقم ترخيص صحيحًا.",
        invalidRank: "اختر المرتبة المهنية.",
        invalidSpecialty: "أدخل تخصصًا من حرفين إلى 150 حرفًا.",
        invalidClinic: "اختر عيادة نشطة.",
        invalidServices: "اختر خدمة واحدة على الأقل من العيادة المحددة.",
        invalidCommission: "أدخل عمولة بين 0 و100 وبحد أقصى منزلتين عشريتين.",
        failed: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
        emailFailed: "تم إنشاء الطبيب، لكن تعذر إرسال الدعوة.",
        success: "تم إنشاء الطبيب وإرسال الدعوة بنجاح.",
        previous: "الصفحة السابقة",
        next: "الصفحة التالية",
        showing: "عرض",
        of: "من",
        doctors: "طبيب",
        optionsError: "تعذر تحميل العيادات والخدمات.",
        closeError: "تعذر تحميل الأطباء.",
        retryLoading: "إعادة التحميل",
    },
} as const;

type Messages = (typeof messages)[Locale];

const rankLabels: Record<
    DoctorProfessionalRank,
    { en: string; ar: string }
> = {
    CONSULTANT: { en: "Consultant", ar: "استشاري" },
    SPECIALIST: { en: "Specialist", ar: "أخصائي" },
    RESIDENT: { en: "Resident", ar: "طبيب مقيم" },
    GENERAL_PRACTITIONER: {
        en: "General Practitioner",
        ar: "طبيب عام",
    },
    REGISTRAR: { en: "Registrar", ar: "مسجل" },
};

const baseInput =
    "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-slate-950";

function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

function maskIdentity(value: string): string {
    return value.length > 4
        ? `${value.slice(0, 2)}•••••${value.slice(-4)}`
        : value;
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <label className="block min-w-0">
            <span className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                {label} <span className="text-teal-600">*</span>
            </span>
            {children}
            {error && (
                <span
                    role="alert"
                    className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                >
                    {error}
                </span>
            )}
        </label>
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
            <Icon className="h-6 w-6 shrink-0 text-teal-600 dark:text-teal-500" />
            <h3 className="shrink-0 text-sm font-bold text-slate-800 dark:text-slate-100">
                {children}
            </h3>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
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
    const label =
        status === "ACTIVE"
            ? t.active
            : status === "INVITED"
                ? t.invited
                : t.noAccount;

    return (
        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-teal-600/10 px-3 py-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
            <span className="h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-500" />
            {label}
        </span>
    );
}

function validateForm(
    data: FormData,
    options: DoctorFormOptions,
    t: Messages,
): { input?: CreateDoctorInput; errors: FormErrors } {
    const errors: FormErrors = {};

    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const firstName = String(data.get("firstName") ?? "").trim();
    const lastName = String(data.get("lastName") ?? "").trim();
    const nationalId = String(data.get("nationalId") ?? "").trim();
    const identityType = String(data.get("identityType") ?? "");
    const scfhsLicenseNumber = String(
        data.get("scfhsLicenseNumber") ?? "",
    ).trim();
    const professionalRank = String(data.get("professionalRank") ?? "");
    const specialty = String(data.get("specialty") ?? "").trim();
    const clinicId = String(data.get("clinicId") ?? "");
    const serviceIds = data.getAll("serviceIds").filter(
        (value): value is string => typeof value === "string",
    );
    const commissionText = String(data.get("commissionRate") ?? "").trim();
    const commissionRate = Number(commissionText);

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        errors.email = t.invalidEmail;
    }

    if (
        firstName.length < 1 ||
        firstName.length > 100 ||
        /[<>]/.test(firstName)
    ) {
        errors.firstName = t.invalidName;
    }

    if (
        lastName.length < 1 ||
        lastName.length > 100 ||
        /[<>]/.test(lastName)
    ) {
        errors.lastName = t.invalidName;
    }

    if (
        identityType === IdentityType.NATIONAL_ID
            ? !/^1\d{9}$/.test(nationalId)
            : identityType === IdentityType.IQAMA
                ? !/^2\d{9}$/.test(nationalId)
                : true
    ) {
        errors.nationalId =
            identityType === IdentityType.IQAMA
                ? t.invalidIqama
                : t.invalidNational;
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

    if (
        specialty.length < 2 ||
        specialty.length > 120 ||
        /[<>]/.test(specialty)
    ) {
        errors.specialty = t.invalidSpecialty;
    }

    if (!options.clinics.some((clinic) => clinic.id === clinicId)) {
        errors.clinicId = t.invalidClinic;
    }

    const validServiceIds = new Set(
        options.services
            .filter((service) => service.clinicId === clinicId)
            .map((service) => service.id),
    );

    if (
        serviceIds.length === 0 ||
        serviceIds.some((id) => !validServiceIds.has(id))
    ) {
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
            clinicId,
            serviceIds: [...new Set(serviceIds)],
            commissionRate,
        },
    };
}

export default function DoctorsManagementPage() {
    const [locale, setLocale] = useState<Locale>("ar");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [doctors, setDoctors] = useState<DoctorRow[]>([]);
    const [options, setOptions] = useState<DoctorFormOptions>({
        clinics: [],
        services: [],
    });
    const [loading, setLoading] = useState(true);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [optionsError, setOptionsError] = useState("");
    const [query, setQuery] = useState("");
    const [clinicFilter, setClinicFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedClinicId, setSelectedClinicId] = useState("");
    const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
    const [errors, setErrors] = useState<FormErrors>({});
    const [formError, setFormError] = useState("");
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
        observer.observe(root, {
            attributes: true,
            attributeFilter: ["lang", "dir"],
        });

        return () => observer.disconnect();
    }, []);

    const loadDoctors = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const first = await getDoctorsAction({ page: 1, pageSize: 100 });
            if (!first.success || !first.data) {
                setLoadError(first.error ?? t.closeError);
                setDoctors([]);
                return;
            }
            const rows = [...first.data.doctors];
            for (let nextPage = 2; nextPage <= first.data.totalPages; nextPage++) {
                const next = await getDoctorsAction({ page: nextPage, pageSize: 100 });
                if (!next.success || !next.data) {
                    setLoadError(next.error ?? t.closeError);
                    setDoctors([]);
                    return;
                }
                rows.push(...next.data.doctors);
            }
            setDoctors(rows);
        } catch {
            setLoadError(t.closeError);
            setDoctors([]);
        } finally {
            setLoading(false);
        }
    }, [t.closeError]);

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

    const clinicName = useCallback(
        (clinic: DoctorFormOptions["clinics"][number]) =>
            isRtl ? clinic.nameAr : clinic.nameEn,
        [isRtl],
    );

    const serviceName = useCallback(
        (service: DoctorFormOptions["services"][number]) =>
            isRtl ? service.nameAr : service.nameEn,
        [isRtl],
    );

    const filteredServices = useMemo(
        () =>
            selectedClinicId
                ? options.services.filter(
                    (service) => service.clinicId === selectedClinicId,
                )
                : [],
        [options.services, selectedClinicId],
    );

    const displayDoctors = useMemo(() => doctors.map((doctor) => toListItem(doctor, locale)), [doctors, locale]);

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

    const totalPages = Math.max(
        1,
        Math.ceil(filteredDoctors.length / PAGE_SIZE),
    );
    const currentPage = Math.min(page, totalPages);
    const visibleDoctors = filteredDoctors.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    useEffect(() => {
        setPage(1);
    }, [query, clinicFilter, statusFilter]);

    function openModal() {
        setNotice(null);
        setErrors({});
        setFormError("");
        setSelectedClinicId("");
        setSelectedServiceIds([]);
        setModalOpen(true);
        void loadOptions();
    }

    function changeClinic(clinicId: string) {
        setSelectedClinicId(clinicId);
        setSelectedServiceIds([]);
        setErrors((current) => ({
            ...current,
            clinicId: undefined,
            serviceIds: undefined,
        }));
    }

    function toggleService(serviceId: string, checked: boolean) {
        setSelectedServiceIds((current) =>
            checked
                ? [...new Set([...current, serviceId])]
                : current.filter((id) => id !== serviceId),
        );

        setErrors((current) => ({
            ...current,
            serviceIds: undefined,
        }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");
        setNotice(null);

        if (optionsLoading || optionsError) {
            setFormError(optionsError || t.optionsError);
            return;
        }

        const formData = new FormData(event.currentTarget);
        formData.delete("serviceIds");

        selectedServiceIds.forEach((id) => {
            formData.append("serviceIds", id);
        });

        const validation = validateForm(formData, options, t);
        setErrors(validation.errors);

        if (!validation.input) return;

        setSaving(true);

        try {
            const result: DoctorActionResult<{ doctor: DoctorRow; emailSent: boolean }> =
                await createDoctorAction(validation.input);

            if (result.data) {
                const created = result.data.doctor;
                setDoctors((current) => [created, ...current.filter((doctor) => doctor.id !== created.id)]);
                setModalOpen(false);
                setNotice(result.data.emailSent
                    ? { kind: "success", message: t.success }
                    : { kind: "error", message: result.error ?? t.emailFailed });
                return;
            }
            setFormError(result.error ?? t.failed);
        } catch {
            setFormError(t.failed);
        } finally {
            setSaving(false);
        }
    }

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
                    <AdminHeader
                        locale={locale}
                        onMenuOpen={() => setSidebarOpen(true)}
                    />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                            <div>
                                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span>{isRtl ? "الإدارة" : "Admin"}</span>
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    <span className="font-medium text-teal-700 dark:text-teal-400">
                                        {t.title}
                                    </span>
                                </div>

                                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                                    {t.title}
                                </h1>

                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {t.subtitle}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={openModal}
                                className={tealButton}
                            >
                                <Plus className="h-5 w-5" />
                                {t.add}
                            </button>
                        </header>

                        {notice && (
                            <div
                                role="status"
                                className="flex items-center gap-3 rounded-xl border border-teal-600/30 bg-teal-600/5 p-4 text-sm"
                            >
                                {notice.kind === "success" ? (
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />
                                ) : (
                                    <CircleAlert className="h-5 w-5 shrink-0 text-teal-600" />
                                )}

                                <p className="flex-1">{notice.message}</p>

                                <button
                                    type="button"
                                    onClick={() => setNotice(null)}
                                    aria-label={t.close}
                                    className="rounded-md p-1 hover:bg-teal-600/10"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1.6fr)_minmax(180px,1fr)_minmax(160px,.9fr)_auto]">
                            <label className="relative block">
                                <Search className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t.search}
                                    className={`${baseInput} h-[54px] ps-12`}
                                />
                            </label>

                            <label className="relative block">
                                <Building2 className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <select
                                    value={clinicFilter}
                                    onChange={(event) => setClinicFilter(event.target.value)}
                                    className={`${baseInput} h-[54px] appearance-none ps-12 pe-10`}
                                >
                                    <option value="ALL">{t.allClinics}</option>
                                    {options.clinics.map((clinic) => (
                                        <option key={clinic.id} value={clinic.id}>
                                            {clinicName(clinic)}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </label>

                            <label className="relative block">
                                <UserRound className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                <select
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value)}
                                    className={`${baseInput} h-[54px] appearance-none ps-12 pe-10`}
                                >
                                    <option value="ALL">{t.allStatuses}</option>
                                    <option value="ACTIVE">{t.active}</option>
                                    <option value="INVITED">{t.invited}</option>
                                    <option value="NO_ACCOUNT">{t.noAccount}</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </label>

                            <button
                                type="button"
                                onClick={() => {
                                    setQuery("");
                                    setClinicFilter("ALL");
                                    setStatusFilter("ALL");
                                }}
                                className="inline-flex h-[54px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold transition hover:border-teal-600 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:text-teal-400"
                            >
                                <Filter className="h-4 w-4" />
                                {t.filters}
                            </button>
                        </section>

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                            {loadError ? (
                                <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                                    <CircleAlert className="h-8 w-8 text-teal-600" />
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
                                        <table className="w-full min-w-[1050px] border-collapse text-start">
                                            <thead>
                                                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <th className="px-5 py-4 text-start">{t.profile}</th>
                                                    <th className="px-4 py-4 text-start">{t.nationalId}</th>
                                                    <th className="px-4 py-4 text-start">{t.license}</th>
                                                    <th className="px-4 py-4 text-start">{t.clinic}</th>
                                                    <th className="px-4 py-4 text-start">{t.services}</th>
                                                    <th className="px-4 py-4 text-start">{t.commission}</th>
                                                    <th className="px-4 py-4 text-start">{t.status}</th>
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                                {loading ? (
                                                    <tr>
                                                        <td colSpan={7} className="h-56 text-center">
                                                            <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-teal-600" />
                                                            <span className="mt-3 block text-sm text-slate-500">
                                                                {t.loading}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : visibleDoctors.length === 0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={7}
                                                            className="h-56 text-center text-sm text-slate-500"
                                                        >
                                                            {t.empty}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    visibleDoctors.map((doctor) => (
                                                        <tr
                                                            key={doctor.id}
                                                            className="transition hover:bg-teal-600/[0.03]"
                                                        >
                                                            <td className="px-5 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-600/10 font-bold text-teal-700 dark:text-teal-400">
                                                                        {initials(doctor.fullName)}
                                                                    </div>

                                                                    <div className="min-w-0">
                                                                        <p className="max-w-56 truncate text-sm font-bold">
                                                                            {doctor.fullName}
                                                                        </p>
                                                                        <p className="mt-1 max-w-56 truncate text-xs text-slate-500">
                                                                            {rankLabels[doctor.professionalRank][locale]}{" "}
                                                                            · {doctor.specialty}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td className="px-4 py-4 text-sm">
                                                                <span dir="ltr">
                                                                    {maskIdentity(doctor.nationalId)}
                                                                </span>
                                                            </td>

                                                            <td className="px-4 py-4 text-sm">
                                                                <span dir="ltr">
                                                                    {doctor.scfhsLicenseNumber}
                                                                </span>
                                                            </td>

                                                            <td className="px-4 py-4 text-sm">
                                                                {doctor.clinicName}
                                                            </td>

                                                            <td className="px-4 py-4">
                                                                <div className="flex max-w-64 flex-wrap gap-2">
                                                                    {doctor.services.map((service) => (
                                                                        <span
                                                                            key={service.id}
                                                                            className="inline-flex max-w-40 items-center gap-2 rounded-lg bg-teal-600/10 px-2.5 py-2 text-xs text-teal-700 dark:text-teal-400"
                                                                        >
                                                                            <span className="h-2 w-2 shrink-0 rounded-full bg-teal-600" />
                                                                            <span className="truncate">
                                                                                {service.name}
                                                                            </span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </td>

                                                            <td className="px-4 py-4 text-center text-sm font-semibold">
                                                                {doctor.commissionRate}%
                                                            </td>

                                                            <td className="px-4 py-4">
                                                                <StatusBadge
                                                                    status={doctor.accountStatus}
                                                                    t={t}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex flex-col gap-4 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="text-sm text-slate-500">
                                            {t.showing}{" "}
                                            <strong className="text-slate-800 dark:text-slate-200">
                                                {filteredDoctors.length === 0
                                                    ? 0
                                                    : (currentPage - 1) * PAGE_SIZE + 1}
                                                –{Math.min(
                                                    currentPage * PAGE_SIZE,
                                                    filteredDoctors.length,
                                                )}
                                            </strong>{" "}
                                            {t.of} <strong>{filteredDoctors.length}</strong>{" "}
                                            {t.doctors}
                                        </p>

                                        <nav
                                            aria-label="Doctor pagination"
                                            className="flex items-center gap-1"
                                        >
                                            <button
                                                type="button"
                                                aria-label={t.previous}
                                                disabled={currentPage <= 1}
                                                onClick={() =>
                                                    setPage((value) => Math.max(1, value - 1))
                                                }
                                                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-40 dark:border-slate-700"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </button>

                                            {Array.from(
                                                { length: totalPages },
                                                (_, index) => index + 1,
                                            )
                                                .slice(
                                                    Math.max(0, currentPage - 3),
                                                    Math.max(0, currentPage - 3) + 5,
                                                )
                                                .map((pageNumber) => (
                                                    <button
                                                        type="button"
                                                        key={pageNumber}
                                                        aria-current={
                                                            pageNumber === currentPage ? "page" : undefined
                                                        }
                                                        onClick={() => setPage(pageNumber)}
                                                        className={`h-9 min-w-9 rounded-lg border px-3 text-sm font-semibold transition ${pageNumber === currentPage
                                                            ? "border-teal-600 bg-teal-600 text-white"
                                                            : "border-slate-200 hover:border-teal-600 hover:text-teal-700 dark:border-slate-700"
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
                                                    setPage((value) =>
                                                        Math.min(totalPages, value + 1),
                                                    )
                                                }
                                                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-40 dark:border-slate-700"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </nav>
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                </main>
            </div>

            {modalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={(event) => {
                        if (
                            event.target === event.currentTarget &&
                            !saving
                        ) {
                            setModalOpen(false);
                        }
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="doctor-modal-title"
                        className="my-auto w-full max-w-[810px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
                    >
                        <form noValidate onSubmit={handleSubmit}>
                            <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                                <h2
                                    id="doctor-modal-title"
                                    className="text-xl font-extrabold sm:text-2xl"
                                >
                                    {t.modal}
                                </h2>

                                <button
                                    type="button"
                                    aria-label={t.close}
                                    disabled={saving}
                                    onClick={() => setModalOpen(false)}
                                    className="rounded-lg p-2 text-slate-400 transition hover:bg-teal-600/10 hover:text-teal-700 disabled:opacity-40"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="max-h-[calc(100dvh-180px)] space-y-7 overflow-y-auto px-5 pb-6 sm:px-7">
                                <section className="space-y-4">
                                    <SectionTitle icon={UserRound}>
                                        {t.credentials}
                                    </SectionTitle>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <Field label={t.email} error={errors.email}>
                                            <span className="relative block">
                                                <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    className={`${baseInput} ps-9`}
                                                    type="email"
                                                    name="email"
                                                    autoComplete="email"
                                                    maxLength={254}
                                                    placeholder="doctor@hospital.sa"
                                                    aria-invalid={Boolean(errors.email)}
                                                    disabled={saving}
                                                    onChange={() =>
                                                        setErrors((current) => ({
                                                            ...current,
                                                            email: undefined,
                                                        }))
                                                    }
                                                />
                                            </span>
                                        </Field>

                                        <Field label={t.firstName} error={errors.firstName}>
                                            <input
                                                className={baseInput}
                                                name="firstName"
                                                placeholder="e.g. Ahmed"
                                                autoComplete="given-name"
                                                maxLength={100}
                                                aria-invalid={Boolean(errors.firstName)}
                                                disabled={saving}
                                                onChange={() =>
                                                    setErrors((current) => ({
                                                        ...current,
                                                        firstName: undefined,
                                                    }))
                                                }
                                            />
                                        </Field>

                                        <Field label={t.lastName} error={errors.lastName}>
                                            <input
                                                className={baseInput}
                                                name="lastName"
                                                placeholder="e.g. Al-Qahtani"
                                                autoComplete="family-name"
                                                maxLength={100}
                                                aria-invalid={Boolean(errors.lastName)}
                                                disabled={saving}
                                                onChange={() =>
                                                    setErrors((current) => ({
                                                        ...current,
                                                        lastName: undefined,
                                                    }))
                                                }
                                            />
                                        </Field>
                                    </div>

                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t.inviteHint}
                                    </p>
                                </section>

                                <section className="space-y-4">
                                    <SectionTitle icon={FileBadge}>
                                        {t.medical}
                                    </SectionTitle>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <Field label={t.identityType}>
                                            <select
                                                name="identityType"
                                                defaultValue={IdentityType.NATIONAL_ID}
                                                className={baseInput}
                                                disabled={saving}
                                                onChange={(event) => {
                                                    const input =
                                                        event.currentTarget.form?.elements.namedItem(
                                                            "nationalId",
                                                        );

                                                    if (input instanceof HTMLInputElement) {
                                                        input.value = "";
                                                    }

                                                    setErrors((current) => ({
                                                        ...current,
                                                        nationalId: undefined,
                                                    }));
                                                }}
                                            >
                                                <option value={IdentityType.NATIONAL_ID}>
                                                    {t.national}
                                                </option>
                                                <option value={IdentityType.IQAMA}>
                                                    {t.iqama}
                                                </option>
                                            </select>
                                        </Field>

                                        <Field label={t.nationalId} error={errors.nationalId}>
                                            <input
                                                name="nationalId"
                                                placeholder="10-digit National ID or Iqama"
                                                inputMode="numeric"
                                                maxLength={10}
                                                className={baseInput}
                                                aria-invalid={Boolean(errors.nationalId)}
                                                disabled={saving}
                                                onChange={() =>
                                                    setErrors((current) => ({
                                                        ...current,
                                                        nationalId: undefined,
                                                    }))
                                                }
                                            />
                                        </Field>

                                        <Field
                                            label={t.license}
                                            error={errors.scfhsLicenseNumber}
                                        >
                                            <input
                                                name="scfhsLicenseNumber"
                                                placeholder="e.g. SCFHS-123456"
                                                maxLength={100}
                                                className={baseInput}
                                                aria-invalid={Boolean(errors.scfhsLicenseNumber)}
                                                disabled={saving}
                                                onChange={() =>
                                                    setErrors((current) => ({
                                                        ...current,
                                                        scfhsLicenseNumber: undefined,
                                                    }))
                                                }
                                            />
                                        </Field>

                                        <Field
                                            label={t.rank}
                                            error={errors.professionalRank}
                                        >
                                            <span className="relative block">
                                                <BriefcaseMedical className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                <select
                                                    name="professionalRank"
                                                    defaultValue=""
                                                    className={`${baseInput} appearance-none ps-9`}
                                                    aria-invalid={Boolean(errors.professionalRank)}
                                                    disabled={saving}
                                                    onChange={() =>
                                                        setErrors((current) => ({
                                                            ...current,
                                                            professionalRank: undefined,
                                                        }))
                                                    }
                                                >
                                                    <option value="" disabled>
                                                        {t.chooseRank}
                                                    </option>
                                                    {Object.values(DoctorProfessionalRank).map(
                                                        (rank) => (
                                                            <option key={rank} value={rank}>
                                                                {rankLabels[rank][locale]}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            </span>
                                        </Field>

                                        <Field label={t.specialty} error={errors.specialty}>
                                            <span className="relative block">
                                                <Stethoscope className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    name="specialty"
                                                    maxLength={150}
                                                    className={`${baseInput} ps-9`}
                                                    placeholder={t.enterSpecialty}
                                                    aria-invalid={Boolean(errors.specialty)}
                                                    disabled={saving}
                                                    onChange={() =>
                                                        setErrors((current) => ({
                                                            ...current,
                                                            specialty: undefined,
                                                        }))
                                                    }
                                                />
                                            </span>
                                        </Field>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <SectionTitle icon={Activity}>
                                        {t.integration}
                                    </SectionTitle>

                                    {optionsError && (
                                        <div
                                            role="alert"
                                            className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-400"
                                        >
                                            <p>{optionsError}</p>
                                            <button
                                                type="button"
                                                onClick={() => void loadOptions()}
                                                className="mt-2 font-semibold text-teal-700 underline dark:text-teal-400"
                                            >
                                                {t.retry}
                                            </button>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.2fr_.8fr]">
                                        <Field label={t.clinic} error={errors.clinicId}>
                                            <span className="relative block">
                                                <Building2 className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                                <select
                                                    name="clinicId"
                                                    value={selectedClinicId}
                                                    disabled={
                                                        saving ||
                                                        optionsLoading ||
                                                        options.clinics.length === 0
                                                    }
                                                    className={`${baseInput} appearance-none ps-9`}
                                                    onChange={(event) =>
                                                        changeClinic(event.target.value)
                                                    }
                                                >
                                                    <option value="">
                                                        {optionsLoading ? "…" : t.chooseClinic}
                                                    </option>
                                                    {options.clinics.map((clinic) => (
                                                        <option key={clinic.id} value={clinic.id}>
                                                            {clinicName(clinic)}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            </span>

                                            {!optionsLoading && options.clinics.length === 0 && (
                                                <span className="mt-1 block text-xs text-slate-500">
                                                    {t.noClinics}
                                                </span>
                                            )}
                                        </Field>

                                        <fieldset className="min-w-0" disabled={saving}>
                                            <legend className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                {t.services}{" "}
                                                <span className="text-teal-600">*</span>
                                            </legend>

                                            {!selectedClinicId ? (
                                                <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                                                    {t.selectClinicFirst}
                                                </p>
                                            ) : filteredServices.length === 0 ? (
                                                <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                                                    {t.noServices}
                                                </p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {filteredServices.map((service) => {
                                                        const checked = selectedServiceIds.includes(
                                                            service.id,
                                                        );

                                                        return (
                                                            <label
                                                                key={service.id}
                                                                className={`inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${checked
                                                                    ? "border-teal-600 bg-teal-600/10 text-teal-700 dark:text-teal-400"
                                                                    : "border-slate-200 dark:border-slate-700"
                                                                    }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    name="serviceIds"
                                                                    value={service.id}
                                                                    checked={checked}
                                                                    onChange={(event) =>
                                                                        toggleService(
                                                                            service.id,
                                                                            event.target.checked,
                                                                        )
                                                                    }
                                                                    className="h-4 w-4 accent-teal-600"
                                                                />
                                                                <span className="max-w-32 truncate">
                                                                    {serviceName(service)}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {errors.serviceIds && (
                                                <span
                                                    role="alert"
                                                    className="mt-1 block text-xs text-rose-600 dark:text-rose-400"
                                                >
                                                    {errors.serviceIds}
                                                </span>
                                            )}
                                        </fieldset>

                                        <Field
                                            label={t.commissionInput}
                                            error={errors.commissionRate}
                                        >
                                            <span className="relative block">
                                                <input
                                                    name="commissionRate"
                                                    placeholder="e.g. 15.00"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    defaultValue="0"
                                                    className={`${baseInput} pe-9`}
                                                    aria-invalid={Boolean(errors.commissionRate)}
                                                    disabled={saving}
                                                    onChange={() =>
                                                        setErrors((current) => ({
                                                            ...current,
                                                            commissionRate: undefined,
                                                        }))
                                                    }
                                                />
                                                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                                    %
                                                </span>
                                            </span>
                                        </Field>
                                    </div>
                                </section>

                                {formError && (
                                    <div
                                        role="alert"
                                        className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-400"
                                    >
                                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                                        <p>{formError}</p>
                                    </div>
                                )}
                            </div>

                            <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end sm:px-7">
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => setModalOpen(false)}
                                    className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-semibold transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-50 dark:border-slate-700 dark:hover:text-teal-400"
                                >
                                    {t.cancel}
                                </button>

                                <button
                                    type="submit"
                                    disabled={
                                        saving ||
                                        optionsLoading ||
                                        Boolean(optionsError) ||
                                        options.clinics.length === 0
                                    }
                                    className={`${tealButton} h-11`}
                                >
                                    {saving ? (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                    {saving ? t.saving : t.save}
                                </button>
                            </footer>
                        </form>
                    </section>
                </div>
            )}
        </div>
    );
}