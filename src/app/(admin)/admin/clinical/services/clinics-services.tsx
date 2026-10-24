
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
    Activity,
    Building2,
    Check,
    ChevronDown,
    ChevronLeft,
    CircleDollarSign,
    ClipboardList,
    Coins,
    Hospital,
    Pencil,
    Plus,
    Menu,
    Power,
    PowerOff,
    Search,
    ShieldCheck,
    X,
    Bell,
    Users,
} from "lucide-react";

import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import type { Locale } from "@/lib/i18n/types";

import {
    createClinicAction,
    createServiceAction,
    updateClinicAction,
    updateServiceAction,
    toggleClinicStatusAction,
    toggleServiceStatusAction,
    getClinicsData,
    getServicesData,
    type ClinicSpecialty,
    type CreateClinicInput,
    type CreateServiceInput,
    type UpdateClinicInput,
    type UpdateServiceInput,
} from "@/actions/clinicsActions";

type ClinicsServicesProps = {
    initialLocale: Locale;
};

type ClinicRow = {
    id: string;
    nameAr: string;
    nameEn: string;
    specialty: string | null;
    nphiesCode: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

type ServiceRow = {
    id: string;
    clinicId: string;
    clinic: {
        id: string;
        nameAr: string;
        nameEn: string;
    };
    code: string;
    nameAr: string;
    nameEn: string;
    basePrice: string;
    vatRate: string;
    vatAmount: string;
    totalPrice: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

type Tab = "clinics" | "services";
type Modal = "clinic" | "service" | null;

type StatusTarget = {
    type: "clinic" | "service";
    id: string;
    name: string;
    isActive: boolean;
};

const specialties: {
    code: ClinicSpecialty;
    en: string;
    ar: string;
    nphies: string;
}[] = [
        { code: "DENT", en: "Dentistry", ar: "طب الأسنان", nphies: "DENT-01" },
        { code: "PED", en: "Pediatrics", ar: "طب الأطفال", nphies: "PED-02" },
        { code: "DER", en: "Dermatology", ar: "الأمراض الجلدية", nphies: "DER-03" },
        { code: "CARD", en: "Cardiology", ar: "أمراض القلب", nphies: "CARD-04" },
        { code: "IM", en: "Internal Medicine", ar: "الطب الباطني", nphies: "IM-05" },
        { code: "GEN", en: "General Medicine", ar: "الطب العام", nphies: "GEN-06" },
    ];

const translations = {
    ar: {
        greeting: "مرحباً، نورة",
        role: "مدير النظام",
        title: "العيادات والخدمات",
        subtitle: "إدارة العيادات والتخصصات والخدمات الطبية",
        dashboard: "لوحة التحكم",
        clinicTab: "إدارة العيادات",
        serviceTab: "الخدمات والأسعار",
        clinicDescription: "إدارة العيادات والتخصصات الطبية",
        serviceDescription: "كتالوج الخدمات والأسعار والضرائب",
        addClinic: "إضافة عيادة",
        addService: "إضافة خدمة جديدة",
        searchClinic: "البحث عن عيادة أو تخصص...",
        searchService: "البحث عن خدمة أو رمز...",
        clinicName: "اسم العيادة",
        specialty: "القسم / التخصص",
        nphies: "رمز نفيس",
        status: "الحالة",
        actions: "الإجراءات",
        active: "نشطة",
        inactive: "غير نشطة",
        clinicEn: "اسم العيادة بالإنجليزية",
        clinicAr: "اسم العيادة بالعربية",
        serviceEn: "اسم الخدمة بالإنجليزية",
        serviceAr: "اسم الخدمة بالعربية",
        chooseSpecialty: "اختر التخصص",
        clinicCode: "رمز العيادة",
        serviceCode: "رمز الخدمة (CPT)",
        associatedClinic: "العيادة المرتبطة",
        chooseClinic: "اختر العيادة",
        basePrice: "السعر الأساسي (ر.س)",
        vat: "نسبة ضريبة القيمة المضافة",
        standardVat: "ضريبة قياسية 15%",
        exemptVat: "معفاة من الضريبة 0%",
        totalPrice: "السعر الإجمالي شامل الضريبة",
        cancel: "إلغاء",
        saveClinic: "حفظ العيادة",
        saveService: "حفظ الخدمة",
        saveChanges: "حفظ التعديلات",
        loading: "جارٍ تحميل البيانات...",
        loadingError: "تعذر تحميل البيانات. حاول إعادة التحميل.",
        noClinics: "لا توجد عيادات مطابقة للبحث.",
        noServices: "لا توجد خدمات مطابقة للبحث.",
        noActiveClinics: "أضف عيادة نشطة أولاً قبل إنشاء خدمة.",
        failed: "تعذر إتمام العملية. يرجى المحاولة مرة أخرى.",
        showing: "عرض",
        of: "من",
        clinics: "عيادات",
        services: "خدمات",
        nameRequired: "يرجى إدخال الاسم بالعربية والإنجليزية.",
        specialtyRequired: "يرجى اختيار التخصص.",
        codeRequired: "يرجى إدخال رمز صالح.",
        clinicRequired: "يرجى اختيار عيادة نشطة.",
        priceRequired: "يرجى إدخال سعر صالح.",
        close: "إغلاق النافذة",
        newClinic: "عيادة جديدة",
        newService: "خدمة جديدة",
        edit: "تعديل",
        editClinic: "تعديل العيادة",
        editService: "تعديل الخدمة",
        enable: "تفعيل",
        disable: "تعطيل",
        confirm: "تأكيد العملية",
        confirmEnable: "هل أنت متأكد من تفعيل",
        confirmDisable: "هل أنت متأكد من تعطيل",
        clinicEntity: "هذه العيادة",
        serviceEntity: "هذه الخدمة",
        statusUpdated: "تم تحديث الحالة بنجاح.",
        updatedClinic: "تم تحديث العيادة بنجاح.",
        updatedService: "تم تحديث الخدمة بنجاح.",
        successClinic: "تمت إضافة العيادة بنجاح.",
        successService: "تمت إضافة الخدمة بنجاح.",
        catalog: "كتالوج الخدمات",
        billing: "الفوترة والضرائب",
        zatca: "ضريبة القيمة المضافة وفق إعدادات ZATCA",
        vatNote: "يتم احتساب الضريبة تلقائياً وفق النسبة المختارة.",
        statusNote: "يمكن تغيير حالة العيادة من إجراءات الجدول.",
        nphiesNote: "الرمز المعروض رمز داخلي للتخصص وليس معرف تسجيل رسمي لدى نفيس.",
        platform: "منصة إدارة الرعاية الصحية",
        footer: "جميع الحقوق محفوظة",
        systemOnline: "النظام يعمل بشكل طبيعي",
        systemStatus: "حالة النظام",
        sar: "ر.س",
        taxAmount: "قيمة الضريبة",
        tryAgain: "حاول مرة أخرى",
        notifications: "الإشعارات",
        menuOpen: "فتح القائمة الجانبية",
    },
    en: {
        greeting: "Hello, Noura",
        role: "System Administrator",
        title: "Clinics & Services",
        subtitle: "Manage clinics, specialties, and medical services",
        dashboard: "Dashboard",
        clinicTab: "Clinic Management",
        serviceTab: "Services & Pricing",
        clinicDescription: "Manage clinics and medical specialties",
        serviceDescription: "Service catalog, pricing, and taxes",
        addClinic: "Add Clinic",
        addService: "Add New Service",
        searchClinic: "Search clinics or specialties...",
        searchService: "Search services or codes...",
        clinicName: "Clinic Name",
        specialty: "Department / Specialty",
        nphies: "NPHIES Code",
        status: "Status",
        actions: "Actions",
        active: "Active",
        inactive: "Inactive",
        clinicEn: "Clinic Name (English)",
        clinicAr: "Clinic Name (Arabic)",
        serviceEn: "Service Name (English)",
        serviceAr: "Service Name (Arabic)",
        chooseSpecialty: "Select specialty",
        clinicCode: "Clinic Code",
        serviceCode: "Service Code (CPT)",
        associatedClinic: "Associated Clinic",
        chooseClinic: "Select clinic",
        basePrice: "Base Price (SAR)",
        vat: "Value Added Tax Rate",
        standardVat: "Standard VAT 15%",
        exemptVat: "VAT Exempt 0%",
        totalPrice: "Total Price Including VAT",
        cancel: "Cancel",
        saveClinic: "Save Clinic",
        saveService: "Save Service",
        saveChanges: "Save Changes",
        loading: "Loading data...",
        loadingError: "Unable to load data. Please try again.",
        noClinics: "No clinics match your search.",
        noServices: "No services match your search.",
        noActiveClinics: "Add an active clinic before creating a service.",
        failed: "The operation failed. Please try again.",
        showing: "Showing",
        of: "of",
        clinics: "clinics",
        services: "services",
        nameRequired: "Enter the name in both English and Arabic.",
        specialtyRequired: "Select a specialty.",
        codeRequired: "Enter a valid code.",
        clinicRequired: "Select an active clinic.",
        priceRequired: "Enter a valid price.",
        close: "Close dialog",
        newClinic: "New Clinic",
        newService: "New Service",
        edit: "Edit",
        editClinic: "Edit Clinic",
        editService: "Edit Service",
        enable: "Enable",
        disable: "Disable",
        confirm: "Confirm Action",
        confirmEnable: "Are you sure you want to enable",
        confirmDisable: "Are you sure you want to disable",
        clinicEntity: "this clinic",
        serviceEntity: "this service",
        statusUpdated: "Status updated successfully.",
        updatedClinic: "Clinic updated successfully.",
        updatedService: "Service updated successfully.",
        successClinic: "Clinic created successfully.",
        successService: "Service created successfully.",
        catalog: "Service Catalog",
        billing: "Billing & Taxes",
        zatca: "VAT settings for ZATCA compliance",
        vatNote: "VAT is calculated automatically using the selected rate.",
        statusNote: "Change the clinic status using the table actions.",
        nphiesNote: "The displayed code is an internal catalog code, not an official NPHIES enrollment identifier.",
        platform: "Healthcare Management Platform",
        footer: "All rights reserved",
        systemOnline: "All systems operational",
        systemStatus: "System Status",
        sar: "SAR",
        taxAmount: "VAT Amount",
        tryAgain: "Try again",
        notifications: "Notifications",
        menuOpen: "Open sidebar",
    },
} as const;

type TranslationKey = keyof typeof translations.en;

function cn(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function money(value: string | number, locale: Locale) {
    const amount = Number(value);

    return new Intl.NumberFormat(
        locale === "ar" ? "ar-SA" : "en-SA",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        },
    ).format(Number.isFinite(amount) ? amount : 0);
}

function getSpecialtyLabel(code: string | null, locale: Locale) {
    const specialty = specialties.find((item) => item.code === code);

    if (!specialty) return code || "—";

    return locale === "ar" ? specialty.ar : specialty.en;
}

function Field({
    label,
    children,
    hint,
}: {
    label: string;
    children: ReactNode;
    hint?: string;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {label}
            </label>
            {children}
            {hint && (
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {hint}
                </p>
            )}
        </div>
    );
}

const inputClass =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800";

export default function ClinicsServicesPage({ initialLocale,
}: ClinicsServicesProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [tab, setTab] = useState<Tab>("clinics");
    const [modal, setModal] = useState<Modal>(null);

    const [clinics, setClinics] = useState<ClinicRow[]>([]);
    const [services, setServices] = useState<ServiceRow[]>([]);

    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [statusSubmitting, setStatusSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [year, setYear] = useState<number | null>(null);

    const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
    const [editingService, setEditingService] = useState<ServiceRow | null>(null);
    const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);

    const [clinicForm, setClinicForm] = useState<CreateClinicInput>({
        nameEn: "",
        nameAr: "",
        specialty: "DENT",
        nphiesCode: "DENT-01",
        isActive: true,
    });

    const [serviceForm, setServiceForm] = useState<CreateServiceInput>({
        clinicId: "",
        code: "",
        nameEn: "",
        nameAr: "",
        basePrice: "",
        vatRate: 15,
    });

    const isRtl = locale === "ar";
    const t = translations[locale];

    useEffect(() => {
        setYear(new Date().getFullYear());
    }, []);

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

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const [clinicResult, serviceResult] = await Promise.all([
                getClinicsData(),
                getServicesData(),
            ]);

            if (!clinicResult.success || !serviceResult.success) {
                setError(t.loadingError);
                return;
            }

            setClinics(clinicResult.data as ClinicRow[]);
            setServices(serviceResult.data as ServiceRow[]);
        } catch {
            setError(t.loadingError);
        } finally {
            setLoading(false);
        }
    }, [t.loadingError]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!modal && !statusTarget) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || submitting || statusSubmitting) {
                return;
            }

            setModal(null);
            setEditingClinic(null);
            setEditingService(null);
            setStatusTarget(null);
            setError("");
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [modal, statusTarget, submitting, statusSubmitting]);

    const activeClinics = useMemo(
        () => clinics.filter((clinic) => clinic.isActive),
        [clinics],
    );

    const filteredClinics = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(
            locale === "ar" ? "ar-SA" : "en",
        );

        if (!query) return clinics;

        return clinics.filter((clinic) =>
            [
                clinic.nameEn,
                clinic.nameAr,
                clinic.specialty ?? "",
                clinic.nphiesCode ?? "",
            ].some((value) =>
                value.toLocaleLowerCase(
                    locale === "ar" ? "ar-SA" : "en",
                ).includes(query),
            ),
        );
    }, [clinics, search, locale]);

    const filteredServices = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(
            locale === "ar" ? "ar-SA" : "en",
        );

        if (!query) return services;

        return services.filter((service) =>
            [
                service.code,
                service.nameEn,
                service.nameAr,
                service.clinic.nameEn,
                service.clinic.nameAr,
            ].some((value) =>
                value.toLocaleLowerCase(
                    locale === "ar" ? "ar-SA" : "en",
                ).includes(query),
            ),
        );
    }, [services, search, locale]);

    const baseAmount = Number(serviceForm.basePrice);

    const validBaseAmount =
        String(serviceForm.basePrice).trim() !== "" &&
        /^\d{1,10}(?:\.\d{1,2})?$/.test(
            String(serviceForm.basePrice).trim(),
        ) &&
        Number.isFinite(baseAmount) &&
        baseAmount >= 0 &&
        baseAmount <= 9999999999.99;

    const vatAmount = validBaseAmount
        ? Math.round(baseAmount * (Number(serviceForm.vatRate) / 100) * 100) / 100
        : 0;

    const totalAmount = validBaseAmount
        ? Math.round((baseAmount + vatAmount) * 100) / 100
        : 0;

    const clinicName = (clinic: {
        nameAr: string;
        nameEn: string;
    }) => (isRtl ? clinic.nameAr : clinic.nameEn);

    const resetClinicForm = () => {
        setClinicForm({
            nameEn: "",
            nameAr: "",
            specialty: "DENT",
            nphiesCode: "DENT-01",
            isActive: true,
        });
    };

    const resetServiceForm = () => {
        setServiceForm({
            clinicId: activeClinics[0]?.id ?? "",
            code: "",
            nameEn: "",
            nameAr: "",
            basePrice: "",
            vatRate: 15,
        });
    };

    const openModal = (nextModal: Exclude<Modal, null>) => {
        setError("");
        setSuccess("");
        setEditingClinic(null);
        setEditingService(null);

        if (nextModal === "clinic") {
            resetClinicForm();
        } else {
            resetServiceForm();
        }

        setModal(nextModal);
    };

    const closeModal = () => {
        if (submitting) return;

        setModal(null);
        setEditingClinic(null);
        setEditingService(null);
        setError("");
    };

    const openEditClinic = (clinic: ClinicRow) => {
        setError("");
        setSuccess("");
        setEditingClinic(clinic);
        setEditingService(null);

        setClinicForm({
            nameEn: clinic.nameEn,
            nameAr: clinic.nameAr,
            specialty: (clinic.specialty || "DENT") as ClinicSpecialty,
            nphiesCode: clinic.nphiesCode || "",
            isActive: clinic.isActive,
        });

        setModal("clinic");
    };

    const openEditService = (service: ServiceRow) => {
        setError("");
        setSuccess("");
        setEditingService(service);
        setEditingClinic(null);

        setServiceForm({
            clinicId: service.clinicId,
            code: service.code,
            nameEn: service.nameEn,
            nameAr: service.nameAr,
            basePrice: service.basePrice,
            vatRate: Number(service.vatRate) as 0 | 15,
        });

        setModal("service");
    };

    const requestStatusChange = (
        type: "clinic" | "service",
        item: ClinicRow | ServiceRow,
    ) => {
        setError("");
        setSuccess("");

        const name =
            type === "clinic"
                ? clinicName(item as ClinicRow)
                : isRtl
                    ? (item as ServiceRow).nameAr
                    : (item as ServiceRow).nameEn;

        setStatusTarget({
            type,
            id: item.id,
            name,
            isActive: item.isActive,
        });
    };

    const handleClinicSubmit = async (
        event: FormEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!clinicForm.nameEn.trim() || !clinicForm.nameAr.trim()) {
            setError(t.nameRequired);
            return;
        }

        if (!clinicForm.specialty) {
            setError(t.specialtyRequired);
            return;
        }

        if (!/^[A-Za-z0-9-]{2,30}$/.test(clinicForm.nphiesCode.trim())) {
            setError(t.codeRequired);
            return;
        }

        setSubmitting(true);

        try {
            if (editingClinic) {
                const input: UpdateClinicInput = {
                    nameEn: clinicForm.nameEn.trim(),
                    nameAr: clinicForm.nameAr.trim(),
                    specialty: clinicForm.specialty,
                    nphiesCode: clinicForm.nphiesCode.trim().toUpperCase(),
                };

                const result = await updateClinicAction(
                    editingClinic.id,
                    input,
                );

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setClinics((current) =>
                    current.map((clinic) =>
                        clinic.id === result.data!.id
                            ? (result.data as ClinicRow)
                            : clinic,
                    ),
                );

                setSuccess(t.updatedClinic);
            } else {
                const input: CreateClinicInput = {
                    ...clinicForm,
                    nameEn: clinicForm.nameEn.trim(),
                    nameAr: clinicForm.nameAr.trim(),
                    nphiesCode: clinicForm.nphiesCode.trim().toUpperCase(),
                };

                const result = await createClinicAction(input);

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setClinics((current) => [
                    result.data as ClinicRow,
                    ...current,
                ]);

                setSuccess(t.successClinic);
            }

            setModal(null);
            setEditingClinic(null);
            setSearch("");
        } catch {
            setError(t.failed);
        } finally {
            setSubmitting(false);
        }
    };

    const handleServiceSubmit = async (
        event: FormEvent<HTMLFormElement>,
    ) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!serviceForm.nameEn.trim() || !serviceForm.nameAr.trim()) {
            setError(t.nameRequired);
            return;
        }

        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(serviceForm.code.trim())) {
            setError(t.codeRequired);
            return;
        }

        if (!editingService && !activeClinics.some(
            (clinic) => clinic.id === serviceForm.clinicId,
        )) {
            setError(t.clinicRequired);
            return;
        }

        if (editingService && !serviceForm.clinicId) {
            setError(t.clinicRequired);
            return;
        }

        if (!validBaseAmount) {
            setError(t.priceRequired);
            return;
        }

        setSubmitting(true);

        try {
            const code = serviceForm.code.trim().toUpperCase();
            const nameEn = serviceForm.nameEn.trim();
            const nameAr = serviceForm.nameAr.trim();
            const basePrice = baseAmount.toFixed(2);
            const vatRate = Number(serviceForm.vatRate) as 0 | 15;

            if (editingService) {
                const input: UpdateServiceInput = {
                    code,
                    nameEn,
                    nameAr,
                    basePrice,
                    vatRate,
                };

                const result = await updateServiceAction(
                    editingService.id,
                    input,
                );

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setServices((current) =>
                    current.map((service) =>
                        service.id === result.data!.id
                            ? (result.data as ServiceRow)
                            : service,
                    ),
                );

                setSuccess(t.updatedService);
            } else {
                const input: CreateServiceInput = {
                    clinicId: serviceForm.clinicId,
                    code,
                    nameEn,
                    nameAr,
                    basePrice,
                    vatRate,
                };

                const result = await createServiceAction(input);

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setServices((current) => [
                    result.data as ServiceRow,
                    ...current,
                ]);

                setSuccess(t.successService);
            }

            setModal(null);
            setEditingService(null);
            setSearch("");
        } catch {
            setError(t.failed);
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!statusTarget || statusSubmitting) return;

        setStatusSubmitting(true);
        setError("");

        try {
            if (statusTarget.type === "clinic") {
                const result = await toggleClinicStatusAction(
                    statusTarget.id,
                    !statusTarget.isActive,
                );

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setClinics((current) =>
                    current.map((clinic) =>
                        clinic.id === result.data!.id
                            ? (result.data as ClinicRow)
                            : clinic,
                    ),
                );
            } else {
                const result = await toggleServiceStatusAction(
                    statusTarget.id,
                    !statusTarget.isActive,
                );

                if (!result.success || !result.data) {
                    setError(result.error || t.failed);
                    return;
                }

                setServices((current) =>
                    current.map((service) =>
                        service.id === result.data!.id
                            ? (result.data as ServiceRow)
                            : service,
                    ),
                );
            }

            setStatusTarget(null);
            setSuccess(t.statusUpdated);
        } catch {
            setError(t.failed);
        } finally {
            setStatusSubmitting(false);
        }
    };

    const currentCount =
        tab === "clinics"
            ? filteredClinics.length
            : filteredServices.length;

    const totalCount =
        tab === "clinics" ? clinics.length : services.length;

    const closeStatusModal = () => {
        if (statusSubmitting) return;
        setStatusTarget(null);
        setError("");
    };

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >

            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref="/admin/clinical/services"
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <div className="min-w-0 flex-1">

                    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
                        <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 py-3 sm:px-6 xl:px-8">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    aria-label={t.menuOpen}
                                    aria-controls="admin-sidebar"
                                    aria-expanded={sidebarOpen}
                                    onClick={() => setSidebarOpen(true)}
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                                >
                                    <Menu size={21} />
                                </button>

                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                                        {t.greeting}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {t.role}
                                    </p>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                                <LanguageToggle
                                    locale={locale}
                                    variant="header"
                                />

                                <ThemeToggle
                                    lightLabel={locale === "ar" ? "الوضع الفاتح" : "Light mode"}
                                    darkLabel={locale === "ar" ? "الوضع الداكن" : "Dark mode"}
                                    variant="header"
                                />

                                <button
                                    type="button"
                                    aria-label={t.notifications}
                                    className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <Bell size={20} />

                                    <span
                                        className={cn(
                                            "absolute top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500 dark:border-slate-950",
                                            isRtl ? "right-2" : "left-2",
                                        )}
                                    />
                                </button>

                                <div className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-slate-700" />

                                <div className="hidden h-10 w-10 place-items-center rounded-full bg-teal-50 text-teal-700 sm:grid dark:bg-teal-950/50 dark:text-teal-400">
                                    <Users size={20} />
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div>
                                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <span>{t.dashboard}</span>
                                    <ChevronLeft
                                        size={13}
                                        className={cn(!isRtl && "rotate-180")}
                                    />
                                    <span className="font-medium text-teal-700 dark:text-teal-400">
                                        {t.title}
                                    </span>
                                </div>

                                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                                    {t.title}
                                </h1>

                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {t.subtitle}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 sm:self-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                <ShieldCheck size={16} className="text-teal-600 dark:text-teal-400" />
                                {t.zatca}
                            </div>
                        </section>

                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <article className="dashboard-card flex items-center gap-4 p-4 sm:p-5">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
                                    <Hospital size={23} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.clinicTab}
                                    </p>
                                    <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
                                        {clinics.length}
                                    </p>
                                </div>
                            </article>

                            <article className="dashboard-card flex items-center gap-4 p-4 sm:p-5">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                                    <ClipboardList size={23} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.catalog}
                                    </p>
                                    <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
                                        {services.length}
                                    </p>
                                </div>
                            </article>

                            <article className="dashboard-card flex items-center gap-4 p-4 sm:p-5">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                                    <Activity size={23} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.systemStatus}
                                    </p>
                                    <p className="mt-1 flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                        {t.systemOnline}
                                    </p>
                                </div>
                            </article>
                        </section>

                        <section className="dashboard-card min-w-0 overflow-hidden">
                            <div className="flex flex-col gap-4 border-b border-slate-100 px-4 pt-4 sm:px-5 dark:border-slate-800">
                                <div
                                    role="tablist"
                                    aria-label={t.title}
                                    className="flex gap-6 overflow-x-auto"
                                >
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === "clinics"}
                                        onClick={() => {
                                            setTab("clinics");
                                            setSearch("");
                                            setError("");
                                            setSuccess("");
                                        }}
                                        className={cn(
                                            "flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors",
                                            tab === "clinics"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white",
                                        )}
                                    >
                                        <Building2 size={18} />
                                        {t.clinicTab}
                                    </button>

                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === "services"}
                                        onClick={() => {
                                            setTab("services");
                                            setSearch("");
                                            setError("");
                                            setSuccess("");
                                        }}
                                        className={cn(
                                            "flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors",
                                            tab === "services"
                                                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                                                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white",
                                        )}
                                    >
                                        <Coins size={18} />
                                        {t.serviceTab}
                                    </button>
                                </div>

                                <div className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-center lg:justify-between">
                                    <label className="relative block w-full lg:max-w-sm">
                                        <Search
                                            size={17}
                                            aria-hidden="true"
                                            className={cn(
                                                "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
                                                isRtl ? "right-3" : "left-3",
                                            )}
                                        />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder={tab === "clinics" ? t.searchClinic : t.searchService}
                                            aria-label={tab === "clinics" ? t.searchClinic : t.searchService}
                                            className={cn(
                                                inputClass,
                                                isRtl ? "pr-10 text-right" : "pl-10 text-left",
                                            )}
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => openModal(tab === "clinics" ? "clinic" : "service")}
                                        disabled={tab === "services" && activeClinics.length === 0}
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950"
                                    >
                                        <Plus size={19} />
                                        {tab === "clinics" ? t.addClinic : t.addService}
                                    </button>
                                </div>
                            </div>

                            {success && (
                                <div
                                    role="status"
                                    className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 sm:mx-5"
                                >
                                    <Check size={17} />
                                    <span className="flex-1">{success}</span>
                                    <button
                                        type="button"
                                        aria-label={t.close}
                                        onClick={() => setSuccess("")}
                                        className="rounded-lg p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {error && !modal && !statusTarget && (
                                <div
                                    role="alert"
                                    className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 sm:mx-5"
                                >
                                    <span className="flex-1">{error}</span>
                                    <button
                                        type="button"
                                        onClick={() => void loadData()}
                                        className="font-bold underline"
                                    >
                                        {t.tryAgain}
                                    </button>
                                </div>
                            )}

                            {tab === "services" && activeClinics.length === 0 && !loading && (
                                <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 sm:mx-5">
                                    {t.noActiveClinics}
                                </div>
                            )}

                            <div className="min-w-0 overflow-x-auto">
                                {loading ? (
                                    <div className="grid min-h-64 place-items-center px-5 py-12 text-sm text-slate-500 dark:text-slate-400">
                                        <div className="flex items-center gap-3">
                                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                                            {t.loading}
                                        </div>
                                    </div>
                                ) : tab === "clinics" ? (
                                    <table className="w-full min-w-[900px] text-start text-sm">
                                        <thead>
                                            <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                                                <th scope="col" className="px-5 py-4 text-left">
                                                    {t.clinicName}
                                                </th>

                                                <th scope="col" className="px-4 py-4 text-left">
                                                    {t.specialty}
                                                </th>

                                                <th scope="col" className="px-4 py-4 text-left">
                                                    {t.nphies}
                                                </th>

                                                <th scope="col" className="px-5 py-4 text-left">
                                                    {t.status}
                                                </th>

                                                <th scope="col" className="px-5 py-4 text-left">
                                                    {t.actions}
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredClinics.map((clinic) => (
                                                <tr
                                                    key={clinic.id}
                                                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
                                                >
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
                                                                <Hospital size={20} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-slate-800 dark:text-slate-100">
                                                                    {clinicName(clinic)}
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                                    {isRtl ? clinic.nameEn : clinic.nameAr}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
                                                        {getSpecialtyLabel(clinic.specialty, locale)}
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4">
                                                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                            {clinic.nphiesCode || "—"}
                                                        </span>
                                                    </td>

                                                    <td className="whitespace-nowrap px-5 py-4">
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                                                                clinic.isActive
                                                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "h-2 w-2 rounded-full",
                                                                    clinic.isActive ? "bg-emerald-500" : "bg-slate-400",
                                                                )}
                                                            />
                                                            {clinic.isActive ? t.active : t.inactive}
                                                        </span>
                                                    </td>

                                                    <td className="whitespace-nowrap px-5 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditClinic(clinic)}
                                                                title={t.edit}
                                                                aria-label={`${t.editClinic}: ${clinicName(clinic)}`}
                                                                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-900 dark:hover:bg-teal-950/40 dark:hover:text-teal-400"
                                                            >
                                                                <Pencil size={16} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => requestStatusChange("clinic", clinic)}
                                                                title={clinic.isActive ? t.disable : t.enable}
                                                                aria-label={`${clinic.isActive ? t.disable : t.enable}: ${clinicName(clinic)}`}
                                                                className={cn(
                                                                    "grid h-9 w-9 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2",
                                                                    clinic.isActive
                                                                        ? "border-rose-200 text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-500 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                                                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
                                                                )}
                                                            >
                                                                {clinic.isActive
                                                                    ? <PowerOff size={16} />
                                                                    : <Power size={16} />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}

                                            {filteredClinics.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                                                        {t.noClinics}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="w-full min-w-[1100px] text-start text-sm">
                                        <thead>
                                            <tr className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                                                <th scope="col" className="px-5 py-4">{t.serviceCode}</th>
                                                <th scope="col" className="px-4 py-4">{t.clinicName}</th>
                                                <th scope="col" className="px-4 py-4">{t.serviceEn}</th>
                                                <th scope="col" className="px-4 py-4">{t.basePrice}</th>
                                                <th scope="col" className="px-4 py-4">{t.vat}</th>
                                                <th scope="col" className="px-5 py-4">{t.totalPrice}</th>
                                                <th scope="col" className="px-4 py-4">{t.status}</th>
                                                <th scope="col" className="px-5 py-4">{t.actions}</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredServices.map((service) => (
                                                <tr
                                                    key={service.id}
                                                    className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
                                                >
                                                    <td className="whitespace-nowrap px-5 py-4">
                                                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                            {service.code}
                                                        </span>
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">
                                                        {clinicName(service.clinic)}
                                                    </td>

                                                    <td className="px-4 py-4">
                                                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                                                            {isRtl ? service.nameAr : service.nameEn}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                            {isRtl ? service.nameEn : service.nameAr}
                                                        </p>
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4 text-slate-700 dark:text-slate-300">
                                                        {money(service.basePrice, locale)} {t.sar}
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4">
                                                        <span
                                                            className={cn(
                                                                "rounded-full px-2.5 py-1.5 text-xs font-semibold",
                                                                Number(service.vatRate) === 0
                                                                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                                    : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
                                                            )}
                                                        >
                                                            {money(service.vatRate, locale)}%
                                                        </span>
                                                    </td>

                                                    <td className="whitespace-nowrap px-5 py-4">
                                                        <p className="font-bold text-teal-700 dark:text-teal-400">
                                                            {money(service.totalPrice, locale)} {t.sar}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                            {t.taxAmount}: {money(service.vatAmount, locale)}
                                                        </p>
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-4">
                                                        <span
                                                            className={cn(
                                                                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
                                                                service.isActive
                                                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "h-2 w-2 rounded-full",
                                                                    service.isActive ? "bg-emerald-500" : "bg-slate-400",
                                                                )}
                                                            />
                                                            {service.isActive ? t.active : t.inactive}
                                                        </span>
                                                    </td>

                                                    <td className="whitespace-nowrap px-5 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditService(service)}
                                                                title={t.edit}
                                                                aria-label={`${t.editService}: ${service.nameEn}`}
                                                                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-900 dark:hover:bg-teal-950/40 dark:hover:text-teal-400"
                                                            >
                                                                <Pencil size={16} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => requestStatusChange("service", service)}
                                                                title={service.isActive ? t.disable : t.enable}
                                                                aria-label={`${service.isActive ? t.disable : t.enable}: ${service.nameEn}`}
                                                                className={cn(
                                                                    "grid h-9 w-9 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2",
                                                                    service.isActive
                                                                        ? "border-rose-200 text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-500 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                                                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-500 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40",
                                                                )}
                                                            >
                                                                {service.isActive
                                                                    ? <PowerOff size={16} />
                                                                    : <Power size={16} />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}

                                            {filteredServices.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                                                        {t.noServices}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {t.showing} {currentCount} {t.of} {totalCount}{" "}
                                    {tab === "clinics" ? t.clinics : t.services}
                                </span>

                                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <ShieldCheck size={15} className="text-teal-600 dark:text-teal-400" />
                                    {t.zatca}
                                </span>
                            </div>
                        </section>

                        <footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200/80 py-5 text-xs text-slate-400 sm:flex-row dark:border-slate-800">
                            <span>© {year ?? "..."} Mjdital - {t.footer}</span>
                            <span>{t.platform}</span>
                        </footer>
                    </main>
                </div>
            </div >

            {modal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-[3px] sm:p-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeModal();
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="management-modal-title"
                        className="my-auto max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-slate-800">
                            <div className="flex items-start gap-3">
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
                                    {modal === "clinic" ? <Hospital size={22} /> : <Coins size={22} />}
                                </div>

                                <div>
                                    <h2
                                        id="management-modal-title"
                                        className="text-lg font-extrabold text-slate-900 dark:text-white"
                                    >
                                        {modal === "clinic"
                                            ? editingClinic ? t.editClinic : t.newClinic
                                            : editingService ? t.editService : t.newService}
                                    </h2>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {modal === "clinic" ? t.clinicDescription : t.serviceDescription}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={submitting}
                                aria-label={t.close}
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <X size={19} />
                            </button>
                        </div>

                        {error && (
                            <div
                                role="alert"
                                className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 sm:mx-6"
                            >
                                {error}
                            </div>
                        )}

                        {modal === "clinic" ? (
                            <form onSubmit={handleClinicSubmit} className="space-y-5 p-5 sm:p-6">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label={t.clinicEn}>
                                        <input
                                            required
                                            maxLength={150}
                                            autoFocus
                                            value={clinicForm.nameEn}
                                            onChange={(event) =>
                                                setClinicForm((current) => ({
                                                    ...current,
                                                    nameEn: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g. Dental Clinic"
                                            className={cn(inputClass, "text-left")}
                                            dir="ltr"
                                        />
                                    </Field>

                                    <Field label={t.clinicAr}>
                                        <input
                                            required
                                            maxLength={150}
                                            value={clinicForm.nameAr}
                                            onChange={(event) =>
                                                setClinicForm((current) => ({
                                                    ...current,
                                                    nameAr: event.target.value,
                                                }))
                                            }
                                            placeholder="مثال: عيادة الأسنان"
                                            className={cn(inputClass, "text-right")}
                                            dir="rtl"
                                        />
                                    </Field>
                                </div>

                                <Field label={t.specialty}>
                                    <div className="relative">
                                        <select
                                            required
                                            value={clinicForm.specialty}
                                            onChange={(event) => {
                                                const selected = specialties.find(
                                                    (item) => item.code === event.target.value,
                                                );

                                                if (!selected) return;

                                                setClinicForm((current) => ({
                                                    ...current,
                                                    specialty: selected.code,
                                                    nphiesCode: selected.nphies,
                                                }));
                                            }}
                                            className={cn(inputClass, "appearance-none pe-10")}
                                        >
                                            {specialties.map((specialty) => (
                                                <option key={specialty.code} value={specialty.code}>
                                                    {locale === "ar" ? specialty.ar : specialty.en}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={16}
                                            className={cn(
                                                "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
                                                isRtl ? "left-3" : "right-3",
                                            )}
                                        />
                                    </div>
                                </Field>

                                <Field label={t.clinicCode} hint={t.nphiesNote}>
                                    <input
                                        required
                                        minLength={2}
                                        maxLength={30}
                                        pattern="[A-Za-z0-9-]{2,30}"
                                        value={clinicForm.nphiesCode}
                                        onChange={(event) =>
                                            setClinicForm((current) => ({
                                                ...current,
                                                nphiesCode: event.target.value.toUpperCase(),
                                            }))
                                        }
                                        placeholder="DENT-01"
                                        className={cn(inputClass, "font-mono text-left")}
                                        dir="ltr"
                                    />
                                </Field>

                                {!editingClinic && (
                                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                                                {t.status}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                {t.statusNote}
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={clinicForm.isActive}
                                            aria-label={t.status}
                                            onClick={() =>
                                                setClinicForm((current) => ({
                                                    ...current,
                                                    isActive: !current.isActive,
                                                }))
                                            }
                                            className={cn(
                                                "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                                                clinicForm.isActive
                                                    ? "bg-teal-600"
                                                    : "bg-slate-300 dark:bg-slate-700",
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
                                                    clinicForm.isActive
                                                        ? isRtl ? "right-1" : "left-[1.625rem]"
                                                        : isRtl ? "right-[1.625rem]" : "left-1",
                                                )}
                                            />
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={submitting}
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                                    >
                                        {t.cancel}
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
                                    >
                                        {submitting && (
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        )}
                                        {editingClinic ? t.saveChanges : t.saveClinic}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleServiceSubmit} className="space-y-5 p-5 sm:p-6">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label={t.serviceEn}>
                                        <input
                                            required
                                            maxLength={200}
                                            autoFocus
                                            value={serviceForm.nameEn}
                                            onChange={(event) =>
                                                setServiceForm((current) => ({
                                                    ...current,
                                                    nameEn: event.target.value,
                                                }))
                                            }
                                            placeholder="e.g. Dental Cleaning"
                                            className={cn(inputClass, "text-left")}
                                            dir="ltr"
                                        />
                                    </Field>

                                    <Field label={t.serviceAr}>
                                        <input
                                            required
                                            maxLength={200}
                                            value={serviceForm.nameAr}
                                            onChange={(event) =>
                                                setServiceForm((current) => ({
                                                    ...current,
                                                    nameAr: event.target.value,
                                                }))
                                            }
                                            placeholder="مثال: تنظيف الأسنان"
                                            className={cn(inputClass, "text-right")}
                                            dir="rtl"
                                        />
                                    </Field>
                                </div>

                                <Field label={t.serviceCode}>
                                    <input
                                        required
                                        minLength={2}
                                        maxLength={40}
                                        pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,39}"
                                        value={serviceForm.code}
                                        onChange={(event) =>
                                            setServiceForm((current) => ({
                                                ...current,
                                                code: event.target.value.toUpperCase(),
                                            }))
                                        }
                                        placeholder="e.g. INT-DENT-01"
                                        className={cn(inputClass, "font-mono text-left")}
                                        dir="ltr"
                                    />
                                </Field>

                                {/*
                                  * عند تعديل خدمة، نعرض العيادة المرتبطة للقراءة فقط.
                                  * لا تغيّر updateServiceAction ارتباط الخدمة بعيادة أخرى.
                                  */}
                                {editingService ? (
                                    <Field label={t.associatedClinic}>
                                        <input
                                            readOnly
                                            value={clinicName(editingService.clinic)}
                                            className={cn(inputClass, "cursor-not-allowed")}
                                        />
                                    </Field>
                                ) : (
                                    <Field label={t.associatedClinic}>
                                        <div className="relative">
                                            <select
                                                required
                                                value={serviceForm.clinicId}
                                                onChange={(event) =>
                                                    setServiceForm((current) => ({
                                                        ...current,
                                                        clinicId: event.target.value,
                                                    }))
                                                }
                                                className={cn(inputClass, "appearance-none pe-10")}
                                            >
                                                <option value="" disabled>
                                                    {t.chooseClinic}
                                                </option>
                                                {activeClinics.map((clinic) => (
                                                    <option key={clinic.id} value={clinic.id}>
                                                        {clinicName(clinic)}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown
                                                size={16}
                                                className={cn(
                                                    "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
                                                    isRtl ? "left-3" : "right-3",
                                                )}
                                            />
                                        </div>
                                    </Field>
                                )}

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Field label={t.basePrice}>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            max="9999999999.99"
                                            step="0.01"
                                            inputMode="decimal"
                                            value={serviceForm.basePrice}
                                            onChange={(event) =>
                                                setServiceForm((current) => ({
                                                    ...current,
                                                    basePrice: event.target.value,
                                                }))
                                            }
                                            placeholder="0.00"
                                            className={cn(inputClass, "font-mono text-left")}
                                            dir="ltr"
                                        />
                                    </Field>

                                    <Field label={t.vat}>
                                        <div className="relative">
                                            <select
                                                value={serviceForm.vatRate}
                                                onChange={(event) =>
                                                    setServiceForm((current) => ({
                                                        ...current,
                                                        vatRate: Number(event.target.value) as 0 | 15,
                                                    }))
                                                }
                                                className={cn(inputClass, "appearance-none pe-10")}
                                            >
                                                <option value={15}>{t.standardVat}</option>
                                                <option value={0}>{t.exemptVat}</option>
                                            </select>
                                            <ChevronDown
                                                size={16}
                                                className={cn(
                                                    "pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400",
                                                    isRtl ? "left-3" : "right-3",
                                                )}
                                            />
                                        </div>
                                    </Field>
                                </div>

                                <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/80 to-cyan-50/50 p-4 dark:border-teal-900 dark:from-teal-950/30 dark:to-cyan-950/20">
                                    <div className="mb-4 flex items-center gap-2">
                                        <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-400">
                                            <CircleDollarSign size={19} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                                                {t.billing}
                                            </p>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                {t.vatNote}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">
                                                {t.basePrice}
                                            </span>
                                            <span className="font-semibold tabular-nums text-slate-800 dark:text-white">
                                                {validBaseAmount ? money(baseAmount, locale) : "—"} {t.sar}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-slate-600 dark:text-slate-300">
                                                {t.taxAmount} ({serviceForm.vatRate}%)
                                            </span>
                                            <span className="font-semibold tabular-nums text-slate-800 dark:text-white">
                                                {validBaseAmount ? money(vatAmount, locale) : "—"} {t.sar}
                                            </span>
                                        </div>

                                        <div className="border-t border-teal-200 pt-3 dark:border-teal-900">
                                            <Field label={t.totalPrice}>
                                                <input
                                                    type="text"
                                                    readOnly
                                                    disabled
                                                    aria-label={t.totalPrice}
                                                    value={
                                                        validBaseAmount
                                                            ? `${money(totalAmount, locale)} ${t.sar}`
                                                            : ""
                                                    }
                                                    placeholder="0.00"
                                                    className={cn(
                                                        inputClass,
                                                        "border-teal-200 bg-white font-bold text-teal-700 dark:border-teal-900 dark:bg-slate-900 dark:text-teal-400",
                                                    )}
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={submitting}
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                                    >
                                        {t.cancel}
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={
                                            submitting ||
                                            !validBaseAmount ||
                                            (!editingService && activeClinics.length === 0)
                                        }
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submitting && (
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        )}
                                        {editingService ? t.saveChanges : t.saveService}
                                    </button>
                                </div>
                            </form>
                        )}
                    </section>
                </div>
            )
            }

            {
                statusTarget && (
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-[3px]"
                        onMouseDown={(event) => {
                            if (
                                event.target === event.currentTarget &&
                                !statusSubmitting
                            ) {
                                closeStatusModal();
                            }
                        }}
                    >
                        <section
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="status-dialog-title"
                            aria-describedby="status-dialog-description"
                            className="my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                                        statusTarget.isActive
                                            ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                                    )}
                                >
                                    {statusTarget.isActive
                                        ? <PowerOff size={21} />
                                        : <Power size={21} />}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h2
                                        id="status-dialog-title"
                                        className="text-lg font-extrabold text-slate-900 dark:text-white"
                                    >
                                        {t.confirm}
                                    </h2>

                                    <p
                                        id="status-dialog-description"
                                        className="mt-2 break-words text-sm leading-7 text-slate-600 dark:text-slate-300"
                                    >
                                        {statusTarget.isActive
                                            ? t.confirmDisable
                                            : t.confirmEnable}{" "}
                                        {statusTarget.name}؟
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    aria-label={t.close}
                                    disabled={statusSubmitting}
                                    onClick={closeStatusModal}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {error && (
                                <div
                                    role="alert"
                                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                                >
                                    {error}
                                </div>
                            )}

                            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    disabled={statusSubmitting}
                                    onClick={closeStatusModal}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                                >
                                    {t.cancel}
                                </button>

                                <button
                                    type="button"
                                    disabled={statusSubmitting}
                                    onClick={() => void handleToggleStatus()}
                                    className={cn(
                                        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition disabled:cursor-wait disabled:opacity-60",
                                        statusTarget.isActive
                                            ? "bg-rose-600 hover:bg-rose-700"
                                            : "bg-emerald-600 hover:bg-emerald-700",
                                    )}
                                >
                                    {statusSubmitting ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    ) : statusTarget.isActive ? (
                                        <PowerOff size={16} />
                                    ) : (
                                        <Power size={16} />
                                    )}

                                    {statusTarget.isActive ? t.disable : t.enable}
                                </button>
                            </div>
                        </section>
                    </div>
                )
            }

            <style jsx global>{`
                .dashboard-card {
                    border: 1px solid #e8edf3;
                    border-radius: 16px;
                    background: var(--dashboard-card, #ffffff);
                    box-shadow: 0 1px 2px rgb(15 23 42 / 0.025);
                }

                .dark .dashboard-card {
                    border-color: #1e293b;
                    background: var(--card, #020617);
                }

                @media (prefers-reduced-motion: reduce) {
                    *,
                    *::before,
                    *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        scroll-behavior: auto !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            `}</style>
        </div >
    );
}
