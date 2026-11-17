// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/AddEditDoctorModal.tsx
// Form handling + validation. On a valid submit the parent applies the change
// optimistically and closes the modal in the same frame.
// ============================================================================

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
    Activity,
    BriefcaseMedical,
    Building2,
    CheckCircle2,
    CircleAlert,
    Contact,
    Eye,
    EyeOff,
    FileBadge,
    FileText,
    Lock,
    Mail,
    Percent,
    Stethoscope,
    UserRound,
    X,
} from "lucide-react";
import { DoctorProfessionalRank } from "@prisma/client";
import type { Locale } from "@/lib/i18n/types";
import type {
    CreateDoctorInput,
    DoctorFormOptions,
    DoctorRow,
    DropdownOption,
    FormErrors,
} from "../../types";
import { rankLabels, SPECIALTIES } from "./constants";
import Dropdown from "./Dropdown";
import { Field, SectionTitle } from "./FormPrimitives";
import type { Messages } from "./messages";
import { baseInput, outlineButton, tealButton } from "./ui";
import { generatePassword } from "./utils";
import { validateForm } from "./validation";

export default function AddEditDoctorModal({
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
    onSubmit: (input: CreateDoctorInput) => void;
    onReloadOptions: () => void;
}) {
    const isEdit = Boolean(doctor);
    const isRtl = locale === "ar";

    const [errors, setErrors] = useState<FormErrors>({});
    const [formError, setFormError] = useState("");
    const [clinicId, setClinicId] = useState(doctor?.clinicId ?? "");
    const [rank, setRank] = useState<string>(doctor?.professionalRank ?? "");
    const [specialty, setSpecialty] = useState<string>(doctor?.specialty ?? "");
    const [serviceIds, setServiceIds] = useState<string[]>(
        doctor ? doctor.services.map((service) => service.id) : [],
    );
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    // Inputs forced to dir="ltr" resolve ps-/pe- physically (start = left),
    // so the padding must be mirrored in RTL to stay on the icon's side.
    const ltrInputPadding = isRtl ? "ps-3 pe-11 text-end" : "ps-11 pe-3";

    const clinicOptions = useMemo(() => {
        if (doctor && !options.clinics.some((clinic) => clinic.id === doctor.clinicId)) {
            return [
                ...options.clinics,
                {
                    id: doctor.clinicId,
                    nameEn: doctor.clinicName,
                    nameAr: doctor.clinicNameAr || doctor.clinicName,
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

    const rankDropdownOptions = useMemo<DropdownOption[]>(
        () =>
            Object.values(DoctorProfessionalRank).map((item) => ({
                value: item,
                label: rankLabels[item][locale],
            })),
        [locale],
    );

    const specialtyDropdownOptions = useMemo<DropdownOption[]>(
        () =>
            specialtyOptions.map((item) => ({
                value: item.en,
                label: isRtl ? item.ar : item.en,
            })),
        [specialtyOptions, isRtl],
    );

    const clinicDropdownOptions = useMemo<DropdownOption[]>(
        () =>
            clinicOptions.map((clinic) => ({
                value: clinic.id,
                label: isRtl ? clinic.nameAr : clinic.nameEn,
            })),
        [clinicOptions, isRtl],
    );

    const filteredServices = useMemo(
        () => (clinicId ? options.services.filter((service) => service.clinicId === clinicId) : []),
        [options.services, clinicId],
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

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

    // Validation stays synchronous. Once it passes, the parent applies the change
    // optimistically, closes this modal in the same frame and syncs in the background.
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

        onSubmit(validation.input);
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm dark:bg-slate-950/80 sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
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
                                        onChange={(event) => {
                                            setPassword(event.target.value);
                                            clearError("temporaryPassword");
                                        }}
                                        className={`${baseInput} h-12 ${isRtl ? "ps-40 pe-11 text-end" : "ps-11 pe-40"}`}
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? t.hidePassword : t.showPassword}
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
                                        onClick={handleGenerate}
                                        className="absolute end-2 top-1/2 h-9 -translate-y-1/2 rounded-md border border-teal-500 px-4 text-sm font-semibold text-teal-400 transition hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                                    >
                                        {t.generate}
                                    </button>
                                </span>
                            </Field>

                            {isEdit && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t.tempPasswordEditHint}
                                </p>
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
                                            className={`${baseInput} ${ltrInputPadding}`}
                                            aria-invalid={Boolean(errors.nationalId)}
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
                                            className={`${baseInput} ${ltrInputPadding}`}
                                            aria-invalid={Boolean(errors.scfhsLicenseNumber)}
                                            onChange={() => clearError("scfhsLicenseNumber")}
                                        />
                                    </span>
                                </Field>

                                <Field id="doctor-rank" label={t.rank} error={errors.professionalRank}>
                                    <Dropdown
                                        id="doctor-rank"
                                        name="professionalRank"
                                        value={rank}
                                        onChange={(next) => {
                                            setRank(next);
                                            clearError("professionalRank");
                                        }}
                                        options={rankDropdownOptions}
                                        placeholder={t.chooseRank}
                                        icon={BriefcaseMedical}
                                        isRtl={isRtl}
                                        invalid={Boolean(errors.professionalRank)}
                                    />
                                </Field>

                                <Field id="doctor-specialty" label={t.specialty} error={errors.specialty}>
                                    <Dropdown
                                        id="doctor-specialty"
                                        name="specialty"
                                        value={specialty}
                                        onChange={(next) => {
                                            setSpecialty(next);
                                            clearError("specialty");
                                        }}
                                        options={specialtyDropdownOptions}
                                        placeholder={t.chooseSpecialty}
                                        icon={Stethoscope}
                                        isRtl={isRtl}
                                        invalid={Boolean(errors.specialty)}
                                    />
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
                                    <Dropdown
                                        id="doctor-clinic"
                                        name="clinicId"
                                        value={clinicId}
                                        onChange={changeClinic}
                                        options={clinicDropdownOptions}
                                        placeholder={optionsLoading ? "…" : t.chooseClinic}
                                        icon={Building2}
                                        isRtl={isRtl}
                                        disabled={optionsLoading || clinicOptions.length === 0}
                                        className="h-12"
                                    />

                                    {!optionsLoading && clinicOptions.length === 0 && (
                                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                            {t.noClinics}
                                        </span>
                                    )}
                                </Field>

                                <fieldset className="min-w-0">
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
                                            className={`${baseInput} h-12 ${ltrInputPadding}`}
                                            aria-invalid={Boolean(errors.commissionRate)}
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
                            onClick={onClose}
                            className={`${outlineButton} h-12 px-8`}
                        >
                            {t.cancel}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                optionsLoading || Boolean(optionsError) || clinicOptions.length === 0
                            }
                            className={`${tealButton} h-12 px-6`}
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            {isEdit ? t.saveEdit : t.save}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );
}