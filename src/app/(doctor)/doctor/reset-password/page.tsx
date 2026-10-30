
"use client";

import {
    useEffect,
    useState,
    useTransition,
    type FormEvent,
} from "react";
import {
    Check,
    Circle,
    Eye,
    EyeOff,
    LockKeyhole,
    ShieldCheck,
    AlertCircle,
    LoaderCircle,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import type { Locale } from "@/lib/i18n/types";
import {
    resetDoctorPasswordAction,
    type ResetPasswordInput,
} from "./actions";

const translations = {
    en: {
        title: "Set a New Password",
        subtitle:
            "Secure your account before accessing your medical portal.",
        securityTitle: "First-time Login Security Requirement:",
        securityDescription:
            "Please establish your permanent account password.",
        currentPassword: "Current Temporary Password",
        newPassword: "New Password",
        confirmPassword: "Confirm New Password",
        minimum: "Minimum 12 characters",
        case: "Uppercase and lowercase letters",
        number: "Includes a number",
        special: "Includes a special character",
        update: "Update Password & Access Portal",
        updating: "Updating Password...",
        encrypted: "Your password is encrypted and securely stored.",
        required: "Please complete all password fields.",
        invalidCurrent: "Enter your current temporary password.",
        invalidNew: "Your new password does not meet all requirements.",
        reused: "Your new password must differ from the temporary password.",
        mismatch: "The passwords do not match.",
        maxLength: "Password must not exceed 128 characters or 256 UTF-8 bytes.",
        show: "Show password",
        hide: "Hide password",
        unexpected: "An unexpected error occurred. Please try again.",
        lightMode: "Light mode",
        darkMode: "Dark mode",
    },
    ar: {
        title: "تعيين كلمة مرور جديدة",
        subtitle: "قم بتأمين حسابك قبل الوصول إلى بوابة الطبيب.",
        securityTitle: "متطلب أمني لتسجيل الدخول لأول مرة:",
        securityDescription: "يرجى تعيين كلمة مرور دائمة لحسابك.",
        currentPassword: "كلمة المرور المؤقتة الحالية",
        newPassword: "كلمة المرور الجديدة",
        confirmPassword: "تأكيد كلمة المرور الجديدة",
        minimum: "12 حرفاً على الأقل",
        case: "أحرف إنجليزية كبيرة وصغيرة",
        number: "تحتوي على رقم",
        special: "تحتوي على رمز خاص",
        update: "تحديث كلمة المرور والدخول للبوابة",
        updating: "جارٍ تحديث كلمة المرور...",
        encrypted: "يتم تشفير كلمة المرور وتخزينها بشكل آمن.",
        required: "يرجى تعبئة جميع حقول كلمات المرور.",
        invalidCurrent: "يرجى إدخال كلمة المرور المؤقتة الحالية.",
        invalidNew: "كلمة المرور الجديدة لا تستوفي جميع المتطلبات.",
        reused: "يجب أن تختلف كلمة المرور الجديدة عن المؤقتة.",
        mismatch: "كلمتا المرور غير متطابقتين.",
        maxLength: "يجب ألا تتجاوز كلمة المرور 128 حرفاً أو 256 بايت.",
        show: "إظهار كلمة المرور",
        hide: "إخفاء كلمة المرور",
        unexpected: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
        lightMode: "الوضع الفاتح",
        darkMode: "الوضع الداكن",
    },
} as const;

type PasswordFieldName =
    | "currentPassword"
    | "newPassword"
    | "confirmPassword";

type PasswordVisibility = Record<PasswordFieldName, boolean>;

const initialVisibility: PasswordVisibility = {
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
};

const initialValues: ResetPasswordInput = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
};

function getPasswordChecks(password: string) {
    return {
        minimum: password.length >= 12,
        case: /[a-z]/.test(password) && /[A-Z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    };
}

function isValidPassword(password: string): boolean {
    const checks = getPasswordChecks(password);

    return (
        Object.values(checks).every(Boolean) &&
        password.length <= 128 &&
        new TextEncoder().encode(password).length <= 256
    );
}

function PasswordInput({
    id,
    label,
    value,
    visible,
    onChange,
    onToggle,
    showLabel,
    hideLabel,
    autoComplete,
    disabled,
}: {
    id: PasswordFieldName;
    label: string;
    value: string;
    visible: boolean;
    onChange: (value: string) => void;
    onToggle: () => void;
    showLabel: string;
    hideLabel: string;
    autoComplete: string;
    disabled: boolean;
}) {
    return (
        <div className="space-y-2">
            <label
                htmlFor={id}
                className="block text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
                {label}
            </label>

            <div className="relative">
                <input
                    id={id}
                    name={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    autoComplete={autoComplete}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={disabled}
                    required
                    maxLength={128}
                    dir="ltr"
                    className="h-12 w-full rounded-lg border border-slate-300 bg-white/70 px-5 pe-12 text-left text-[15px] tracking-[0.12em] text-slate-900 outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-100 dark:focus:border-teal-500"
                />

                <button
                    type="button"
                    onClick={onToggle}
                    disabled={disabled}
                    aria-label={visible ? hideLabel : showLabel}
                    aria-pressed={visible}
                    className="absolute end-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-teal-600 focus-visible:outline-2 focus-visible:outline-teal-500 disabled:opacity-50 dark:text-blue-200 dark:hover:text-teal-400"
                >
                    {visible ? (
                        <EyeOff size={21} strokeWidth={1.8} />
                    ) : (
                        <Eye size={21} strokeWidth={1.8} />
                    )}
                </button>
            </div>
        </div>
    );
}

export default function DoctorResetPasswordPage() {
    const [locale, setLocale] = useState<Locale>("ar");
    const [values, setValues] =
        useState<ResetPasswordInput>(initialValues);
    const [visibility, setVisibility] =
        useState<PasswordVisibility>(initialVisibility);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const root = document.documentElement;

        function syncLocale() {
            setLocale(root.lang === "en" ? "en" : "ar");
        }

        syncLocale();

        const observer = new MutationObserver(syncLocale);

        observer.observe(root, {
            attributes: true,
            attributeFilter: ["lang", "dir"],
        });

        return () => observer.disconnect();
    }, []);

    const t = translations[locale];
    const isRtl = locale === "ar";

    const checks = getPasswordChecks(values.newPassword);

    const requirements = [
        { key: "minimum", label: t.minimum, valid: checks.minimum },
        { key: "case", label: t.case, valid: checks.case },
        { key: "number", label: t.number, valid: checks.number },
        { key: "special", label: t.special, valid: checks.special },
    ] as const;

    function updateField(
        field: PasswordFieldName,
        value: string,
    ): void {
        setValues((previous) => ({
            ...previous,
            [field]: value,
        }));

        setError(null);
    }

    function toggleVisibility(field: PasswordFieldName): void {
        setVisibility((previous) => ({
            ...previous,
            [field]: !previous[field],
        }));
    }

    function validateForm(): string | null {
        const {
            currentPassword,
            newPassword,
            confirmPassword,
        } = values;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return t.required;
        }

        if (
            currentPassword.length > 128 ||
            newPassword.length > 128 ||
            new TextEncoder().encode(currentPassword).length > 256 ||
            new TextEncoder().encode(newPassword).length > 256
        ) {
            return t.maxLength;
        }

        if (!isValidPassword(newPassword)) {
            return t.invalidNew;
        }

        if (currentPassword === newPassword) {
            return t.reused;
        }

        if (newPassword !== confirmPassword) {
            return t.mismatch;
        }

        return null;
    }

    function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): void {
        event.preventDefault();

        if (isPending) return;

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        setError(null);

        const payload: ResetPasswordInput = {
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
            confirmPassword: values.confirmPassword,
        };

        startTransition(async () => {
            try {
                const result = await resetDoctorPasswordAction(payload);

                if (!result.success) {
                    setError(result.error ?? t.unexpected);
                }
            } catch (caught) {
                if (
                    caught instanceof Error &&
                    caught.message === "NEXT_REDIRECT"
                ) {
                    throw caught;
                }

                setError(t.unexpected);
            }
        });
    }

    return (
        <main
            lang={locale}
            dir={isRtl ? "rtl" : "ltr"}
            className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-900 antialiased dark:bg-[#050d1e] dark:text-slate-100 sm:px-6 sm:py-12"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 hidden dark:block"
                style={{
                    background:
                        "radial-gradient(ellipse at 50% 45%, rgba(17,39,65,0.38) 0%, rgba(5,13,30,0) 70%)",
                }}
            />

            <section className="relative z-10 w-full max-w-[680px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/5 sm:p-7 dark:border-[#30415c] dark:bg-[#0d192d]/90 dark:shadow-black/25">
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="w-40"><BrandLogo /></div>

                    <div className="flex    items-center gap-3">
                        <LanguageToggle locale={locale}
                            variant="header" />
                        <ThemeToggle lightLabel={t.lightMode}
                            darkLabel={t.darkMode}
                            variant="header" />
                    </div>
                </header>

                <div className="mb-5 mt-10 text-center sm:mt-11">
                    <h1 className="text-[27px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-white">
                        {t.title}
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-[17px] dark:text-[#b5c9e5]">
                        {t.subtitle}
                    </p>
                </div>

                <div className="mb-5 flex items-center gap-5 rounded-xl border border-teal-500/40 bg-teal-50 px-5 py-4 dark:border-teal-600/50 dark:bg-teal-900/20">
                    <div className="shrink-0 text-teal-600 dark:text-teal-400">
                        <LockKeyhole size={38} strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0 border-s border-teal-500/40 ps-5">
                        <p className="text-sm font-bold leading-6 text-slate-900 sm:text-base dark:text-white">
                            {t.securityTitle}
                        </p>

                        <p className="mt-0.5 text-sm leading-6 text-slate-600 sm:text-[15px] dark:text-[#b5c9e5]">
                            {t.securityDescription}
                        </p>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="space-y-4"
                >
                    <PasswordInput
                        id="currentPassword"
                        label={t.currentPassword}
                        value={values.currentPassword}
                        visible={visibility.currentPassword}
                        onChange={(value) =>
                            updateField("currentPassword", value)
                        }
                        onToggle={() =>
                            toggleVisibility("currentPassword")
                        }
                        showLabel={t.show}
                        hideLabel={t.hide}
                        autoComplete="current-password"
                        disabled={isPending}
                    />

                    <div className="space-y-3">
                        <PasswordInput
                            id="newPassword"
                            label={t.newPassword}
                            value={values.newPassword}
                            visible={visibility.newPassword}
                            onChange={(value) =>
                                updateField("newPassword", value)
                            }
                            onToggle={() =>
                                toggleVisibility("newPassword")
                            }
                            showLabel={t.show}
                            hideLabel={t.hide}
                            autoComplete="new-password"
                            disabled={isPending}
                        />

                        <div
                            className="space-y-2 py-0.5"
                            aria-label={
                                isRtl
                                    ? "متطلبات كلمة المرور"
                                    : "Password requirements"
                            }
                        >
                            {requirements.map((requirement) => (
                                <div
                                    key={requirement.key}
                                    className="flex items-center gap-3"
                                >
                                    {requirement.valid ? (
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
                                            <Check size={13} strokeWidth={3} />
                                        </span>
                                    ) : (
                                        <Circle
                                            size={20}
                                            strokeWidth={1.8}
                                            className="shrink-0 text-slate-400 dark:text-[#7690b5]"
                                        />
                                    )}

                                    <span
                                        className={`text-[13px] sm:text-sm ${requirement.valid
                                            ? "text-teal-700 dark:text-teal-300"
                                            : "text-slate-500 dark:text-[#b5c9e5]"
                                            }`}
                                    >
                                        {requirement.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <PasswordInput
                        id="confirmPassword"
                        label={t.confirmPassword}
                        value={values.confirmPassword}
                        visible={visibility.confirmPassword}
                        onChange={(value) =>
                            updateField("confirmPassword", value)
                        }
                        onToggle={() =>
                            toggleVisibility("confirmPassword")
                        }
                        showLabel={t.show}
                        hideLabel={t.hide}
                        autoComplete="new-password"
                        disabled={isPending}
                    />

                    {values.confirmPassword.length > 0 &&
                        values.newPassword !== values.confirmPassword && (
                            <p
                                className="flex items-center gap-2 text-xs text-rose-500"
                                role="status"
                            >
                                <AlertCircle size={15} />
                                {t.mismatch}
                            </p>
                        )}

                    {error && (
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300"
                        >
                            <AlertCircle
                                size={18}
                                className="mt-0.5 shrink-0"
                            />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isPending}
                        className="mt-1 flex h-[53px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-65 sm:text-[18px] dark:bg-[#079e98] dark:hover:bg-teal-600"
                    >
                        {isPending ? (
                            <>
                                <LoaderCircle
                                    size={20}
                                    className="animate-spin"
                                />
                                {t.updating}
                            </>
                        ) : (
                            t.update
                        )}
                    </button>
                </form>

                <footer className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500 sm:text-[13px] dark:text-[#98afce]">
                    <ShieldCheck size={18} strokeWidth={1.7} />
                    <span>{t.encrypted}</span>
                </footer>
            </section>
        </main>
    );
}
