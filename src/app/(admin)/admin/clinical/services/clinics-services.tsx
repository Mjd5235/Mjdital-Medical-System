"use client";

import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
    Activity,
    Building2,
    Check,
    ChevronDown,
    ChevronLeft,
    CircleAlert,
    CircleDollarSign,
    ClipboardList,
    Coins,
    Hospital,
    Pencil,
    Plus,
    Power,
    PowerOff,
    Search,
    ShieldCheck,
    Trash2,
    TriangleAlert,
    X,
} from "lucide-react";

import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import type { Locale } from "@/lib/i18n/types";

import {
    createClinicAction,
    createServiceAction,
    updateClinicAction,
    updateServiceAction,
    toggleClinicStatusAction,
    toggleServiceStatusAction,
    deleteClinicAction,
    deleteServiceAction,
    getClinicsData,
    getServicesData,
    type ClinicSpecialty,
    type CreateClinicInput,
    type CreateServiceInput,
    type UpdateClinicInput,
    type UpdateServiceInput,
} from "./actions";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import { AnimatePresence, motion } from "framer-motion";

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

type DeleteTarget = {
    type: "clinic" | "service";
    id: string;
    name: string;
};

type Toast = { kind: "success" | "error"; message: string };

const TEMP_PREFIX = "temp-";

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
        { code: "OBG", en: "Obstetrics & Gynecology", ar: "النساء والولادة", nphies: "OBG-07" },
        { code: "ORT", en: "Orthopedics", ar: "جراحة العظام", nphies: "ORT-08" },
        { code: "OPH", en: "Ophthalmology", ar: "طب العيون", nphies: "OPH-09" },
        { code: "ENT", en: "ENT / Otolaryngology", ar: "أنف وأذن وحنجرة", nphies: "ENT-10" },
        { code: "LAB", en: "Laboratory", ar: "المختبر / التحاليل", nphies: "LAB-11" },
        { code: "RAD", en: "Radiology", ar: "الأشعة / السونار", nphies: "RAD-12" },
    ];

const translations = {
    ar: {
        greeting: "مرحباً، نورة",
        role: "مدير النظام",
        title: "العيادات والخدمات",
        subtitle: "إدارة العيادات والتخصصات والخدمات الطبية",
        dashboard: "الهيكل الطبي ونفيس",
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
        loading: "جارٍ التحميل",
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
        serviceClinicInactive: "لا يمكن تفعيل الخدمة لأن العيادة المرتبطة بها معطلة حالياً. يرجى تفعيل العيادة أولاً.",
        serviceClinicDisabledSelect: "لا يمكن ربط الخدمة بعيادة معطلة. يرجى تفعيل العيادة أولاً.",
        priceRequired: "يرجى إدخال سعر صالح.",
        close: "إغلاق النافذة",
        newClinic: "عيادة جديدة",
        newService: "خدمة جديدة",
        edit: "تعديل",
        editClinic: "تعديل العيادة",
        editService: "تعديل الخدمة",
        enable: "تفعيل",
        disable: "تعطيل",
        delete: "حذف",
        deleteClinic: "حذف العيادة",
        deleteService: "حذف الخدمة",
        confirmDeleteTitle: "تأكيد الحذف",
        confirmDeleteClinic: "هل أنت متأكد من حذف العيادة",
        confirmDeleteService: "هل أنت متأكد من حذف الخدمة",
        deleteWarning: "لا يمكن التراجع عن هذا الإجراء.",
        deleteClinicHint: "سيؤدي حذف العيادة إلى حذف كل ما يرتبط بها نهائياً. إذا أردت الاحتفاظ بالبيانات فعطّل العيادة بدلاً من حذفها.",
        deleteServiceHint: "لا يمكن حذف خدمة مستخدمة في شفتات أو مواعيد. عطّلها بدلاً من ذلك.",
        clinicHasServices: "لا يمكن حذف هذه العيادة لأنها تحتوي على خدمات. احذف الخدمات أولاً أو عطّل العيادة.",
        clinicCascadeWarning: "تحذير: حذف هذه العيادة سيؤدي إلى حذف جميع الخدمات المرتبطة بها وشفتات الأطباء والسجلات ذات الصلة بشكل نهائي.",
        deleteEverything: "حذف العيادة وكل بياناتها",
        deletedClinic: "تم حذف العيادة.",
        deletedService: "تم حذف الخدمة.",
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
        nphiesNote: "الرمز المعروض رمز داخلي للتخصص وليس معرف تسجيل رسمي لدى نفيس. يتم تحديثه تلقائياً عند تغيير التخصص.",
        platform: "منصة إدارة الرعاية الصحية",
        footer: "جميع الحقوق محفوظة",
        systemOnline: "النظام يعمل بشكل طبيعي",
        systemStatus: "حالة النظام",
        sar: "ر.س",
        taxAmount: "قيمة الضريبة",
        tryAgain: "حاول مرة أخرى",
        notifications: "الإشعارات",
        menuOpen: "فتح القائمة الجانبية",
        syncing: "جارٍ المزامنة…",
    },
    en: {
        greeting: "Hello, Noura",
        role: "System Administrator",
        title: "Clinics & Services",
        subtitle: "Manage clinics, specialties, and medical services",
        dashboard: "Clinical Setup & NPHIES",
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
        loading: "Loading",
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
        serviceClinicInactive: "This service cannot be activated because its associated clinic is inactive. Activate the clinic first.",
        serviceClinicDisabledSelect: "A service cannot be linked to an inactive clinic. Activate the clinic first.",
        priceRequired: "Enter a valid price.",
        close: "Close dialog",
        newClinic: "New Clinic",
        newService: "New Service",
        edit: "Edit",
        editClinic: "Edit Clinic",
        editService: "Edit Service",
        enable: "Enable",
        disable: "Disable",
        delete: "Delete",
        deleteClinic: "Delete Clinic",
        deleteService: "Delete Service",
        confirmDeleteTitle: "Confirm Deletion",
        confirmDeleteClinic: "Are you sure you want to delete the clinic",
        confirmDeleteService: "Are you sure you want to delete the service",
        deleteWarning: "This action cannot be undone.",
        deleteClinicHint: "Deleting a clinic permanently removes everything linked to it. To keep the data, disable the clinic instead.",
        deleteServiceHint: "A service used in shifts or appointments cannot be deleted. Disable it instead.",
        clinicHasServices: "This clinic cannot be deleted because it still has services. Delete the services first or disable the clinic.",
        clinicCascadeWarning: "Warning: Deleting this clinic will permanently delete all its associated services, doctor shifts, and related records.",
        deleteEverything: "Delete clinic and all its data",
        deletedClinic: "Clinic deleted.",
        deletedService: "Service deleted.",
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
        nphiesNote: "The displayed code is an internal catalog code, not an official NPHIES enrollment identifier. It updates automatically when the specialty changes.",
        platform: "Healthcare Management Platform",
        footer: "All rights reserved",
        systemOnline: "All systems operational",
        systemStatus: "System Status",
        sar: "SAR",
        taxAmount: "VAT Amount",
        tryAgain: "Try again",
        notifications: "Notifications",
        menuOpen: "Open sidebar",
        syncing: "Syncing…",
    },
} as const;

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

/** Puts a removed row back at (about) its original position after a failed delete. */
function insertAt<T>(list: T[], item: T, index: number): T[] {
    const next = [...list];

    next.splice(Math.min(Math.max(index, 0), next.length), 0, item);

    return next;
}

/** Same math the server uses (2 decimals), used to build optimistic rows. */
function computePricing(basePrice: number, vatRate: number) {
    const base = Math.round(basePrice * 100) / 100;
    const vat = Math.round(base * vatRate) / 100;
    const total = Math.round((base + vat) * 100) / 100;

    return {
        basePrice: base.toFixed(2),
        vatAmount: vat.toFixed(2),
        totalPrice: total.toFixed(2),
    };
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



/* ---------------------- shared design system (same as Doctors) ---------------------- */

const inputClass =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:border-teal-500 hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const dangerButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const cardSurface =
    "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xl shadow-black/20";

const iconButtonClass =
    "grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-teal-500 hover:text-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50";

const deleteButtonClass =
    "grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-rose-500 hover:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50";

const modalBackdropClass =
    "fixed inset-0 flex items-center justify-center overflow-y-auto bg-slate-900/40 dark:bg-slate-950/80 p-3 sm:p-6";

const modalPanelClass =
    "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-black/60";

/** Modal open/close animation shared with the Doctors page. */
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

function StatusBadge({
    active,
    activeLabel,
    inactiveLabel,
}: {
    active: boolean;
    activeLabel: string;
    inactiveLabel: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold",
                active
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
        >
            <span
                className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    active ? "bg-emerald-500 dark:bg-emerald-400" : "bg-amber-500 dark:bg-amber-400",
                )}
            />
            {active ? activeLabel : inactiveLabel}
        </span>
    );
}

/* ------------------------------- skeleton loading ------------------------------- */

/** Shimmering placeholder block (slate-200 / slate-800 base with a moving highlight). */
function Skeleton({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "relative block overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800",
                "after:absolute after:inset-0 after:-translate-x-full after:animate-[mj-shimmer_1.6s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/70 after:to-transparent dark:after:via-slate-600/30",
                className,
            )}
        />
    );
}

function TableSkeleton({
    variant,
    headers,
    loadingLabel,
}: {
    variant: "clinics" | "services";
    headers: string[];
    loadingLabel: string;
}) {
    const rows = Array.from({ length: 6 }, (_, index) => index);
    const isClinics = variant === "clinics";

    return (
        <table
            aria-busy="true"
            className={cn(
                "w-full border-collapse text-start text-sm",
                isClinics ? "min-w-[900px]" : "min-w-[1100px]",
            )}
        >
            <caption className="sr-only">{loadingLabel}</caption>

            <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {headers.map((header, index) => (
                        <th
                            key={`${header}-${index}`}
                            scope="col"
                            className={cn(
                                "py-5 text-start align-middle",
                                index === 0 || index === headers.length - 1
                                    ? "px-6"
                                    : "px-4",
                            )}
                        >
                            {header}
                        </th>
                    ))}
                </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {rows.map((row) =>
                    isClinics ? (
                        <tr key={row}>
                            <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-3 w-28" />
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-4 w-28" />
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-8 w-24 rounded-lg" />
                            </td>
                            <td className="px-6 py-5">
                                <Skeleton className="h-10 w-28 rounded-lg" />
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                </div>
                            </td>
                        </tr>
                    ) : (
                        <tr key={row}>
                            <td className="px-6 py-5">
                                <Skeleton className="h-8 w-20 rounded-lg" />
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-4 w-28" />
                            </td>
                            <td className="px-4 py-5">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-28" />
                                </div>
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-4 w-24" />
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-8 w-16 rounded-lg" />
                            </td>
                            <td className="px-6 py-5">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            </td>
                            <td className="px-4 py-5">
                                <Skeleton className="h-10 w-28 rounded-lg" />
                            </td>
                            <td className="px-6 py-5">
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                </div>
                            </td>
                        </tr>
                    ),
                )}
            </tbody>
        </table>
    );
}

/* ------------------------------ modern dropdown (select) ------------------------------ */

type SelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

type SelectPosition = {
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
};

/**
 * Dark-theme dropdown used for every select in this page.
 * Teal accents, a check mark + teal background on the selected item, keyboard support
 * (arrows / Home / End / Enter / Escape) and a portal-based panel so it is never clipped
 * by a scrolling modal.
 */
function SelectField({
    value,
    onChange,
    options,
    placeholder,
    isRtl,
    ariaLabel,
    disabled,
}: {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    isRtl: boolean;
    ariaLabel: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [position, setPosition] = useState<SelectPosition | null>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();

    const selectedIndex = options.findIndex((option) => option.value === value);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;

        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const gap = 6;
        const desired = 288;
        const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
        const spaceAbove = rect.top - gap - 12;
        const placeAbove = spaceBelow < Math.min(desired, 200) && spaceAbove > spaceBelow;
        const available = placeAbove ? spaceAbove : spaceBelow;

        setPosition({
            left: rect.left,
            width: rect.width,
            maxHeight: Math.max(120, Math.min(desired, available)),
            ...(placeAbove
                ? { bottom: window.innerHeight - rect.top + gap }
                : { top: rect.bottom + gap }),
        });
    }, []);

    const firstEnabled = useCallback(() => options.findIndex((option) => !option.disabled), [options]);

    const lastEnabled = useCallback(() => {
        for (let index = options.length - 1; index >= 0; index -= 1) {
            if (!options[index].disabled) return index;
        }

        return -1;
    }, [options]);

    const move = useCallback(
        (from: number, step: 1 | -1) => {
            if (options.length === 0) return -1;

            let index = from;

            for (let count = 0; count < options.length; count += 1) {
                index = (index + step + options.length) % options.length;

                if (!options[index].disabled) return index;
            }

            return from;
        },
        [options],
    );

    const openList = useCallback(() => {
        if (disabled) return;

        updatePosition();
        setActiveIndex(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : firstEnabled());
        setOpen(true);
    }, [disabled, updatePosition, selectedIndex, options, firstEnabled]);

    const closeList = useCallback(() => setOpen(false), []);

    const choose = useCallback(
        (next: string) => {
            onChange(next);
            setOpen(false);
            triggerRef.current?.focus();
        },
        [onChange],
    );

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;

            if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;

            setOpen(false);
        };

        const handleReposition = () => updatePosition();

        document.addEventListener("mousedown", handlePointerDown);
        window.addEventListener("resize", handleReposition);
        window.addEventListener("scroll", handleReposition, true);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            window.removeEventListener("resize", handleReposition);
            window.removeEventListener("scroll", handleReposition, true);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        document
            .getElementById(`${listId}-option-${activeIndex}`)
            ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex, listId]);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                if (!open) openList();
                else setActiveIndex((current) => move(current, 1));
                break;

            case "ArrowUp":
                event.preventDefault();
                if (!open) openList();
                else setActiveIndex((current) => move(current, -1));
                break;

            case "Home":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(firstEnabled());
                }
                break;

            case "End":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(lastEnabled());
                }
                break;

            case "Enter":
            case " ":
                event.preventDefault();
                if (!open) {
                    openList();
                } else if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
                    choose(options[activeIndex].value);
                }
                break;

            case "Escape":
                if (open) {
                    // Closes only the dropdown, not the surrounding modal.
                    event.preventDefault();
                    event.stopPropagation();
                    closeList();
                }
                break;

            case "Tab":
                closeList();
                break;

            default:
                break;
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={
                    open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
                }
                disabled={disabled}
                onClick={() => (open ? closeList() : openList())}
                onKeyDown={handleKeyDown}
                className={cn(
                    inputClass,
                    "flex items-center justify-between gap-2 text-start",
                    open && "border-teal-500 ring-2 ring-teal-500/20",
                )}
            >
                <span
                    className={cn(
                        "min-w-0 truncate",
                        !selectedOption && "text-slate-500 dark:text-slate-400",
                    )}
                >
                    {selectedOption?.label ?? placeholder ?? ""}
                </span>

                <ChevronDown
                    size={16}
                    className={cn(
                        "shrink-0 text-slate-400 transition-transform duration-200",
                        open && "rotate-180 text-teal-500",
                    )}
                />
            </button>

            {open &&
                position &&
                typeof document !== "undefined" &&
                createPortal(
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel}
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            left: position.left,
                            width: position.width,
                            top: position.top,
                            bottom: position.bottom,
                            maxHeight: position.maxHeight,
                        }}
                        className="z-[80] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/60 dark:border-teal-500/20 dark:bg-slate-900"
                    >
                        {options.map((option, index) => {
                            const selected = option.value === value;
                            const active = index === activeIndex;

                            return (
                                <li
                                    key={option.value || `option-${index}`}
                                    id={`${listId}-option-${index}`}
                                    role="option"
                                    aria-selected={selected}
                                    aria-disabled={option.disabled || undefined}
                                    onMouseEnter={() => {
                                        if (!option.disabled) setActiveIndex(index);
                                    }}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                        if (!option.disabled) choose(option.value);
                                    }}
                                    className={cn(
                                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                                        selected
                                            ? "bg-teal-500/15 font-semibold text-teal-700 dark:bg-teal-600/20 dark:text-teal-300"
                                            : "text-slate-700 dark:text-slate-200",
                                        active &&
                                        !selected &&
                                        "bg-slate-100 dark:bg-slate-800",
                                        option.disabled && "cursor-not-allowed opacity-45",
                                    )}
                                >
                                    <span className="min-w-0 truncate">{option.label}</span>

                                    {selected && (
                                        <Check
                                            size={16}
                                            className="shrink-0 text-teal-600 dark:text-teal-400"
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>,
                    document.body,
                )}
        </>
    );
}

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
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [toast, setToast] = useState<Toast | null>(null);
    const [year, setYear] = useState<number | null>(null);

    const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);
    const [editingService, setEditingService] = useState<ServiceRow | null>(null);
    const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

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

    /**
     * Background sync bookkeeping. Nothing here ever blocks the UI:
     *  - `queueRef` chains server calls per record id, so two actions on the same
     *    record reach the server in click order, while different records run in parallel.
     *  - `pendingCountRef` lets a finished request know if newer optimistic
     *    changes are still queued (so it must not overwrite or roll them back).
     *  - `syncing` only drives a subtle dimming of the affected row.
     */
    const queueRef = useRef(new Map<string, Promise<void>>());
    const pendingCountRef = useRef(new Map<string, number>());
    const [syncing, setSyncing] = useState<ReadonlySet<string>>(() => new Set<string>());

    const clinicsRef = useRef(clinics);
    const servicesRef = useRef(services);
    clinicsRef.current = clinics;
    servicesRef.current = services;

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

    useEffect(() => {
        if (!toast) return;

        const timer = window.setTimeout(() => setToast(null), 6000);

        return () => window.clearTimeout(timer);
    }, [toast]);

    useEffect(() => {
        if (!success) return;

        const timer = window.setTimeout(() => setSuccess(""), 5000);

        return () => window.clearTimeout(timer);
    }, [success]);

    // Only used for the very first load (and the explicit "try again" link).
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
        if (!modal && !statusTarget && !deleteTarget) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;

            setModal(null);
            setEditingClinic(null);
            setEditingService(null);
            setStatusTarget(null);
            setDeleteTarget(null);
            setError("");
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [modal, statusTarget, deleteTarget]);

    /* ------------------------- optimistic infrastructure ------------------------ */

    const notifyError = useCallback((message: string) => {
        setToast({ kind: "error", message });
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
    const isLastPending = useCallback(
        (id: string) => (pendingCountRef.current.get(id) ?? 0) <= 1,
        [],
    );

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

    const patchClinicLocal = useCallback((row: ClinicRow) => {
        setClinics((current) =>
            current.map((clinic) => (clinic.id === row.id ? row : clinic)),
        );
    }, []);

    const patchServiceLocal = useCallback((row: ServiceRow) => {
        setServices((current) =>
            current.map((service) => (service.id === row.id ? row : service)),
        );
    }, []);

    /** Keeps the clinic names embedded in service rows in sync with the clinic. */
    const syncClinicNames = useCallback(
        (clinic: Pick<ClinicRow, "id" | "nameAr" | "nameEn">) => {
            setServices((current) =>
                current.map((service) =>
                    service.clinicId === clinic.id
                        ? {
                            ...service,
                            clinic: {
                                id: clinic.id,
                                nameAr: clinic.nameAr,
                                nameEn: clinic.nameEn,
                            },
                        }
                        : service,
                ),
            );
        },
        [],
    );

    /* --------------------------------- derived --------------------------------- */

    // Temporary (unconfirmed) clinics can't own services yet.
    const activeClinics = useMemo(
        () => clinics.filter((clinic) => clinic.isActive && !isTempId(clinic.id)),
        [clinics],
    );

    const generateServiceCode = useCallback(
        (clinicId: string) => {
            const clinic = clinics.find((item) => item.id === clinicId);
            if (!clinic) return "";

            const prefix = specialties.some(
                (item) => item.code === clinic.specialty,
            )
                ? clinic.specialty!
                : "GEN";

            const existingCodes = services
                .filter((service) => service.clinicId === clinicId)
                .map((service) => service.code);

            let maxNumber = 100;

            for (const code of existingCodes) {
                const match = new RegExp(
                    `^${prefix}-(\\d+)$`,
                    "i",
                ).exec(code);

                if (match) {
                    maxNumber = Math.max(maxNumber, Number(match[1]));
                }
            }

            return `${prefix}-${maxNumber + 1}`;
        },
        [clinics, services],
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

    const specialtyOptions: SelectOption[] = specialties.map((item) => ({
        value: item.code,
        label: locale === "ar" ? item.ar : item.en,
    }));

    const clinicOptions: SelectOption[] = clinics.map((clinic) => ({
        value: clinic.id,
        label: `${clinicName(clinic)}${!clinic.isActive ? ` (${t.inactive})` : ""}`,
        disabled: !clinic.isActive || isTempId(clinic.id),
    }));

    const vatOptions: SelectOption[] = [
        { value: "15", label: t.standardVat },
        { value: "0", label: t.exemptVat },
    ];

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
        const clinicId = activeClinics[0]?.id ?? "";

        setServiceForm({
            clinicId,
            code: generateServiceCode(clinicId),
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
        setModal(null);
        setEditingClinic(null);
        setEditingService(null);
        setError("");
    };

    const openEditClinic = (clinic: ClinicRow) => {
        if (isTempId(clinic.id)) return;

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
        if (isTempId(service.id)) return;

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
        if (isTempId(item.id)) return;

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

    const requestDelete = (
        type: "clinic" | "service",
        item: ClinicRow | ServiceRow,
    ) => {
        if (isTempId(item.id)) return;

        setError("");
        setSuccess("");

        const name =
            type === "clinic"
                ? clinicName(item as ClinicRow)
                : isRtl
                    ? (item as ServiceRow).nameAr
                    : (item as ServiceRow).nameEn;

        setDeleteTarget({ type, id: item.id, name });
    };

    /* ------------------------------ clinic mutations ------------------------------ */

    const handleClinicSubmit = (event: FormEvent<HTMLFormElement>) => {
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

        const nameEn = clinicForm.nameEn.trim();
        const nameAr = clinicForm.nameAr.trim();
        const nphiesCode = clinicForm.nphiesCode.trim().toUpperCase();
        const now = new Date().toISOString();

        if (editingClinic) {
            const previous =
                clinicsRef.current.find((clinic) => clinic.id === editingClinic.id) ??
                editingClinic;

            if (isTempId(previous.id)) return;

            const optimistic: ClinicRow = {
                ...previous,
                nameEn,
                nameAr,
                specialty: clinicForm.specialty,
                nphiesCode,
                updatedAt: now,
            };

            // 0ms: update the row and close the dialog immediately.
            patchClinicLocal(optimistic);
            syncClinicNames(optimistic);
            setSuccess(t.updatedClinic);
            setModal(null);
            setEditingClinic(null);
            setSearch("");

            const input: UpdateClinicInput = {
                nameEn,
                nameAr,
                specialty: clinicForm.specialty,
                nphiesCode,
            };

            enqueue(previous.id, async () => {
                const rollback = (message: string) => {
                    if (isLastPending(previous.id)) {
                        patchClinicLocal(previous);
                        syncClinicNames(previous);
                    }

                    setSuccess("");
                    notifyError(message);
                };

                try {
                    const result = await updateClinicAction(previous.id, input);

                    if (!result.success || !result.data) {
                        rollback(result.error || t.failed);
                        return;
                    }

                    if (isLastPending(previous.id)) {
                        const confirmed = result.data as ClinicRow;

                        patchClinicLocal(confirmed);
                        syncClinicNames(confirmed);
                    }
                } catch {
                    rollback(t.failed);
                }
            });

            return;
        }

        const tempId = makeTempId();

        const optimistic: ClinicRow = {
            id: tempId,
            nameEn,
            nameAr,
            specialty: clinicForm.specialty,
            nphiesCode,
            isActive: clinicForm.isActive,
            createdAt: now,
            updatedAt: now,
        };

        setClinics((current) => [optimistic, ...current]);
        setSuccess(t.successClinic);
        setModal(null);
        setSearch("");

        const input: CreateClinicInput = {
            ...clinicForm,
            nameEn,
            nameAr,
            nphiesCode,
        };

        enqueue(tempId, async () => {
            const rollback = (message: string) => {
                setClinics((current) => current.filter((clinic) => clinic.id !== tempId));
                setSuccess("");
                notifyError(message);
            };

            try {
                const result = await createClinicAction(input);

                if (!result.success || !result.data) {
                    rollback(result.error || t.failed);
                    return;
                }

                const confirmed = result.data as ClinicRow;

                setClinics((current) =>
                    current.map((clinic) => (clinic.id === tempId ? confirmed : clinic)),
                );
            } catch {
                rollback(t.failed);
            }
        });
    };

    /* ------------------------------ service mutations ----------------------------- */

    const handleServiceSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!serviceForm.nameEn.trim() || !serviceForm.nameAr.trim()) {
            setError(t.nameRequired);
            return;
        }

        if (!editingService && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(serviceForm.code.trim())) {
            setError(t.codeRequired);
            return;
        }

        const targetClinic = clinics.find(
            (clinic) =>
                clinic.id === serviceForm.clinicId &&
                clinic.isActive &&
                !isTempId(clinic.id),
        );

        if (!targetClinic) {
            setError(t.clinicRequired);
            return;
        }

        if (!validBaseAmount) {
            setError(t.priceRequired);
            return;
        }

        const code = (
            editingService &&
                serviceForm.clinicId !== editingService.clinicId
                ? generateServiceCode(serviceForm.clinicId)
                : serviceForm.code
        ).trim().toUpperCase();
        const nameEn = serviceForm.nameEn.trim();
        const nameAr = serviceForm.nameAr.trim();
        const vatRate = Number(serviceForm.vatRate) as 0 | 15;
        const pricing = computePricing(baseAmount, vatRate);
        const now = new Date().toISOString();

        const clinicRef = {
            id: targetClinic.id,
            nameAr: targetClinic.nameAr,
            nameEn: targetClinic.nameEn,
        };

        if (editingService) {
            const previous =
                servicesRef.current.find((service) => service.id === editingService.id) ??
                editingService;

            if (isTempId(previous.id)) return;

            const optimistic: ServiceRow = {
                ...previous,
                clinicId: targetClinic.id,
                clinic: clinicRef,
                code,
                nameEn,
                nameAr,
                basePrice: pricing.basePrice,
                vatRate: String(vatRate),
                vatAmount: pricing.vatAmount,
                totalPrice: pricing.totalPrice,
                updatedAt: now,
            };

            patchServiceLocal(optimistic);
            setSuccess(t.updatedService);
            setModal(null);
            setEditingService(null);
            setSearch("");

            const input: UpdateServiceInput = {
                clinicId: serviceForm.clinicId,
                code,
                nameEn,
                nameAr,
                basePrice: pricing.basePrice,
                vatRate,
            };

            enqueue(previous.id, async () => {
                const rollback = (message: string) => {
                    if (isLastPending(previous.id)) patchServiceLocal(previous);

                    setSuccess("");
                    notifyError(message);
                };

                try {
                    const result = await updateServiceAction(previous.id, input);

                    if (!result.success || !result.data) {
                        rollback(result.error || t.failed);
                        return;
                    }

                    if (isLastPending(previous.id)) {
                        patchServiceLocal(result.data as ServiceRow);
                    }
                } catch {
                    rollback(t.failed);
                }
            });

            return;
        }

        const tempId = makeTempId();

        const optimistic: ServiceRow = {
            id: tempId,
            clinicId: targetClinic.id,
            clinic: clinicRef,
            code,
            nameEn,
            nameAr,
            basePrice: pricing.basePrice,
            vatRate: String(vatRate),
            vatAmount: pricing.vatAmount,
            totalPrice: pricing.totalPrice,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        };

        setServices((current) => [optimistic, ...current]);
        setSuccess(t.successService);
        setModal(null);
        setSearch("");

        const input: CreateServiceInput = {
            clinicId: serviceForm.clinicId,
            code,
            nameEn,
            nameAr,
            basePrice: pricing.basePrice,
            vatRate,
        };

        enqueue(tempId, async () => {
            const rollback = (message: string) => {
                setServices((current) => current.filter((service) => service.id !== tempId));
                setSuccess("");
                notifyError(message);
            };

            try {
                const result = await createServiceAction(input);

                if (!result.success || !result.data) {
                    rollback(result.error || t.failed);
                    return;
                }

                // The server is authoritative for the generated code.
                const confirmed = result.data as ServiceRow;

                setServices((current) =>
                    current.map((service) => (service.id === tempId ? confirmed : service)),
                );
            } catch {
                rollback(t.failed);
            }
        });
    };

    /* ------------------------------- status toggles ------------------------------- */

    const handleToggleStatus = () => {
        if (!statusTarget) return;

        const target = statusTarget;
        const nextActive = !target.isActive;

        if (isTempId(target.id)) {
            setStatusTarget(null);
            return;
        }

        if (target.type === "clinic") {
            const previousClinic = clinicsRef.current.find((clinic) => clinic.id === target.id);

            if (!previousClinic) {
                setStatusTarget(null);
                return;
            }

            // Services that will be switched off together with the clinic.
            const cascadedServiceIds = !nextActive
                ? servicesRef.current
                    .filter((service) => service.clinicId === target.id && service.isActive)
                    .map((service) => service.id)
                : [];

            // 0ms: flip the clinic (and cascade) right away and close the dialog.
            patchClinicLocal({ ...previousClinic, isActive: nextActive });

            if (cascadedServiceIds.length > 0) {
                const ids = new Set(cascadedServiceIds);

                setServices((current) =>
                    current.map((service) =>
                        ids.has(service.id) ? { ...service, isActive: false } : service,
                    ),
                );
            }

            setStatusTarget(null);
            setError("");
            setSuccess(t.statusUpdated);

            enqueue(target.id, async () => {
                const rollback = (message: string) => {
                    if (isLastPending(target.id)) {
                        setClinics((current) =>
                            current.map((clinic) =>
                                clinic.id === target.id
                                    ? { ...clinic, isActive: previousClinic.isActive }
                                    : clinic,
                            ),
                        );

                        if (cascadedServiceIds.length > 0) {
                            const ids = new Set(cascadedServiceIds);

                            setServices((current) =>
                                current.map((service) =>
                                    ids.has(service.id) ? { ...service, isActive: true } : service,
                                ),
                            );
                        }
                    }

                    setSuccess("");
                    notifyError(message);
                };

                try {
                    const result = await toggleClinicStatusAction(target.id, nextActive);

                    if (!result.success || !result.data) {
                        rollback(result.error || t.failed);
                        return;
                    }

                    if (isLastPending(target.id)) patchClinicLocal(result.data as ClinicRow);
                } catch {
                    rollback(t.failed);
                }
            });

            return;
        }

        const previousService = servicesRef.current.find((service) => service.id === target.id);

        if (!previousService) {
            setStatusTarget(null);
            return;
        }

        // Same guard as the server: a service can't be activated under an inactive clinic.
        if (nextActive) {
            const associatedClinic = clinicsRef.current.find(
                (clinic) => clinic.id === previousService.clinicId,
            );

            if (!associatedClinic || !associatedClinic.isActive) {
                setError(t.serviceClinicInactive);
                return;
            }
        }

        patchServiceLocal({ ...previousService, isActive: nextActive });
        setStatusTarget(null);
        setError("");
        setSuccess(t.statusUpdated);

        enqueue(target.id, async () => {
            const rollback = (message: string) => {
                if (isLastPending(target.id)) {
                    setServices((current) =>
                        current.map((service) =>
                            service.id === target.id
                                ? { ...service, isActive: previousService.isActive }
                                : service,
                        ),
                    );
                }

                setSuccess("");
                notifyError(message);
            };

            try {
                const result = await toggleServiceStatusAction(target.id, nextActive);

                if (!result.success || !result.data) {
                    rollback(result.error || t.failed);
                    return;
                }

                if (isLastPending(target.id)) patchServiceLocal(result.data as ServiceRow);
            } catch {
                rollback(t.failed);
            }
        });
    };

    /* --------------------------------- deletion ---------------------------------- */

    const closeDeleteModal = () => {
        setDeleteTarget(null);
    };

    /**
     * The row disappears at 0ms; it is restored (with a toast) only if the server refuses.
     * Deleting a clinic also removes its services from the table, because the server deletes
     * the clinic together with everything linked to it (the dialog warns about this beforehand).
     */
    const handleConfirmDelete = () => {
        if (!deleteTarget) return;

        const target = deleteTarget;

        closeDeleteModal();
        setError("");

        if (isTempId(target.id)) return;

        if (target.type === "clinic") {
            const index = clinicsRef.current.findIndex((clinic) => clinic.id === target.id);
            const removed = clinicsRef.current[index];

            if (!removed) return;

            const removedServices = servicesRef.current.filter(
                (service) => service.clinicId === target.id,
            );

            setClinics((current) => current.filter((clinic) => clinic.id !== target.id));

            if (removedServices.length > 0) {
                setServices((current) =>
                    current.filter((service) => service.clinicId !== target.id),
                );
            }

            setSuccess(t.deletedClinic);

            enqueue(target.id, async () => {
                const rollback = (message: string) => {
                    setClinics((current) =>
                        current.some((clinic) => clinic.id === removed.id)
                            ? current
                            : insertAt(current, removed, index),
                    );

                    if (removedServices.length > 0) {
                        setServices((current) => {
                            const present = new Set(current.map((service) => service.id));

                            return [
                                ...current,
                                ...removedServices.filter((service) => !present.has(service.id)),
                            ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                        });
                    }

                    setSuccess("");
                    notifyError(message);
                };

                try {
                    const result = await deleteClinicAction(target.id);

                    if (!result.success) rollback(result.error || t.failed);
                } catch {
                    rollback(t.failed);
                }
            });

            return;
        }

        const index = servicesRef.current.findIndex((service) => service.id === target.id);
        const removed = servicesRef.current[index];

        if (!removed) return;

        setServices((current) => current.filter((service) => service.id !== target.id));
        setSuccess(t.deletedService);

        enqueue(target.id, async () => {
            const rollback = (message: string) => {
                setServices((current) =>
                    current.some((service) => service.id === removed.id)
                        ? current
                        : insertAt(current, removed, index),
                );
                setSuccess("");
                notifyError(message);
            };

            try {
                const result = await deleteServiceAction(target.id);

                if (!result.success) rollback(result.error || t.failed);
            } catch {
                rollback(t.failed);
            }
        });
    };

    const currentCount =
        tab === "clinics"
            ? filteredClinics.length
            : filteredServices.length;

    const totalCount =
        tab === "clinics" ? clinics.length : services.length;

    const closeStatusModal = () => {
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

                    <AdminHeader
                        locale={locale}
                        onMenuOpen={() => setSidebarOpen(true)}
                    />

                    <main className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.dashboard}</span>
                                    <span>/</span>
                                    <span className="font-medium text-teal-700 dark:text-teal-400">
                                        {t.title}
                                    </span>
                                </div>

                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                                    {t.title}
                                </h1>

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                                    {t.subtitle}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 sm:self-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                <ShieldCheck size={16} className="text-teal-600 dark:text-teal-400" />
                                {t.zatca}
                            </div>
                        </section>

                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <article className={`${cardSurface} flex items-center gap-4 p-5`}>
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <Hospital size={23} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.clinicTab}
                                    </p>
                                    <div className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">
                                        {loading ? (
                                            <Skeleton className="mt-2 h-8 w-12" />
                                        ) : (
                                            clinics.length
                                        )}
                                    </div>
                                </div>
                            </article>

                            <article className={`${cardSurface} flex items-center gap-4 p-5`}>
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <ClipboardList size={23} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.catalog}
                                    </p>
                                    <div className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">
                                        {loading ? (
                                            <Skeleton className="mt-2 h-8 w-12" />
                                        ) : (
                                            services.length
                                        )}
                                    </div>
                                </div>
                            </article>

                            <article className={`${cardSurface} flex items-center gap-4 p-5`}>
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
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

                        <section className={`${cardSurface} min-w-0 overflow-hidden`}>
                            <div className="flex flex-col gap-4 border-b border-slate-200 px-4 pt-4 sm:px-6 dark:border-slate-800">
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
                                                ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
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
                                                ? "border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400"
                                                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white",
                                        )}
                                    >
                                        <Coins size={18} />
                                        {t.serviceTab}
                                    </button>
                                </div>

                                <div className="flex flex-col gap-3 pb-5 lg:flex-row lg:items-center lg:justify-between">
                                    <label className="relative block w-full lg:max-w-md">
                                        <Search
                                            aria-hidden="true"
                                            className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300"
                                        />
                                        <input
                                            type="search"
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder={tab === "clinics" ? t.searchClinic : t.searchService}
                                            aria-label={tab === "clinics" ? t.searchClinic : t.searchService}
                                            className={cn(inputClass, "h-[54px] bg-white dark:bg-slate-900/60 ps-12")}
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => openModal(tab === "clinics" ? "clinic" : "service")}
                                        disabled={tab === "services" && activeClinics.length === 0}
                                        className={`${tealButton} h-[54px] px-6`}
                                    >
                                        <Plus className="h-5 w-5" />
                                        {tab === "clinics" ? t.addClinic : t.addService}
                                    </button>
                                </div>
                            </div>

                            {success && (
                                <div
                                    role="status"
                                    className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 sm:mx-6"
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

                            {error && !modal && !statusTarget && !deleteTarget && (
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
                                    tab === "clinics" ? (
                                        <TableSkeleton
                                            variant="clinics"
                                            loadingLabel={t.loading}
                                            headers={[
                                                t.clinicName,
                                                t.specialty,
                                                t.nphies,
                                                t.status,
                                                t.actions,
                                            ]}
                                        />
                                    ) : (
                                        <TableSkeleton
                                            variant="services"
                                            loadingLabel={t.loading}
                                            headers={[
                                                t.serviceCode,
                                                t.clinicName,
                                                t.serviceEn,
                                                t.basePrice,
                                                t.vat,
                                                t.totalPrice,
                                                t.status,
                                                t.actions,
                                            ]}
                                        />
                                    )
                                ) : tab === "clinics" ? (
                                    <table className="w-full min-w-[900px] border-collapse text-start text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100">
                                                <th scope="col" className="px-6 py-5 text-start align-middle">
                                                    {t.clinicName}
                                                </th>

                                                <th scope="col" className="px-4 py-5 text-start align-middle">
                                                    {t.specialty}
                                                </th>

                                                <th scope="col" className="px-4 py-5 text-start align-middle">
                                                    {t.nphies}
                                                </th>

                                                <th scope="col" className="px-6 py-5 text-start align-middle">
                                                    {t.status}
                                                </th>

                                                <th scope="col" className="px-6 py-5 text-start align-middle">
                                                    {t.actions}
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {filteredClinics.map((clinic) => {
                                                const rowTemp = isTempId(clinic.id);
                                                const rowSyncing = syncing.has(clinic.id);

                                                return (
                                                    <tr
                                                        key={clinic.id}
                                                        aria-busy={rowSyncing || undefined}
                                                        title={rowSyncing ? t.syncing : undefined}
                                                        className={cn(
                                                            "transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50",
                                                            rowTemp && "animate-pulse",
                                                            rowSyncing && !rowTemp && "opacity-80",
                                                        )}
                                                    >
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400">
                                                                    <Hospital size={20} />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-bold text-slate-900 dark:text-white">
                                                                        {clinicName(clinic)}
                                                                    </p>
                                                                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                                                        {isRtl ? clinic.nameEn : clinic.nameAr}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5 text-slate-600 dark:text-slate-300">
                                                            {getSpecialtyLabel(clinic.specialty, locale)}
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5">
                                                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                                {clinic.nphiesCode || "—"}
                                                            </span>
                                                        </td>

                                                        <td className="whitespace-nowrap px-6 py-5">
                                                            <StatusBadge
                                                                active={clinic.isActive}
                                                                activeLabel={t.active}
                                                                inactiveLabel={t.inactive}
                                                            />
                                                        </td>

                                                        <td className="whitespace-nowrap px-6 py-5">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => openEditClinic(clinic)}
                                                                    title={t.edit}
                                                                    aria-label={`${t.editClinic}: ${clinicName(clinic)}`}
                                                                    className={iconButtonClass}
                                                                >
                                                                    <Pencil size={16} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => requestStatusChange("clinic", clinic)}
                                                                    title={clinic.isActive ? t.disable : t.enable}
                                                                    aria-label={`${clinic.isActive ? t.disable : t.enable}: ${clinicName(clinic)}`}
                                                                    className={cn(
                                                                        "grid h-10 w-10 place-items-center rounded-lg border transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                                                                        clinic.isActive
                                                                            ? "border-rose-500/40 text-rose-500 hover:bg-rose-500/10 focus:ring-rose-500 dark:text-rose-400"
                                                                            : "border-teal-500/40 text-teal-600 hover:bg-teal-500/10 focus:ring-teal-500 dark:text-teal-400",
                                                                    )}
                                                                >
                                                                    {clinic.isActive
                                                                        ? <PowerOff size={16} />
                                                                        : <Power size={16} />}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => requestDelete("clinic", clinic)}
                                                                    title={t.delete}
                                                                    aria-label={`${t.deleteClinic}: ${clinicName(clinic)}`}
                                                                    className={deleteButtonClass}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {filteredClinics.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                                                        {t.noClinics}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="w-full min-w-[1100px] border-collapse text-start text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100">
                                                <th scope="col" className="px-6 py-5 text-start align-middle">{t.serviceCode}</th>
                                                <th scope="col" className="px-4 py-5 text-start align-middle">{t.clinicName}</th>
                                                <th scope="col" className="px-4 py-5 text-start align-middle">{t.serviceEn}</th>
                                                <th scope="col" className="px-4 py-5 text-start align-middle">{t.basePrice}</th>
                                                <th scope="col" className="px-4 py-5 text-start align-middle">{t.vat}</th>
                                                <th scope="col" className="px-6 py-5 text-start align-middle">{t.totalPrice}</th>
                                                <th scope="col" className="px-4 py-5 text-start align-middle">{t.status}</th>
                                                <th scope="col" className="px-6 py-5 text-start align-middle">{t.actions}</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {filteredServices.map((service) => {
                                                const rowTemp = isTempId(service.id);
                                                const rowSyncing = syncing.has(service.id);

                                                return (
                                                    <tr
                                                        key={service.id}
                                                        aria-busy={rowSyncing || undefined}
                                                        title={rowSyncing ? t.syncing : undefined}
                                                        className={cn(
                                                            "transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/50",
                                                            rowTemp && "animate-pulse",
                                                            rowSyncing && !rowTemp && "opacity-80",
                                                        )}
                                                    >
                                                        <td className="whitespace-nowrap px-6 py-5">
                                                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                                {service.code}
                                                            </span>
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5 text-slate-600 dark:text-slate-300">
                                                            {clinicName(service.clinic)}
                                                        </td>

                                                        <td className="px-4 py-5">
                                                            <p className="font-bold text-slate-900 dark:text-white">
                                                                {isRtl ? service.nameAr : service.nameEn}
                                                            </p>
                                                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                                                {isRtl ? service.nameEn : service.nameAr}
                                                            </p>
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5 text-slate-700 dark:text-slate-300">
                                                            {money(service.basePrice, locale)} {t.sar}
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5">
                                                            <span
                                                                className={cn(
                                                                    "rounded-lg px-3 py-1.5 text-sm font-semibold",
                                                                    Number(service.vatRate) === 0
                                                                        ? "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400"
                                                                        : "bg-teal-500/10 text-teal-600 dark:text-teal-400",
                                                                )}
                                                            >
                                                                {money(service.vatRate, locale)}%
                                                            </span>
                                                        </td>

                                                        <td className="whitespace-nowrap px-6 py-5">
                                                            <p className="font-bold text-teal-700 dark:text-teal-400">
                                                                {money(service.totalPrice, locale)} {t.sar}
                                                            </p>
                                                            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                                                                {t.taxAmount}: {money(service.vatAmount, locale)}
                                                            </p>
                                                        </td>

                                                        <td className="whitespace-nowrap px-4 py-5">
                                                            <StatusBadge
                                                                active={service.isActive}
                                                                activeLabel={t.active}
                                                                inactiveLabel={t.inactive}
                                                            />
                                                        </td>

                                                        <td className="whitespace-nowrap px-6 py-5">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => openEditService(service)}
                                                                    title={t.edit}
                                                                    aria-label={`${t.editService}: ${service.nameEn}`}
                                                                    className={iconButtonClass}
                                                                >
                                                                    <Pencil size={16} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => requestStatusChange("service", service)}
                                                                    title={service.isActive ? t.disable : t.enable}
                                                                    aria-label={`${service.isActive ? t.disable : t.enable}: ${service.nameEn}`}
                                                                    className={cn(
                                                                        "grid h-10 w-10 place-items-center rounded-lg border transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
                                                                        service.isActive
                                                                            ? "border-rose-500/40 text-rose-500 hover:bg-rose-500/10 focus:ring-rose-500 dark:text-rose-400"
                                                                            : "border-teal-500/40 text-teal-600 hover:bg-teal-500/10 focus:ring-teal-500 dark:text-teal-400",
                                                                    )}
                                                                >
                                                                    {service.isActive
                                                                        ? <PowerOff size={16} />
                                                                        : <Power size={16} />}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={rowTemp}
                                                                    onClick={() => requestDelete("service", service)}
                                                                    title={t.delete}
                                                                    aria-label={`${t.deleteService}: ${service.nameEn}`}
                                                                    className={deleteButtonClass}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {filteredServices.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                                                        {t.noServices}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                                {loading ? (
                                    <Skeleton className="h-4 w-48" />
                                ) : (
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                        {t.showing} {currentCount} {t.of} {totalCount}{" "}
                                        {tab === "clinics" ? t.clinics : t.services}
                                    </span>
                                )}

                                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
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
            <AnimatePresence>
                {modal && (
                    <motion.div
                        key="management-modal-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={`${modalBackdropClass} z-50`}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) closeModal();
                        }}
                    >
                        <motion.section
                            key="management-modal-content"
                            initial={{
                                opacity: 0,
                                scale: 0.96,
                                y: 16,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                y: 0,
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.97,
                                y: 10,
                            }}
                            transition={{
                                duration: 0.22,
                                ease: [0.22, 1, 0.36, 1],
                            }}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="management-modal-title"
                            className={`${modalPanelClass} my-auto max-h-[95vh] w-full max-w-xl overflow-y-auto`}
                        >
                            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6 dark:border-slate-700">
                                <div className="flex items-start gap-3">
                                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                        {modal === "clinic" ? (
                                            <Hospital size={22} />
                                        ) : (
                                            <Coins size={22} />
                                        )}
                                    </div>

                                    <div>
                                        <h2
                                            id="management-modal-title"
                                            className="text-lg font-extrabold text-slate-900 dark:text-white"
                                        >
                                            {modal === "clinic"
                                                ? editingClinic
                                                    ? t.editClinic
                                                    : t.newClinic
                                                : editingService
                                                    ? t.editService
                                                    : t.newService}
                                        </h2>

                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {modal === "clinic"
                                                ? t.clinicDescription
                                                : t.serviceDescription}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={closeModal}
                                    aria-label={t.close}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
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
                                <form
                                    onSubmit={handleClinicSubmit}
                                    className="space-y-5 p-5 sm:p-6"
                                >
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
                                        <SelectField
                                            value={clinicForm.specialty}
                                            options={specialtyOptions}
                                            placeholder={t.chooseSpecialty}
                                            ariaLabel={t.specialty}
                                            isRtl={isRtl}
                                            onChange={(code) => {
                                                const selected = specialties.find(
                                                    (item) => item.code === code,
                                                );

                                                if (!selected) return;

                                                // The NPHIES code follows the specialty automatically.
                                                setClinicForm((current) => ({
                                                    ...current,
                                                    specialty: selected.code,
                                                    nphiesCode: selected.nphies,
                                                }));
                                            }}
                                        />
                                    </Field>

                                    <Field label={t.nphies} hint={t.nphiesNote}>
                                        <input
                                            disabled
                                            readOnly
                                            tabIndex={-1}
                                            aria-readonly="true"
                                            aria-label={t.nphies}
                                            value={clinicForm.nphiesCode}
                                            placeholder="DENT-01"
                                            className={cn(
                                                inputClass,
                                                "cursor-not-allowed select-none border-slate-200 bg-slate-100 font-mono text-left text-slate-500 opacity-100 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                                            )}
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
                                                        : "bg-slate-300 dark:bg-slate-700"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
                                                        clinicForm.isActive
                                                            ? isRtl
                                                                ? "right-1"
                                                                : "left-[1.625rem]"
                                                            : isRtl
                                                                ? "right-[1.625rem]"
                                                                : "left-1"
                                                    )}
                                                />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end dark:border-slate-700">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className={`${outlineButton} h-11 px-6`}
                                        >
                                            {t.cancel}
                                        </button>

                                        <button
                                            type="submit"
                                            className={`${tealButton} h-11 px-6`}
                                        >
                                            {editingClinic
                                                ? t.saveChanges
                                                : t.saveClinic}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form
                                    onSubmit={handleServiceSubmit}
                                    className="space-y-5 p-5 sm:p-6"
                                >
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
                                            readOnly
                                            aria-readonly="true"
                                            placeholder="e.g. PED-101"
                                            className={cn(
                                                inputClass,
                                                "font-mono text-left cursor-not-allowed"
                                            )}
                                            dir="ltr"
                                        />
                                    </Field>

                                    <Field label={t.associatedClinic}>
                                        <SelectField
                                            value={serviceForm.clinicId}
                                            options={clinicOptions}
                                            placeholder={t.chooseClinic}
                                            ariaLabel={t.associatedClinic}
                                            isRtl={isRtl}
                                            onChange={(clinicId) => {
                                                const selectedClinic = clinics.find(
                                                    (clinic) => clinic.id === clinicId
                                                );

                                                setServiceForm((current) => ({
                                                    ...current,
                                                    clinicId,
                                                    code: generateServiceCode(clinicId),
                                                }));

                                                if (
                                                    selectedClinic &&
                                                    !selectedClinic.isActive
                                                ) {
                                                    setError(
                                                        t.serviceClinicDisabledSelect
                                                    );
                                                } else {
                                                    setError("");
                                                }
                                            }}
                                        />
                                    </Field>

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
                                                className={cn(
                                                    inputClass,
                                                    "font-mono text-left"
                                                )}
                                                dir="ltr"
                                            />
                                        </Field>

                                        <Field label={t.vat}>
                                            <SelectField
                                                value={String(serviceForm.vatRate)}
                                                options={vatOptions}
                                                ariaLabel={t.vat}
                                                isRtl={isRtl}
                                                onChange={(rate) =>
                                                    setServiceForm((current) => ({
                                                        ...current,
                                                        vatRate: Number(rate) as 0 | 15,
                                                    }))
                                                }
                                            />
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

                                                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
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
                                                    {validBaseAmount
                                                        ? money(baseAmount, locale)
                                                        : "—"}{" "}
                                                    {t.sar}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="text-slate-600 dark:text-slate-300">
                                                    {t.taxAmount} ({serviceForm.vatRate}%)
                                                </span>

                                                <span className="font-semibold tabular-nums text-slate-800 dark:text-white">
                                                    {validBaseAmount
                                                        ? money(vatAmount, locale)
                                                        : "—"}{" "}
                                                    {t.sar}
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
                                                            "border-teal-200 bg-white font-bold text-teal-700 dark:border-teal-900 dark:bg-slate-900 dark:text-teal-400"
                                                        )}
                                                    />
                                                </Field>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end dark:border-slate-700">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className={`${outlineButton} h-11 px-6`}
                                        >
                                            {t.cancel}
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={
                                                !validBaseAmount ||
                                                (!editingService &&
                                                    activeClinics.length === 0)
                                            }
                                            className={`${tealButton} h-11 px-6`}
                                        >
                                            {editingService
                                                ? t.saveChanges
                                                : t.saveService}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {statusTarget && (
                    <motion.div
                        key="status-dialog-backdrop"
                        {...backdropMotion}
                        className={`${modalBackdropClass} z-[60]`}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                closeStatusModal();
                            }
                        }}
                    >
                        <motion.section
                            key="status-dialog-content"
                            {...panelMotion}
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="status-dialog-title"
                            aria-describedby="status-dialog-description"
                            className={`${modalPanelClass} my-auto w-full max-w-md p-5 sm:p-6`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={cn(
                                        "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                                        statusTarget.isActive
                                            ? "bg-rose-500/10 text-rose-500 dark:text-rose-400"
                                            : "bg-teal-500/10 text-teal-600 dark:text-teal-400",
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
                                        {statusTarget.name}?
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    aria-label={t.close}
                                    onClick={closeStatusModal}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
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
                                    onClick={closeStatusModal}
                                    className={`${outlineButton} h-11 px-6`}
                                >
                                    {t.cancel}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleToggleStatus}
                                    className={cn(
                                        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold text-white transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950",
                                        statusTarget.isActive
                                            ? "bg-rose-600 hover:bg-rose-500 focus:ring-rose-500"
                                            : "bg-teal-600 hover:bg-teal-500 focus:ring-teal-500",
                                    )}
                                >
                                    {statusTarget.isActive ? (
                                        <PowerOff size={16} />
                                    ) : (
                                        <Power size={16} />
                                    )}

                                    {statusTarget.isActive ? t.disable : t.enable}
                                </button>
                            </div>
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        key="delete-dialog-backdrop"
                        {...backdropMotion}
                        className={`${modalBackdropClass} z-[60]`}
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) closeDeleteModal();
                        }}
                    >
                        <motion.section
                            key="delete-dialog-content"
                            {...panelMotion}
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="delete-dialog-title"
                            aria-describedby="delete-dialog-description"
                            className={cn(
                                modalPanelClass,
                                "my-auto max-h-[92vh] w-full overflow-y-auto p-5 sm:p-6",
                                deleteTarget.type === "clinic" ? "max-w-lg" : "max-w-md",
                            )}
                        >
                            <div className="flex items-start gap-3">
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400">
                                    <Trash2 size={21} />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <h2
                                        id="delete-dialog-title"
                                        className="text-lg font-extrabold text-slate-900 dark:text-white"
                                    >
                                        {t.confirmDeleteTitle}
                                    </h2>

                                    <p
                                        id="delete-dialog-description"
                                        className="mt-2 break-words text-sm leading-7 text-slate-600 dark:text-slate-300"
                                    >
                                        {deleteTarget.type === "clinic"
                                            ? t.confirmDeleteClinic
                                            : t.confirmDeleteService}{" "}
                                        <span className="font-bold text-slate-900 dark:text-white">
                                            {deleteTarget.name}
                                        </span>
                                        ؟
                                    </p>

                                    <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                                        {t.deleteWarning}
                                    </p>

                                    {deleteTarget.type === "service" && (
                                        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                            {t.deleteServiceHint}
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    aria-label={t.close}
                                    onClick={closeDeleteModal}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {deleteTarget.type === "clinic" && (
                                <div className="mt-5 space-y-3">
                                    <div
                                        role="alert"
                                        className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium leading-6 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
                                    >
                                        <TriangleAlert size={17} className="mt-0.5 shrink-0" />
                                        <span>{t.clinicCascadeWarning}</span>
                                    </div>

                                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                                        {t.deleteClinicHint}
                                    </p>
                                </div>
                            )}

                            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={closeDeleteModal}
                                    className={`${outlineButton} h-11 px-6`}
                                >
                                    {t.cancel}
                                </button>

                                <button
                                    type="button"
                                    autoFocus
                                    onClick={handleConfirmDelete}
                                    className={`${dangerButton} h-11`}
                                >
                                    <Trash2 size={16} />
                                    {deleteTarget.type === "clinic"
                                        ? t.deleteEverything
                                        : t.delete}
                                </button>
                            </div>
                        </motion.section>
                    </motion.div>
                )}
            </AnimatePresence>

            {toast && (
                <div
                    role="status"
                    aria-live="polite"
                    className={cn(
                        "fixed bottom-6 z-[200] flex max-w-md items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/50 dark:bg-slate-900",
                        isRtl ? "left-6" : "right-6",
                        toast.kind === "success" ? "border-teal-600/40" : "border-rose-500/40",
                    )}
                >
                    {toast.kind === "success" ? (
                        <Check size={20} className="mt-0.5 shrink-0 text-teal-500" />
                    ) : (
                        <CircleAlert size={20} className="mt-0.5 shrink-0 text-rose-500" />
                    )}

                    <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">
                        {toast.message}
                    </p>

                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        aria-label={t.close}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <style jsx global>{`
                @keyframes mj-shimmer {
                    100% {
                        transform: translateX(100%);
                    }
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