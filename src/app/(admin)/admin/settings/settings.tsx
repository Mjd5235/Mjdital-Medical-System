"use client";

/**
 * Performance notes
 * -----------------
 * - "Save All Changes" updates the UI in the same frame (baseline replaced, success toast shown)
 *   and syncs with the server in the background. A failure restores the last server-confirmed
 *   baseline, keeps the user's edits, and shows an error toast.
 * - Saves run through a single queue, so rapid clicks never race and `version` stays in order.
 * - Logo / favicon pick: the local preview shows instantly; the upload runs in the background and
 *   a save waits for any pending upload before it sends the final URL.
 * - No router.refresh(), no blocking spinners. Ctrl/Cmd+S saves. Leaving with unsaved or
 *   in-flight changes asks for confirmation.
 */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type ReactNode,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CenterFacilityType } from "@prisma/client";
import {
    Building2,
    Check,
    ChevronDown,
    CircleAlert,
    FileText,
    ImagePlus,
    Info,
    Phone,
    RefreshCw,
    Save,
    ShieldCheck,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";
import {
    getCenterSettingsAction,
    saveCenterSettingsAction,
    uploadCenterAssetAction,
    type CenterSettingsFieldKey,
    type CenterSettingsFields,
} from "./actions";

const TOAST_MS = 6000;
const MAX_TOASTS = 3;
const MAX_LOGO_BYTES = 900 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FAVICON_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
];

type CenterSettingsProps = {
    initialLocale: Locale;
};

type FormValues = CenterSettingsFields;
type FieldKey = CenterSettingsFieldKey;
type Errors = Partial<Record<FieldKey, string>>;
type ToastItem = { id: number; kind: "success" | "error"; message: string };
type AssetKind = "logo" | "favicon";

/* ------------------------------ messages ------------------------------ */

const en = {
    breadcrumbRoot: "Settings",
    title: "Center Settings",
    subtitle: "Manage your brand identity, legal information, and official medical facility identifiers.",
    save: "Save All Changes",
    syncing: "Syncing…",
    saved: "Center settings saved.",
    saveFailed: "Changes could not be saved. Your edits were kept so you can retry.",
    validationFailed: "Please correct the highlighted fields.",
    loadFailed: "Center settings could not be loaded.",
    retry: "Try again",
    staleTitle: "These settings were changed by someone else.",
    staleAction: "Reload latest",
    uploadFailed: "The image could not be uploaded.",
    brandingTitle: "Branding & Identity",
    brandingSubtitle: "Update your center logo, trade name, and visual identity.",
    logo: "Center Logo",
    logoHint: "Optimized for dark backgrounds and printed invoices.",
    changeLogo: "Change Logo",
    uploadLogo: "Upload Logo",
    favicon: "Favicon",
    faviconHint: "Square image, 32×32 or 64×64.",
    change: "Change",
    upload: "Upload",
    remove: "Remove",
    tradeNameAr: "Center Trade Name (Arabic)",
    tradeNameArPlaceholder: "Arabic center name",
    tradeNameEn: "Center Trade Name (English)",
    tradeNameEnPlaceholder: "English center name",
    legalTitle: "Legal Information & National Address",
    legalSubtitle: "Official registration details for e-invoicing and government systems.",
    zatcaBadge: "ZATCA Required",
    taxNumber: "Tax Registration Number",
    taxHint: "15 digits • Used for ZATCA e-invoicing and cryptographic certificates.",
    taxNotice: "Ensure your tax registration number is accurate and matches your ZATCA records.",
    street: "Street Name",
    district: "District",
    city: "City",
    postalCode: "Postal Code",
    additionalNumber: "Additional Number",
    buildingNumber: "Building Number",
    digits5: "5 digits",
    digits4: "4 digits",
    medicalTitle: "Medical Identifiers",
    medicalBadge: "NPHIES & MOH",
    medicalSubtitle: "Facility identifiers for healthcare network integration.",
    mohLicense: "MOH License Number",
    mohHint: "Issued by Ministry of Health (MOH).",
    nphiesId: "NPHIES Facility ID",
    nphiesHint: "Verify the registered facility ID to ensure NPHIES claims are routed correctly.",
    facilityType: "Facility Type",
    facilityPlaceholder: "Select facility type",
    medicalNotice: "Keep your medical identifiers up to date to avoid claim rejection and service disruptions.",
    contactTitle: "Contact Information",
    contactSubtitle: "Official contact details for communications and billing.",
    phone: "Main Phone Number",
    phoneHint: "Include country code (e.g. +966).",
    email: "Official Email",
    emailHint: "Used for official correspondence and e-invoices.",
    website: "Website URL",
    websiteHint: "Your center's official website.",
    facilityTypes: {
        HOSPITAL: "Hospital",
        SPECIALIZED_MEDICAL_CENTER: "Specialized Medical Center",
        MEDICAL_COMPLEX: "Medical Complex",
        GENERAL_CLINIC: "General Clinic",
        DENTAL_CENTER: "Dental Center",
        DIAGNOSTIC_CENTER: "Diagnostic Center",
        DAY_SURGERY_CENTER: "Day Surgery Center",
        HOME_HEALTHCARE: "Home Healthcare",
    } as Record<CenterFacilityType, string>,
    errors: {
        tradeNameAr: "Enter the trade name in Arabic (2–120 characters).",
        tradeNameEn: "Enter the trade name in English (2–120 characters).",
        taxNumber: "Enter a valid 15-digit number that starts and ends with 3.",
        street: "Enter a valid street name.",
        district: "Enter a valid district.",
        city: "Enter a valid city.",
        postalCode: "Postal code must be 5 digits.",
        additionalNumber: "Additional number must be 4 digits.",
        buildingNumber: "Building number must be 4 digits.",
        mohLicense: "Enter a valid MOH license number.",
        nphiesId: "Enter a valid NPHIES facility ID.",
        facilityType: "Select a facility type.",
        phone: "Enter a valid Saudi phone number (+966).",
        email: "Enter a valid email address.",
        website: "Enter a valid website URL.",
        logoType: "The logo must be a PNG, JPEG or WebP image.",
        logoSize: "The logo must be smaller than 900 KB.",
        faviconType: "The favicon must be a PNG, JPEG, WebP or ICO image.",
        faviconSize: "The favicon must be smaller than 256 KB.",
        faviconSquare: "The favicon must be a square image of at least 32×32.",
    },
};

type Messages = typeof en;

const ar: Messages = {
    breadcrumbRoot: "الإعدادات",
    title: "إعدادات المركز",
    subtitle: "إدارة هوية علامتك التجارية والمعلومات القانونية والمعرّفات الرسمية للمنشأة الطبية.",
    save: "حفظ جميع التغييرات",
    syncing: "جارٍ المزامنة…",
    saved: "تم حفظ إعدادات المركز.",
    saveFailed: "تعذّر حفظ التغييرات. تم الاحتفاظ بتعديلاتك لإعادة المحاولة.",
    validationFailed: "يرجى تصحيح الحقول المحددة.",
    loadFailed: "تعذّر تحميل إعدادات المركز.",
    retry: "إعادة المحاولة",
    staleTitle: "تم تعديل هذه الإعدادات بواسطة مستخدم آخر.",
    staleAction: "تحميل أحدث نسخة",
    uploadFailed: "تعذّر رفع الصورة.",
    brandingTitle: "الهوية والعلامة التجارية",
    brandingSubtitle: "حدّث شعار المركز واسمه التجاري وهويته البصرية.",
    logo: "شعار المركز",
    logoHint: "مناسب للخلفيات الداكنة والفواتير المطبوعة.",
    changeLogo: "تغيير الشعار",
    uploadLogo: "رفع الشعار",
    favicon: "أيقونة الموقع",
    faviconHint: "صورة مربعة بحجم 32×32 أو 64×64.",
    change: "تغيير",
    upload: "رفع",
    remove: "إزالة",
    tradeNameAr: "الاسم التجاري للمركز (عربي)",
    tradeNameArPlaceholder: "اسم المركز بالعربية",
    tradeNameEn: "الاسم التجاري للمركز (إنجليزي)",
    tradeNameEnPlaceholder: "اسم المركز بالإنجليزية",
    legalTitle: "المعلومات القانونية والعنوان الوطني",
    legalSubtitle: "بيانات التسجيل الرسمية للفوترة الإلكترونية والأنظمة الحكومية.",
    zatcaBadge: "مطلوب لهيئة الزكاة",
    taxNumber: "الرقم الضريبي",
    taxHint: "15 رقماً • يُستخدم للفوترة الإلكترونية وشهادات التشفير لدى هيئة الزكاة.",
    taxNotice: "تأكد من أن الرقم الضريبي صحيح ويطابق سجلات هيئة الزكاة والضريبة والجمارك.",
    street: "اسم الشارع",
    district: "الحي",
    city: "المدينة",
    postalCode: "الرمز البريدي",
    additionalNumber: "الرقم الإضافي",
    buildingNumber: "رقم المبنى",
    digits5: "5 أرقام",
    digits4: "4 أرقام",
    medicalTitle: "المعرّفات الطبية",
    medicalBadge: "نفيس ووزارة الصحة",
    medicalSubtitle: "معرّفات المنشأة للربط مع شبكة الرعاية الصحية.",
    mohLicense: "رقم ترخيص وزارة الصحة",
    mohHint: "صادر عن وزارة الصحة.",
    nphiesId: "معرّف المنشأة في نفيس",
    nphiesHint: "تحقق من معرّف المنشأة المسجّل لضمان توجيه مطالبات نفيس بشكل صحيح.",
    facilityType: "نوع المنشأة",
    facilityPlaceholder: "اختر نوع المنشأة",
    medicalNotice: "حافظ على تحديث المعرّفات الطبية لتجنب رفض المطالبات وانقطاع الخدمة.",
    contactTitle: "معلومات التواصل",
    contactSubtitle: "بيانات التواصل الرسمية للمراسلات والفوترة.",
    phone: "رقم الهاتف الرئيسي",
    phoneHint: "أدخل رمز الدولة (مثال: ‎+966).",
    email: "البريد الإلكتروني الرسمي",
    emailHint: "يُستخدم للمراسلات الرسمية والفواتير الإلكترونية.",
    website: "رابط الموقع الإلكتروني",
    websiteHint: "الموقع الإلكتروني الرسمي للمركز.",
    facilityTypes: {
        HOSPITAL: "مستشفى",
        SPECIALIZED_MEDICAL_CENTER: "مركز طبي متخصص",
        MEDICAL_COMPLEX: "مجمع طبي",
        GENERAL_CLINIC: "عيادة عامة",
        DENTAL_CENTER: "مركز أسنان",
        DIAGNOSTIC_CENTER: "مركز تشخيصي",
        DAY_SURGERY_CENTER: "مركز جراحة اليوم الواحد",
        HOME_HEALTHCARE: "رعاية صحية منزلية",
    } as Record<CenterFacilityType, string>,
    errors: {
        tradeNameAr: "أدخل الاسم التجاري بالعربية (من 2 إلى 120 حرفاً).",
        tradeNameEn: "أدخل الاسم التجاري بالإنجليزية (من 2 إلى 120 حرفاً).",
        taxNumber: "أدخل رقماً صحيحاً من 15 خانة يبدأ وينتهي بالرقم 3.",
        street: "أدخل اسم شارع صحيحاً.",
        district: "أدخل حياً صحيحاً.",
        city: "أدخل مدينة صحيحة.",
        postalCode: "يجب أن يتكون الرمز البريدي من 5 أرقام.",
        additionalNumber: "يجب أن يتكون الرقم الإضافي من 4 أرقام.",
        buildingNumber: "يجب أن يتكون رقم المبنى من 4 أرقام.",
        mohLicense: "أدخل رقم ترخيص صحيحاً لوزارة الصحة.",
        nphiesId: "أدخل معرّف منشأة صحيحاً في نفيس.",
        facilityType: "اختر نوع المنشأة.",
        phone: "أدخل رقم هاتف سعودي صحيحاً (‎+966).",
        email: "أدخل بريداً إلكترونياً صحيحاً.",
        website: "أدخل رابط موقع صحيحاً.",
        logoType: "يجب أن يكون الشعار بصيغة PNG أو JPEG أو WebP.",
        logoSize: "يجب أن يكون حجم الشعار أقل من 900 كيلوبايت.",
        faviconType: "يجب أن تكون الأيقونة بصيغة PNG أو JPEG أو WebP أو ICO.",
        faviconSize: "يجب أن يكون حجم الأيقونة أقل من 256 كيلوبايت.",
        faviconSquare: "يجب أن تكون الأيقونة صورة مربعة لا تقل عن 32×32.",
    },
};

const messages: Record<Locale, Messages> = { en, ar };

/* ------------------------------ validation ------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAX_PATTERN = /^3\d{13}3$/;
const ID_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,49}$/;
const EN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/-]{1,119}$/;
const AR_NAME_PATTERN =
    /^[\u0600-\u06FF\u0750-\u077FA-Za-z0-9][\u0600-\u06FF\u0750-\u077FA-Za-z0-9 \u200F.,&'()/-]{1,119}$/;
const ARABIC_LETTER_PATTERN = /[\u0600-\u06FF]/;
const ADDRESS_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'/()-]{0,126}$/u;
const PHONE_PATTERN = /^\+966(?:5\d{8}|1[1-7]\d{7}|92\d{7})$/;

const FACILITY_TYPES = Object.values(CenterFacilityType) as CenterFacilityType[];

const EMPTY_VALUES: FormValues = {
    logoUrl: "",
    faviconUrl: "",
    tradeNameAr: "",
    tradeNameEn: "",
    taxRegistrationNumber: "",
    streetName: "",
    district: "",
    city: "",
    postalCode: "",
    additionalNumber: "",
    buildingNumber: "",
    mohLicenseNumber: "",
    nphiesFacilityId: "",
    facilityType: "",
    phone: "",
    email: "",
    websiteUrl: "",
};

const FIELD_ORDER: FieldKey[] = [
    "tradeNameAr",
    "tradeNameEn",
    "taxRegistrationNumber",
    "streetName",
    "district",
    "city",
    "postalCode",
    "additionalNumber",
    "buildingNumber",
    "mohLicenseNumber",
    "nphiesFacilityId",
    "facilityType",
    "phone",
    "email",
    "websiteUrl",
];

function clean(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function normalizeDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function digits(value: string): string {
    return normalizeDigits(value).replace(/\D/g, "");
}

function normalizePhone(raw: string): string | null {
    let value = normalizeDigits(raw).replace(/[\s().-]/g, "");

    if (value.startsWith("00966")) {
        value = `+${value.slice(2)}`;
    } else if (value.startsWith("966")) {
        value = `+${value}`;
    } else if (/^0[15]\d{8}$/.test(value)) {
        value = `+966${value.slice(1)}`;
    } else if (/^[15]\d{8}$/.test(value)) {
        value = `+966${value}`;
    }

    return PHONE_PATTERN.test(value) ? value : null;
}

function formatPhone(normalized: string): string {
    const match = /^\+966(\d{2})(\d{3})(\d{4})$/.exec(normalized);

    return match ? `+966 ${match[1]} ${match[2]} ${match[3]}` : normalized;
}

function normalizeWebsite(raw: string): string | null {
    const value = raw.trim();

    if (!value) return "";
    if (/\s/.test(value)) return null;

    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
        const url = new URL(candidate);

        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        if (!url.hostname.includes(".")) return null;

        const normalized =
            url.pathname === "/" && !url.search && !url.hash ? url.origin : url.toString();

        return normalized.length <= 255 ? normalized : null;
    } catch {
        return null;
    }
}

function normalizeForm(values: FormValues): FormValues {
    const phone = normalizePhone(values.phone);
    const website = normalizeWebsite(values.websiteUrl);

    return {
        ...values,
        tradeNameAr: clean(values.tradeNameAr),
        tradeNameEn: clean(values.tradeNameEn),
        taxRegistrationNumber: digits(values.taxRegistrationNumber),
        streetName: clean(values.streetName),
        district: clean(values.district),
        city: clean(values.city),
        postalCode: digits(values.postalCode),
        additionalNumber: digits(values.additionalNumber),
        buildingNumber: digits(values.buildingNumber),
        mohLicenseNumber: clean(values.mohLicenseNumber).toUpperCase(),
        nphiesFacilityId: clean(values.nphiesFacilityId).toUpperCase(),
        phone: phone ? formatPhone(phone) : clean(values.phone),
        email: clean(values.email).toLowerCase(),
        websiteUrl: website === null ? clean(values.websiteUrl) : website,
    };
}

function validateForm(values: FormValues, t: Messages): Errors {
    const errors: Errors = {};

    if (!AR_NAME_PATTERN.test(values.tradeNameAr) || !ARABIC_LETTER_PATTERN.test(values.tradeNameAr)) {
        errors.tradeNameAr = t.errors.tradeNameAr;
    }
    if (!EN_NAME_PATTERN.test(values.tradeNameEn)) errors.tradeNameEn = t.errors.tradeNameEn;
    if (!TAX_PATTERN.test(values.taxRegistrationNumber)) errors.taxRegistrationNumber = t.errors.taxNumber;
    if (!ADDRESS_PATTERN.test(values.streetName)) errors.streetName = t.errors.street;
    if (!ADDRESS_PATTERN.test(values.district)) errors.district = t.errors.district;
    if (!ADDRESS_PATTERN.test(values.city)) errors.city = t.errors.city;
    if (!/^\d{5}$/.test(values.postalCode)) errors.postalCode = t.errors.postalCode;
    if (!/^\d{4}$/.test(values.additionalNumber)) errors.additionalNumber = t.errors.additionalNumber;
    if (!/^\d{4}$/.test(values.buildingNumber)) errors.buildingNumber = t.errors.buildingNumber;
    if (!ID_PATTERN.test(values.mohLicenseNumber)) errors.mohLicenseNumber = t.errors.mohLicense;
    if (!ID_PATTERN.test(values.nphiesFacilityId)) errors.nphiesFacilityId = t.errors.nphiesId;
    if (!values.facilityType || !FACILITY_TYPES.includes(values.facilityType)) {
        errors.facilityType = t.errors.facilityType;
    }
    if (!normalizePhone(values.phone)) errors.phone = t.errors.phone;
    if (!EMAIL_PATTERN.test(values.email) || values.email.length > 254) errors.email = t.errors.email;
    if (values.websiteUrl && normalizeWebsite(values.websiteUrl) === null) {
        errors.websiteUrl = t.errors.website;
    }

    return errors;
}

function sameValues(a: FormValues, b: FormValues): boolean {
    return (Object.keys(a) as Array<keyof FormValues>).every((key) => a[key] === b[key]);
}

function toFormValues(data: FormValues): FormValues {
    const phone = normalizePhone(data.phone);

    return {
        logoUrl: data.logoUrl,
        faviconUrl: data.faviconUrl,
        tradeNameAr: data.tradeNameAr,
        tradeNameEn: data.tradeNameEn,
        taxRegistrationNumber: data.taxRegistrationNumber,
        streetName: data.streetName,
        district: data.district,
        city: data.city,
        postalCode: data.postalCode,
        additionalNumber: data.additionalNumber,
        buildingNumber: data.buildingNumber,
        mohLicenseNumber: data.mohLicenseNumber,
        nphiesFacilityId: data.nphiesFacilityId,
        facilityType: data.facilityType,
        phone: phone ? formatPhone(phone) : data.phone,
        email: data.email,
        websiteUrl: data.websiteUrl,
    };
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        image.src = url;
    });
}

/* ------------------------------ styles ------------------------------ */

const inputBase =
    "h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-all duration-200 ease-out placeholder:text-slate-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60 dark:text-slate-100";
const inputOk =
    "border-slate-200 hover:border-slate-300 focus:border-teal-500 focus:ring-teal-500/20 dark:border-slate-700 dark:hover:border-slate-600";
const inputBad =
    "border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/20";
const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ease-out hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:focus:ring-offset-slate-950";
const linkButton =
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------ UI pieces ------------------------------ */

function Field({
    id,
    label,
    hint,
    error,
    className = "",
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={className}>
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
                {label}
            </label>
            {children}
            {error ? (
                <p
                    id={`${id}-error`}
                    role="alert"
                    className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-500 dark:text-rose-400"
                >
                    <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                    {error}
                </p>
            ) : hint ? (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
            ) : null}
        </div>
    );
}

function TextInput({
    id,
    value,
    onChange,
    onBlur,
    error,
    placeholder,
    dir,
    inputMode,
    maxLength,
    type = "text",
    autoComplete = "off",
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    error?: string;
    placeholder?: string;
    dir?: "ltr" | "rtl";
    inputMode?: "numeric" | "tel" | "email" | "url" | "text";
    maxLength?: number;
    type?: string;
    autoComplete?: string;
}) {
    return (
        <input
            id={id}
            type={type}
            value={value}
            dir={dir}
            inputMode={inputMode}
            maxLength={maxLength}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            className={`${inputBase} ${error ? inputBad : inputOk}`}
        />
    );
}

function Notice({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-700 transition-colors duration-150 dark:text-teal-300">
            <Info className="h-4 w-4 shrink-0" />
            <span>{children}</span>
        </div>
    );
}

function SectionCard({
    icon: Icon,
    title,
    subtitle,
    badge,
    children,
}: {
    icon: typeof Building2;
    title: string;
    subtitle: string;
    badge?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/10 transition-colors duration-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <header className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-600 dark:text-teal-400">
                    <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
                        {badge}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
                </div>
            </header>
            <div className="flex-1 space-y-5 p-5">{children}</div>
        </section>
    );
}

function ImageUploader({
    kind,
    src,
    label,
    hint,
    changeLabel,
    uploadLabel,
    removeLabel,
    accept,
    onPick,
    onRemove,
}: {
    kind: AssetKind;
    src: string;
    label: string;
    hint: string;
    changeLabel: string;
    uploadLabel: string;
    removeLabel: string;
    accept: string;
    onPick: (file: File) => void;
    onRemove: () => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const isLogo = kind === "logo";
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        event.target.value = "";
        if (file) onPick(file);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);

        const file = event.dataTransfer.files?.[0];

        if (file) onPick(file);
    };

    return (
        <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>

            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`mt-3 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 transition-all duration-200 ease-out ${dragging
                    ? "border-teal-500 bg-teal-500/10"
                    : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-950/50"
                    } ${isLogo ? "min-h-[150px]" : "mx-auto h-[120px] w-[120px] sm:mx-0"}`}
            >
                {src && !failed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={label}
                        onError={() => setFailed(true)}
                        className={`object-contain transition-opacity duration-200 ${isLogo ? "max-h-20 max-w-full" : "h-12 w-12"}`}
                    />
                ) : (
                    <div className="flex flex-col items-center gap-1 text-slate-400">
                        <ImagePlus className={isLogo ? "h-9 w-9" : "h-7 w-7"} />
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className={`${linkButton} text-teal-600 hover:bg-teal-600/10 dark:text-teal-400`}
                    >
                        <Upload className="h-4 w-4" />
                        {src ? changeLabel : uploadLabel}
                    </button>

                    {src && (
                        <>
                            <span className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
                            <button
                                type="button"
                                onClick={onRemove}
                                className={`${linkButton} text-slate-600 hover:bg-rose-500/10 hover:text-rose-500 dark:text-slate-300 dark:hover:text-rose-400`}
                            >
                                <Trash2 className="h-4 w-4" />
                                {removeLabel}
                            </button>
                        </>
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    onChange={handleChange}
                    className="hidden"
                    aria-label={label}
                />
            </div>
        </div>
    );
}

function SelectField<T extends string>({
    id,
    value,
    options,
    placeholder,
    error,
    onChange,
    onBlur,
}: {
    id: string;
    value: T | "";
    options: Array<{ value: T; label: string }>;
    placeholder: string;
    error?: string;
    onChange: (value: T) => void;
    onBlur: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [openUp, setOpenUp] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selectedIndex = options.findIndex((option) => option.value === value);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
    const listId = `${id}-listbox`;

    const openMenu = useCallback(() => {
        const rect = rootRef.current?.getBoundingClientRect();

        if (rect) {
            const spaceBelow = window.innerHeight - rect.bottom;

            setOpenUp(spaceBelow < 290 && rect.top > spaceBelow);
        }

        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
    }, [selectedIndex]);

    const closeMenu = useCallback(() => {
        setOpen(false);
        onBlur();
    }, [onBlur]);

    const choose = (index: number) => {
        const option = options[index];

        if (!option) return;

        onChange(option.value);
        setOpen(false);
        onBlur();
    };

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };

        document.addEventListener("mousedown", onPointerDown);

        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open, closeMenu]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;

        item?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                if (!open) openMenu();
                else setActiveIndex((index) => Math.min(options.length - 1, index + 1));
                break;
            case "ArrowUp":
                event.preventDefault();
                if (!open) openMenu();
                else setActiveIndex((index) => Math.max(0, index - 1));
                break;
            case "Home":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(0);
                }
                break;
            case "End":
                if (open) {
                    event.preventDefault();
                    setActiveIndex(options.length - 1);
                }
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (open && activeIndex >= 0) choose(activeIndex);
                else openMenu();
                break;
            case "Escape":
                if (open) {
                    event.preventDefault();
                    closeMenu();
                }
                break;
            case "Tab":
                if (open) closeMenu();
                break;
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                onKeyDown={handleKeyDown}
                onClick={(event) => {
                    // detail === 0 means the click came from the keyboard, which handleKeyDown already handled.
                    if (event.detail === 0) return;

                    if (open) closeMenu();
                    else openMenu();
                }}
                className={`${inputBase} ${error
                    ? inputBad
                    : open
                        ? "border-teal-500 ring-2 ring-teal-500/20"
                        : inputOk
                    } flex cursor-pointer items-center justify-between gap-3 text-start`}
            >
                <span className={`truncate ${selected ? "" : "text-slate-500"}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ease-out dark:text-slate-300 ${open ? "rotate-180 text-teal-500 dark:text-teal-400" : ""
                        }`}
                />
            </button>

            <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-hidden={!open}
                className={`absolute inset-x-0 z-30 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/30 transition-all duration-150 ease-out dark:border-slate-700 dark:bg-slate-900 ${openUp ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"
                    } ${open
                        ? "visible translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none invisible scale-95 opacity-0"
                    }`}
            >
                {options.map((option, index) => {
                    const isSelected = option.value === value;
                    const isActive = index === activeIndex;

                    return (
                        <li
                            key={option.value}
                            id={`${id}-option-${index}`}
                            role="option"
                            aria-selected={isSelected}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => choose(index)}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${isActive
                                ? "bg-teal-600/10 text-teal-700 dark:text-teal-300"
                                : "text-slate-700 dark:text-slate-200"
                                } ${isSelected ? "font-semibold" : ""}`}
                        >
                            <span className="truncate">{option.label}</span>
                            {isSelected && <Check className="h-4 w-4 shrink-0 text-teal-500" />}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Skeleton() {
    return (
        <div className="grid animate-pulse grid-cols-1 gap-6 xl:grid-cols-2">
            {[0, 1, 2, 3].map((card) => (
                <div
                    key={card}
                    className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-slate-200 dark:bg-slate-800" />
                        <div className="space-y-2">
                            <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                            <div className="h-3 w-64 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                    </div>
                    {[0, 1, 2].map((row) => (
                        <div key={row} className="space-y-2">
                            <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-800" />
                            <div className="h-11 w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/* ------------------------------- page ------------------------------- */

export default function CenterSettingsPage({ initialLocale,
}: CenterSettingsProps) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [draft, setDraft] = useState<FormValues>(EMPTY_VALUES);
    const [saved, setSaved] = useState<FormValues>(EMPTY_VALUES);
    const [errors, setErrors] = useState<Errors>({});
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [syncing, setSyncing] = useState(0);
    const [justSaved, setJustSaved] = useState(false);
    const [stale, setStale] = useState(false);
    const [assetPreviews, setAssetPreviews] = useState<Record<string, string>>({});

    const t = messages[locale];
    const isRtl = locale === "ar";

    const tRef = useRef<Messages>(t);
    const draftRef = useRef<FormValues>(EMPTY_VALUES);
    const savedRef = useRef<FormValues>(EMPTY_VALUES);
    const confirmedRef = useRef<FormValues>(EMPTY_VALUES);
    const versionRef = useRef(0);
    const queueRef = useRef<Promise<void>>(Promise.resolve());
    const uploadsRef = useRef(new Map<string, Promise<string>>());
    const objectUrlsRef = useRef(new Set<string>());
    const toastIdRef = useRef(0);
    const flashTimerRef = useRef<number | null>(null);
    const handleSaveRef = useRef<() => void>(() => undefined);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        const root = document.documentElement;
        const syncLocale = () => setLocale(root.lang === "ar" ? "ar" : "en");

        syncLocale();

        const observer = new MutationObserver(syncLocale);
        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const objectUrls = objectUrlsRef.current;

        return () => {
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
            if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        };
    }, []);

    /* ----------------------------- state sync ----------------------------- */

    const updateDraft = useCallback((updater: (current: FormValues) => FormValues) => {
        const next = updater(draftRef.current);

        draftRef.current = next;
        setDraft(next);
    }, []);

    const commitSaved = useCallback((next: FormValues) => {
        savedRef.current = next;
        setSaved(next);
    }, []);

    /* ------------------------------- toasts ------------------------------- */

    const dismissToast = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushToast = useCallback(
        (kind: ToastItem["kind"], message: string): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
            window.setTimeout(() => dismissToast(id), TOAST_MS);

            return id;
        },
        [dismissToast],
    );

    /* ------------------------------- loading ------------------------------- */

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const result = await getCenterSettingsAction();

            if (!result.success || !result.data) {
                setLoadError(result.error ?? tRef.current.loadFailed);
                return;
            }

            const values = toFormValues(result.data);

            setAssetPreviews(result.data.assetPreviews ?? {});

            versionRef.current = result.data.version;
            confirmedRef.current = values;
            draftRef.current = values;
            setDraft(values);
            commitSaved(values);
            setErrors({});
            setStale(false);
        } catch {
            setLoadError(tRef.current.loadFailed);
        } finally {
            setLoading(false);
        }
    }, [commitSaved]);

    useEffect(() => {
        void load();
    }, [load]);

    /* ------------------------------- editing ------------------------------- */

    const setField = useCallback(
        <K extends FieldKey>(key: K, value: FormValues[K]) => {
            updateDraft((current) => ({ ...current, [key]: value }));
            setErrors((current) => {
                if (!current[key]) return current;

                const next = { ...current };
                delete next[key];

                return next;
            });
        },
        [updateDraft],
    );

    const blurField = useCallback((key: FieldKey) => {
        const normalized = normalizeForm(draftRef.current);
        const found = validateForm(normalized, tRef.current);

        // Reflect the normalised value (e.g. phone formatting) as soon as the field loses focus.
        if (normalized[key] !== draftRef.current[key]) {
            updateDraft((current) => ({ ...current, [key]: normalized[key] }));
        }

        setErrors((current) => {
            const next = { ...current };

            if (found[key]) next[key] = found[key];
            else delete next[key];

            return next;
        });
    }, [updateDraft]);

    /* ------------------------------- images ------------------------------- */

    const handlePick = useCallback(
        async (kind: AssetKind, file: File) => {
            const msg = tRef.current;
            const allowed = kind === "logo" ? LOGO_TYPES : FAVICON_TYPES;
            const maxBytes = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
            const key: FieldKey = kind === "logo" ? "logoUrl" : "faviconUrl";

            if (!allowed.includes(file.type)) {
                pushToast("error", kind === "logo" ? msg.errors.logoType : msg.errors.faviconType);
                return;
            }

            if (file.size > maxBytes) {
                pushToast("error", kind === "logo" ? msg.errors.logoSize : msg.errors.faviconSize);
                return;
            }

            if (kind === "favicon") {
                const size = await readImageSize(file);
                const isIco = file.type.includes("icon");

                if (size ? size.width !== size.height || size.width < 32 : !isIco) {
                    pushToast("error", msg.errors.faviconSquare);
                    return;
                }
            }

            const blobUrl = URL.createObjectURL(file);
            const previous = draftRef.current[key];

            objectUrlsRef.current.add(blobUrl);
            updateDraft((current) => ({ ...current, [key]: blobUrl }));

            const body = new FormData();
            body.append("kind", kind);
            body.append("file", file);

            const task = uploadCenterAssetAction(body).then((result) => {
                if (!result.success || !result.data) {
                    throw new Error(result.error ?? tRef.current.uploadFailed);
                }

                return result.data.url;
            });

            uploadsRef.current.set(blobUrl, task);

            task.catch((error: unknown) => {
                uploadsRef.current.delete(blobUrl);
                updateDraft((current) =>
                    current[key] === blobUrl ? { ...current, [key]: previous } : current,
                );
                pushToast(
                    "error",
                    error instanceof Error && error.message
                        ? error.message
                        : tRef.current.uploadFailed,
                );
            });
        },
        [pushToast, updateDraft],
    );

    const handleRemove = useCallback(
        (kind: AssetKind) => {
            const key: FieldKey = kind === "logo" ? "logoUrl" : "faviconUrl";

            updateDraft((current) => ({ ...current, [key]: "" }));
        },
        [updateDraft],
    );

    /* -------------------------------- saving -------------------------------- */

    const handleSave = useCallback(() => {
        const normalized = normalizeForm(draftRef.current);
        const found = validateForm(normalized, tRef.current);

        if (Object.keys(found).length > 0) {
            setErrors(found);
            pushToast("error", tRef.current.validationFailed);

            const first = FIELD_ORDER.find((key) => found[key]);

            if (first) document.getElementById(`cs-${first}`)?.focus();

            return;
        }

        if (sameValues(normalized, savedRef.current)) return;

        // Optimistic: the UI is already "saved" in this same frame.
        setErrors({});
        updateDraft(() => normalized);
        commitSaved(normalized);
        setJustSaved(true);

        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setJustSaved(false), 1800);

        const toastId = pushToast("success", tRef.current.saved);

        setSyncing((count) => count + 1);

        const rollback = (message: string, fieldErrors?: Errors) => {
            dismissToast(toastId);

            // Only revert if no later save replaced this baseline.
            if (savedRef.current === normalized) commitSaved(confirmedRef.current);

            if (fieldErrors && Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);

            setJustSaved(false);
            pushToast("error", message);
        };

        const run = async () => {
            try {
                const payload: FormValues = { ...normalized };

                for (const key of ["logoUrl", "faviconUrl"] as const) {
                    const value = payload[key];

                    if (value.startsWith("blob:")) {
                        const task = uploadsRef.current.get(value);

                        if (!task) throw new Error(tRef.current.uploadFailed);

                        payload[key] = await task;
                    }
                }

                const result = await saveCenterSettingsAction({
                    ...payload,
                    expectedVersion: versionRef.current,
                });

                if (!result.success || !result.data) {
                    if (result.code === "CONFLICT") setStale(true);

                    rollback(result.error ?? tRef.current.saveFailed, result.fieldErrors);
                    return;
                }

                versionRef.current = result.data.version;
                confirmedRef.current = normalized;
            } catch (error) {
                rollback(
                    error instanceof Error && error.message
                        ? error.message
                        : tRef.current.saveFailed,
                );
            } finally {
                setSyncing((count) => Math.max(0, count - 1));
            }
        };

        queueRef.current = queueRef.current.then(run, run);
    }, [commitSaved, dismissToast, pushToast, updateDraft]);

    useEffect(() => {
        handleSaveRef.current = handleSave;
    }, [handleSave]);

    const dirty = useMemo(() => !sameValues(draft, saved), [draft, saved]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                handleSaveRef.current();
            }
        };

        window.addEventListener("keydown", onKeyDown);

        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!dirty && syncing === 0) return;

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);

        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty, syncing]);

    /* -------------------------------- render -------------------------------- */

    const textField = (
        key: FieldKey,
        options: {
            label: string;
            hint?: string;
            placeholder?: string;
            dir?: "ltr" | "rtl";
            inputMode?: "numeric" | "tel" | "email" | "url" | "text";
            maxLength?: number;
            type?: string;
            autoComplete?: string;
            digitsOnly?: boolean;
            className?: string;
        },
    ) => (
        <Field
            id={`cs-${key}`}
            label={options.label}
            hint={options.hint}
            error={errors[key]}
            className={options.className}
        >
            <TextInput
                id={`cs-${key}`}
                value={draft[key]}
                dir={options.dir}
                inputMode={options.inputMode}
                maxLength={options.maxLength}
                type={options.type}
                autoComplete={options.autoComplete}
                placeholder={options.placeholder}
                error={errors[key]}
                onChange={(value) =>
                    setField(
                        key,
                        (options.digitsOnly
                            ? digits(value).slice(0, options.maxLength)
                            : value) as FormValues[typeof key],
                    )
                }
                onBlur={() => blurField(key)}
            />
        </Field>
    );

    const SaveIcon = justSaved && !dirty ? Check : Save;
    const resolveAsset = (url: string) => (url ? (assetPreviews[url] ?? url) : "");

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar
                    locale={locale}
                    activeHref="/admin/settings"
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

                                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                                    {t.subtitle}
                                </p>
                            </div>

                            <div className="flex items-center gap-3 self-start">
                                <span
                                    aria-live="polite"
                                    className={`text-xs text-slate-500 transition-opacity duration-200 dark:text-slate-400 ${syncing > 0 ? "opacity-100" : "opacity-0"
                                        }`}
                                >
                                    {t.syncing}
                                </span>

                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={loading || Boolean(loadError) || !dirty}
                                    className={`${tealButton} h-12 px-6 text-base`}
                                >
                                    <SaveIcon className="h-5 w-5 transition-transform duration-200" />
                                    {t.save}
                                </button>
                            </div>
                        </header>

                        {stale && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 transition-all duration-200 dark:text-amber-300">
                                <span className="flex items-center gap-2 font-medium">
                                    <CircleAlert className="h-4 w-4" />
                                    {t.staleTitle}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void load()}
                                    className={`${linkButton} text-amber-700 hover:bg-amber-500/10 dark:text-amber-300`}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    {t.staleAction}
                                </button>
                            </div>
                        )}

                        {loading ? (
                            <Skeleton />
                        ) : loadError ? (
                            <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
                                <CircleAlert className="h-8 w-8 text-teal-500" />
                                <p className="text-sm">{loadError}</p>
                                <button type="button" onClick={() => void load()} className={tealButton}>
                                    <RefreshCw className="h-4 w-4" />
                                    {t.retry}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                                {/* 1 — Branding & Identity */}
                                <SectionCard
                                    icon={Building2}
                                    title={t.brandingTitle}
                                    subtitle={t.brandingSubtitle}
                                >
                                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                                        <ImageUploader
                                            kind="logo"
                                            src={resolveAsset(draft.logoUrl)}
                                            label={t.logo}
                                            hint={t.logoHint}
                                            changeLabel={t.changeLogo}
                                            uploadLabel={t.uploadLogo}
                                            removeLabel={t.remove}
                                            accept={LOGO_TYPES.join(",")}
                                            onPick={(file) => void handlePick("logo", file)}
                                            onRemove={() => handleRemove("logo")}
                                        />
                                        <ImageUploader
                                            kind="favicon"
                                            src={resolveAsset(draft.faviconUrl)}
                                            label={t.favicon}
                                            hint={t.faviconHint}
                                            changeLabel={t.change}
                                            uploadLabel={t.upload}
                                            removeLabel={t.remove}
                                            accept={FAVICON_TYPES.join(",")}
                                            onPick={(file) => void handlePick("favicon", file)}
                                            onRemove={() => handleRemove("favicon")}
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        {textField("tradeNameAr", {
                                            label: t.tradeNameAr,
                                            placeholder: t.tradeNameArPlaceholder,
                                            dir: "rtl",
                                            maxLength: 120,
                                        })}
                                        {textField("tradeNameEn", {
                                            label: t.tradeNameEn,
                                            placeholder: t.tradeNameEnPlaceholder,
                                            dir: "ltr",
                                            maxLength: 120,
                                        })}
                                    </div>
                                </SectionCard>

                                {/* 2 — Legal Information & National Address */}
                                <SectionCard
                                    icon={FileText}
                                    title={t.legalTitle}
                                    subtitle={t.legalSubtitle}
                                    badge={
                                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                                            <CircleAlert className="h-3.5 w-3.5" />
                                            {t.zatcaBadge}
                                        </span>
                                    }
                                >
                                    {textField("taxRegistrationNumber", {
                                        label: t.taxNumber,
                                        hint: t.taxHint,
                                        dir: "ltr",
                                        inputMode: "numeric",
                                        maxLength: 15,
                                        digitsOnly: true,
                                    })}

                                    <Notice>{t.taxNotice}</Notice>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        {textField("streetName", {
                                            label: t.street,
                                            maxLength: 127,
                                            autoComplete: "street-address",
                                        })}
                                        {textField("district", {
                                            label: t.district,
                                            maxLength: 127,
                                        })}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                                        {textField("city", {
                                            label: t.city,
                                            maxLength: 127,
                                        })}
                                        {textField("postalCode", {
                                            label: t.postalCode,
                                            hint: t.digits5,
                                            dir: "ltr",
                                            inputMode: "numeric",
                                            maxLength: 5,
                                            digitsOnly: true,
                                            autoComplete: "postal-code",
                                        })}
                                        {textField("additionalNumber", {
                                            label: t.additionalNumber,
                                            hint: t.digits4,
                                            dir: "ltr",
                                            inputMode: "numeric",
                                            maxLength: 4,
                                            digitsOnly: true,
                                        })}
                                        {textField("buildingNumber", {
                                            label: t.buildingNumber,
                                            hint: t.digits4,
                                            dir: "ltr",
                                            inputMode: "numeric",
                                            maxLength: 4,
                                            digitsOnly: true,
                                        })}
                                    </div>
                                </SectionCard>

                                {/* 3 — Medical Identifiers */}
                                <SectionCard
                                    icon={ShieldCheck}
                                    title={t.medicalTitle}
                                    subtitle={t.medicalSubtitle}
                                    badge={
                                        <span className="inline-flex items-center rounded-full border border-teal-500/50 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-600 dark:text-teal-300">
                                            {t.medicalBadge}
                                        </span>
                                    }
                                >
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        {textField("mohLicenseNumber", {
                                            label: t.mohLicense,
                                            hint: t.mohHint,
                                            dir: "ltr",
                                            maxLength: 50,
                                        })}
                                        {textField("nphiesFacilityId", {
                                            label: t.nphiesId,
                                            hint: t.nphiesHint,
                                            dir: "ltr",
                                            maxLength: 50,
                                        })}
                                    </div>

                                    <Field
                                        id="cs-facilityType"
                                        label={t.facilityType}
                                        error={errors.facilityType}
                                    >
                                        <SelectField<CenterFacilityType>
                                            id="cs-facilityType"
                                            value={draft.facilityType}
                                            placeholder={t.facilityPlaceholder}
                                            error={errors.facilityType}
                                            options={FACILITY_TYPES.map((type) => ({
                                                value: type,
                                                label: t.facilityTypes[type],
                                            }))}
                                            onChange={(next) => setField("facilityType", next)}
                                            onBlur={() => blurField("facilityType")}
                                        />
                                    </Field>

                                    <Notice>{t.medicalNotice}</Notice>
                                </SectionCard>

                                {/* 4 — Contact Information */}
                                <SectionCard
                                    icon={Phone}
                                    title={t.contactTitle}
                                    subtitle={t.contactSubtitle}
                                >
                                    {textField("phone", {
                                        label: t.phone,
                                        hint: t.phoneHint,
                                        dir: "ltr",
                                        inputMode: "tel",
                                        type: "tel",
                                        maxLength: 24,
                                        autoComplete: "tel",
                                    })}
                                    {textField("email", {
                                        label: t.email,
                                        hint: t.emailHint,
                                        dir: "ltr",
                                        inputMode: "email",
                                        type: "email",
                                        maxLength: 254,
                                        autoComplete: "email",
                                    })}
                                    {textField("websiteUrl", {
                                        label: t.website,
                                        hint: t.websiteHint,
                                        dir: "ltr",
                                        inputMode: "url",
                                        type: "url",
                                        maxLength: 255,
                                        autoComplete: "url",
                                    })}
                                </SectionCard>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <div
                aria-live="polite"
                className="pointer-events-none fixed bottom-4 end-4 z-[200] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role="status"
                        className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl shadow-black/40 transition-all duration-200 ease-out ${toast.kind === "success"
                            ? "border-teal-500/50 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                            : "border-rose-500/50 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                            }`}
                    >
                        {toast.kind === "success" ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                        ) : (
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                        )}
                        <p className="flex-1">{toast.message}</p>
                        <button
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            aria-label="Dismiss"
                            className="rounded p-0.5 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}