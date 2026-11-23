"use client";

// ============================================================================
// app/(reception)/reception/dashboard/Modals.tsx
// Quick Appointment, Walk-in and Instant NPHIES Eligibility modals, plus the shared
// SelectBox dropdown (custom listbox: dark slate surface, teal-500 border, ✓ on selected).
// ============================================================================

import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    LoaderCircle,
    Search,
    ShieldCheck,
    UserRound,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import {
    checkEligibilityByNationalIdAction,
    createAppointmentAction,
    createWalkInAction,
    getAvailableSlotsAction,
    getBookingOptionsAction,
    searchPatientsAction,
    type BookingOptionsData,
    type EligibilityResultData,
    type PatientSearchRow,
    type SlotOption,
} from "./actions";
import {
    actionErrorMessage,
    addDaysToDate,
    backdropMotion,
    baseInput,
    displayDoctor,
    fill,
    formatTime,
    outlineButton,
    panelMotion,
    selectGroupLabelClass,
    selectOptionActiveClass,
    selectOptionClass,
    selectOptionSelectedClass,
    selectPanelClass,
    selectTriggerClass,
    selectTriggerOpenClass,
    shortRef,
    tealButton,
    type Messages,
} from "./FrontDeskShared";

/* ------------------------------------------------------------------ */
/* Shared building blocks                                             */
/* ------------------------------------------------------------------ */

function ModalShell({
    title,
    titleId,
    onClose,
    children,
    footer,
    closeLabel,
}: {
    title: string;
    titleId: string;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
    closeLabel: string;
}) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <motion.div
            {...backdropMotion}
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 dark:bg-slate-950/80 sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.section
                {...panelMotion}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/60 dark:border-slate-700 dark:bg-slate-900"
            >
                <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
                    <h2
                        id={titleId}
                        className="text-xl font-extrabold text-slate-900 dark:text-white"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        aria-label={closeLabel}
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="max-h-[calc(100dvh-220px)] space-y-5 overflow-y-auto px-5 pb-5 sm:px-7">
                    {children}
                </div>

                <footer className="flex flex-col-reverse gap-3 border-t border-slate-200/80 px-5 py-4 dark:border-slate-700/70 sm:flex-row sm:justify-end sm:px-7">
                    {footer}
                </footer>
            </motion.section>
        </motion.div>
    );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
            {children}
        </label>
    );
}

function ErrorNote({ message }: { message: string }) {
    if (!message) return null;

    return (
        <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500"
        >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{message}</p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* SelectBox — custom dropdown (listbox)                              */
/* ------------------------------------------------------------------ */

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    /** Options sharing the same consecutive `group` are rendered under one group heading. */
    group?: string;
}

interface SelectPlacement {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    rtl: boolean;
}

const SELECT_MAX_HEIGHT = 288;
const SELECT_GAP = 6;
const SELECT_MARGIN = 8;

/**
 * Accessible custom select: dark slate-950 panel with a teal-500 border while open, rounded
 * corners, hover/keyboard highlight, a teal highlight + ✓ on the selected option, scrollable
 * overflow, flips above the trigger when there is no room below, and follows the RTL/LTR
 * direction of the trigger. The panel is portalled to <body> so modal scroll containers never
 * clip it.
 */
export function SelectBox({
    id,
    value,
    onChange,
    options,
    placeholder = "",
    disabled = false,
    ariaLabel,
    icon: Icon,
    className = "",
}: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    icon?: typeof UserRound;
    className?: string;
}) {
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [placement, setPlacement] = useState<SelectPlacement | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const suppressClickRef = useRef(false);

    const optionId = useCallback((index: number) => `${listId}-opt-${index}`, [listId]);
    const selectedIndex = options.findIndex((option) => option.value === value);
    const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

    const firstEnabled = useCallback((): number => options.findIndex((option) => !option.disabled), [options]);

    const lastEnabled = useCallback((): number => {
        for (let index = options.length - 1; index >= 0; index--) {
            if (!options[index]?.disabled) return index;
        }

        return -1;
    }, [options]);

    const step = useCallback(
        (from: number, direction: 1 | -1): number => {
            if (options.length === 0) return -1;

            let index = from;

            for (let count = 0; count < options.length; count++) {
                index = (index + direction + options.length) % options.length;

                if (!options[index]?.disabled) return index;
            }

            return from;
        },
        [options],
    );

    const place = useCallback(() => {
        const button = buttonRef.current;

        if (!button) return;

        const rect = button.getBoundingClientRect();
        const rtl = window.getComputedStyle(button).direction === "rtl";
        const desired = Math.min(panelRef.current?.scrollHeight ?? SELECT_MAX_HEIGHT, SELECT_MAX_HEIGHT);
        const spaceBelow = window.innerHeight - rect.bottom - SELECT_MARGIN - SELECT_GAP;
        const spaceAbove = rect.top - SELECT_MARGIN - SELECT_GAP;
        const openUp = spaceBelow < Math.min(desired, 200) && spaceAbove > spaceBelow;
        const maxHeight = Math.max(
            120,
            Math.min(SELECT_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow),
        );
        const height = Math.min(desired, maxHeight);
        const top = openUp ? rect.top - SELECT_GAP - height : rect.bottom + SELECT_GAP;

        setPlacement({ top, left: rect.left, width: rect.width, maxHeight, rtl });
    }, []);

    const openList = useCallback(() => {
        if (disabled || options.length === 0) return;

        setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabled());
        setOpen(true);
    }, [disabled, options, selectedIndex, firstEnabled]);

    const closeList = useCallback(() => setOpen(false), []);

    const choose = useCallback(
        (option: SelectOption | undefined) => {
            if (!option || option.disabled) return;

            onChange(option.value);
            setOpen(false);
            buttonRef.current?.focus();
        },
        [onChange],
    );

    useLayoutEffect(() => {
        if (open) place();
    }, [open, place]);

    useEffect(() => {
        if (!open) {
            setPlacement(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

            setOpen(false);
        };
        const onViewport = () => place();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        window.addEventListener("resize", onViewport);
        window.addEventListener("scroll", onViewport, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            window.removeEventListener("resize", onViewport);
            window.removeEventListener("scroll", onViewport, true);
        };
    }, [open, place]);

    useEffect(() => {
        if (disabled && open) setOpen(false);
    }, [disabled, open]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;

        document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex, optionId]);

    function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
        if (disabled) return;

        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp": {
                event.preventDefault();

                if (!open) {
                    openList();
                } else {
                    setActiveIndex((current) =>
                        current < 0
                            ? firstEnabled()
                            : step(current, event.key === "ArrowDown" ? 1 : -1),
                    );
                }
                break;
            }
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
                if (open) {
                    event.preventDefault();
                    choose(options[activeIndex]);
                }
                break;
            case " ":
                if (open) {
                    event.preventDefault();
                    // The keyup of Space would otherwise fire a click that re-opens the list.
                    suppressClickRef.current = true;
                    choose(options[activeIndex]);
                }
                break;
            case "Escape":
                if (open) {
                    // Keep the surrounding modal open: only the list closes.
                    event.preventDefault();
                    event.stopPropagation();
                    closeList();
                }
                break;
            case "Tab":
                if (open) closeList();
                break;
            default:
                break;
        }
    }

    function handleKeyUp() {
        if (suppressClickRef.current) {
            window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 0);
        }
    }

    function handleClick() {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }

        if (open) closeList();
        else openList();
    }

    let lastGroup: string | undefined;

    return (
        <span className="relative block">
            {Icon && (
                <Icon className="pointer-events-none absolute start-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            )}

            <button
                ref={buttonRef}
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                className={`${selectTriggerClass} ${open ? selectTriggerOpenClass : ""} ${Icon ? "ps-11" : ""
                    } ${className}`}
            >
                <span
                    className={`min-w-0 flex-1 truncate ${selected ? "" : "text-slate-500 dark:text-slate-400"
                        }`}
                >
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-teal-500" : "text-slate-500 dark:text-slate-400"
                        }`}
                />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        id={listId}
                        role="listbox"
                        aria-label={ariaLabel}
                        dir={placement?.rtl ? "rtl" : "ltr"}
                        onMouseDown={(event) => event.preventDefault()}
                        style={{
                            position: "fixed",
                            top: placement?.top ?? 0,
                            left: placement?.left ?? 0,
                            width: placement?.width ?? 0,
                            maxHeight: placement?.maxHeight ?? SELECT_MAX_HEIGHT,
                            visibility: placement ? "visible" : "hidden",
                        }}
                        className={selectPanelClass}
                    >
                        {options.map((option, index) => {
                            const isSelected = index === selectedIndex;
                            const isActive = index === activeIndex;
                            const showGroup = option.group !== undefined && option.group !== lastGroup;

                            lastGroup = option.group;

                            return (
                                <div key={`${option.value}:${index}`}>
                                    {showGroup && (
                                        <div role="presentation" className={selectGroupLabelClass}>
                                            {option.group}
                                        </div>
                                    )}
                                    <div
                                        id={optionId(index)}
                                        role="option"
                                        aria-selected={isSelected}
                                        aria-disabled={option.disabled === true}
                                        onMouseEnter={() => {
                                            if (!option.disabled) setActiveIndex(index);
                                        }}
                                        onClick={() => choose(option)}
                                        className={`${selectOptionClass} ${option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                            } ${isSelected
                                                ? selectOptionSelectedClass
                                                : isActive && !option.disabled
                                                    ? selectOptionActiveClass
                                                    : ""
                                            }`}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {isSelected && (
                                            <Check className="h-4 w-4 shrink-0 text-teal-500" aria-hidden />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </span>
    );
}

function PatientPicker({
    locale,
    t,
    value,
    onChange,
    onRegister,
}: {
    locale: Locale;
    t: Messages;
    value: PatientSearchRow | null;
    onChange: (patient: PatientSearchRow | null) => void;
    onRegister: () => void;
}) {
    const isRtl = locale === "ar";
    const [term, setTerm] = useState("");
    const [results, setResults] = useState<PatientSearchRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const sequence = useRef(0);

    useEffect(() => {
        const query = term.trim();

        if (query.length < 2) {
            sequence.current += 1;
            setResults([]);
            setSearched(false);
            setSearching(false);
            return;
        }

        const id = ++sequence.current;

        setSearching(true);

        const timer = window.setTimeout(async () => {
            try {
                const result = await searchPatientsAction(query);

                if (id !== sequence.current) return;

                setResults(result.success && result.data ? result.data : []);
            } catch {
                if (id !== sequence.current) return;

                setResults([]);
            } finally {
                if (id === sequence.current) {
                    setSearched(true);
                    setSearching(false);
                }
            }
        }, 300);

        return () => window.clearTimeout(timer);
    }, [term]);

    const payerOf = (patient: PatientSearchRow): string =>
        patient.payerNameEn
            ? isRtl
                ? (patient.payerNameAr ?? patient.payerNameEn)
                : patient.payerNameEn
            : t.coverageLabels.CASH;

    if (value) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-500/40 bg-teal-600/10 px-3 py-2.5">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {isRtl ? value.fullNameAr : value.fullNameEn}
                    </p>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                        <span dir="ltr">{value.fileNumber}</span> ·{" "}
                        <span dir="ltr">{value.nationalIdMasked}</span> · {payerOf(value)}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="shrink-0 text-sm font-semibold text-teal-600 underline dark:text-teal-400"
                >
                    {t.change}
                </button>
            </div>
        );
    }

    return (
        <div>
            <span className="relative block">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder={t.patientSearch}
                    aria-label={t.patientLabel}
                    autoComplete="off"
                    autoFocus
                    className={`${baseInput} ps-11`}
                />
                {searching && (
                    <LoaderCircle className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-500" />
                )}
            </span>

            {results.length > 0 && (
                <ul className="mt-2 max-h-52 divide-y divide-slate-200 overflow-y-auto rounded-xl border border-teal-500/40 bg-white dark:divide-slate-800 dark:bg-slate-950">
                    {results.map((patient) => (
                        <li key={patient.id}>
                            <button
                                type="button"
                                onClick={() => onChange(patient)}
                                className="w-full px-3 py-2.5 text-start transition-colors duration-150 hover:bg-teal-500/10 focus:bg-teal-500/10 focus:outline-none"
                            >
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                    {isRtl ? patient.fullNameAr : patient.fullNameEn}
                                </p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    <span dir="ltr">{patient.fileNumber}</span> ·{" "}
                                    <span dir="ltr">{patient.nationalIdMasked}</span> ·{" "}
                                    {payerOf(patient)}
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {searched && !searching && results.length === 0 && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {t.noPatients}{" "}
                    <button
                        type="button"
                        onClick={onRegister}
                        className="font-semibold text-teal-600 underline dark:text-teal-400"
                    >
                        {t.registerInstead}
                    </button>
                </p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Quick Appointment                                                  */
/* ------------------------------------------------------------------ */

export function QuickAppointmentModal({
    locale,
    t,
    timezone,
    today,
    onClose,
    onDone,
    onRegisterPatient,
}: {
    locale: Locale;
    t: Messages;
    timezone: string;
    today: string;
    onClose: () => void;
    onDone: (message: string) => void;
    onRegisterPatient: () => void;
}) {
    const isRtl = locale === "ar";
    const [patient, setPatient] = useState<PatientSearchRow | null>(null);
    const [options, setOptions] = useState<BookingOptionsData | null>(null);
    const [optionsError, setOptionsError] = useState("");
    const [clinicId, setClinicId] = useState("");
    const [doctorId, setDoctorId] = useState("");
    const [date, setDate] = useState(today);
    const [slots, setSlots] = useState<SlotOption[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [slotsError, setSlotsError] = useState("");
    const [slotKey, setSlotKey] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const loadOptions = useCallback(async () => {
        setOptionsError("");

        try {
            const result = await getBookingOptionsAction();

            if (result.success && result.data) setOptions(result.data);
            else setOptionsError(result.error ?? t.failed);
        } catch {
            setOptionsError(t.failed);
        }
    }, [t.failed]);

    useEffect(() => {
        void loadOptions();
    }, [loadOptions]);

    const doctors = useMemo(
        () =>
            options
                ? options.doctors.filter(
                    (doctor) => doctor.clinicId === clinicId && doctor.hasActiveShifts,
                )
                : [],
        [options, clinicId],
    );

    const clinicSelectOptions = useMemo<SelectOption[]>(
        () =>
            options
                ? options.clinics.map((clinic) => ({
                    value: clinic.id,
                    label: isRtl ? clinic.nameAr : clinic.nameEn,
                }))
                : [],
        [options, isRtl],
    );

    const doctorSelectOptions = useMemo<SelectOption[]>(
        () =>
            doctors.map((doctor) => ({
                value: doctor.id,
                label: displayDoctor(isRtl ? doctor.fullNameAr : doctor.fullNameEn, locale),
            })),
        [doctors, isRtl, locale],
    );

    useEffect(() => {
        setSlotKey("");

        if (!doctorId || !date) {
            setSlots([]);
            return;
        }

        let cancelled = false;

        setSlotsLoading(true);
        setSlotsError("");

        getAvailableSlotsAction({ doctorId, date })
            .then((result) => {
                if (cancelled) return;

                if (result.success && result.data) {
                    setSlots(result.data.slots);
                } else {
                    setSlots([]);
                    setSlotsError(result.error ?? t.failed);
                }
            })
            .catch(() => {
                if (cancelled) return;

                setSlots([]);
                setSlotsError(t.failed);
            })
            .finally(() => {
                if (!cancelled) setSlotsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [doctorId, date, t.failed]);

    const keyOf = (slot: SlotOption) => `${slot.shiftId}:${slot.startMinute}`;

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");

        const slot = slots.find((item) => keyOf(item) === slotKey);

        if (!patient) return setFormError(t.errPatient);
        if (!doctorId) return setFormError(t.errDoctor);
        if (!slot) return setFormError(t.errSlot);

        setSubmitting(true);

        try {
            const result = await createAppointmentAction({
                patientId: patient.id,
                doctorId,
                shiftId: slot.shiftId,
                date,
                startMinute: slot.startMinute,
                reason,
            });

            if (!result.success) {
                setFormError(result.error ?? t.failed);
                return;
            }

            // Booked in place: the dashboard closes the modal, toasts and refreshes the queue.
            onDone(t.toastBooked);
        } catch {
            setFormError(t.failed);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <ModalShell
            title={t.qaTitle}
            titleId="quick-appointment-title"
            onClose={onClose}
            closeLabel={t.close}
            footer={
                <>
                    <button type="button" onClick={onClose} className={`${outlineButton} h-11 px-6`}>
                        {t.cancel}
                    </button>
                    <button
                        type="submit"
                        form="quick-appointment-form"
                        disabled={submitting || !options}
                        className={`${tealButton} h-11 px-6`}
                    >
                        {submitting ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                        {submitting ? t.qaBooking : t.qaBook}
                    </button>
                </>
            }
        >
            <form id="quick-appointment-form" noValidate onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <FieldLabel>{t.patientLabel}</FieldLabel>
                    <PatientPicker
                        locale={locale}
                        t={t}
                        value={patient}
                        onChange={setPatient}
                        onRegister={onRegisterPatient}
                    />
                </div>

                {optionsError && (
                    <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500">
                        <p>{optionsError}</p>
                        <button
                            type="button"
                            onClick={() => void loadOptions()}
                            className="mt-2 font-semibold text-teal-600 underline dark:text-teal-400"
                        >
                            {t.retry}
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor="qa-clinic">{t.qaClinic}</FieldLabel>
                        <SelectBox
                            id="qa-clinic"
                            value={clinicId}
                            disabled={!options}
                            placeholder={options ? t.qaChooseClinic : t.loading}
                            options={clinicSelectOptions}
                            onChange={(value) => {
                                setClinicId(value);
                                setDoctorId("");
                            }}
                        />
                    </div>

                    <div>
                        <FieldLabel htmlFor="qa-doctor">{t.qaDoctor}</FieldLabel>
                        <SelectBox
                            id="qa-doctor"
                            value={doctorId}
                            disabled={!clinicId || doctors.length === 0}
                            placeholder={t.qaChooseDoctor}
                            options={doctorSelectOptions}
                            onChange={setDoctorId}
                        />
                        {clinicId && options && doctors.length === 0 && (
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                                {t.qaNoDoctors}
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <FieldLabel htmlFor="qa-date">{t.qaDate}</FieldLabel>
                    <span className="relative block">
                        <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                        <input
                            id="qa-date"
                            type="date"
                            dir="ltr"
                            min={today}
                            max={addDaysToDate(today, 60)}
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            className={`${baseInput} ps-11`}
                        />
                    </span>
                </div>

                <fieldset>
                    <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t.qaSlots}
                    </legend>

                    {!doctorId ? (
                        <p className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 px-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {t.qaPickDoctor}
                        </p>
                    ) : slotsLoading ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {Array.from({ length: 8 }, (_, index) => (
                                <div
                                    key={index}
                                    className="h-11 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
                                />
                            ))}
                        </div>
                    ) : slotsError ? (
                        <ErrorNote message={slotsError} />
                    ) : slots.length === 0 ? (
                        <p className="flex h-12 items-center rounded-lg border border-dashed border-slate-200 px-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {t.qaNoSlots}
                        </p>
                    ) : (
                        <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                            {slots.map((slot) => {
                                const key = keyOf(slot);
                                const selected = key === slotKey;

                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        aria-pressed={selected}
                                        title={isRtl ? slot.serviceNameAr : slot.serviceNameEn}
                                        onClick={() => setSlotKey(key)}
                                        className={`rounded-lg border px-2 py-2 text-center text-sm font-semibold transition-colors duration-150 ${selected
                                            ? "border-teal-500 bg-teal-600 text-white"
                                            : "border-slate-200 text-slate-800 hover:border-teal-500 hover:bg-teal-500/10 dark:border-slate-700 dark:text-slate-200"
                                            }`}
                                    >
                                        <span dir="ltr" className="block">
                                            {formatTime(slot.startIso, timezone, locale)}
                                        </span>
                                        <span className="block truncate text-[11px] font-normal opacity-80">
                                            {isRtl ? slot.serviceNameAr : slot.serviceNameEn}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </fieldset>

                <div>
                    <FieldLabel htmlFor="qa-reason">{t.qaReason}</FieldLabel>
                    <input
                        id="qa-reason"
                        value={reason}
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        className={baseInput}
                    />
                </div>

                <ErrorNote message={formError} />
            </form>
        </ModalShell>
    );
}

/* ------------------------------------------------------------------ */
/* Walk-in                                                            */
/* ------------------------------------------------------------------ */

export function WalkInModal({
    locale,
    t,
    onClose,
    onDone,
    onRegisterPatient,
}: {
    locale: Locale;
    t: Messages;
    onClose: () => void;
    onDone: (message: string) => void;
    onRegisterPatient: () => void;
}) {
    const isRtl = locale === "ar";
    const [patient, setPatient] = useState<PatientSearchRow | null>(null);
    const [options, setOptions] = useState<BookingOptionsData | null>(null);
    const [optionsError, setOptionsError] = useState("");
    const [doctorId, setDoctorId] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const loadOptions = useCallback(async () => {
        setOptionsError("");

        try {
            const result = await getBookingOptionsAction();

            if (result.success && result.data) setOptions(result.data);
            else setOptionsError(result.error ?? t.failed);
        } catch {
            setOptionsError(t.failed);
        }
    }, [t.failed]);

    useEffect(() => {
        void loadOptions();
    }, [loadOptions]);

    const doctorSelectOptions = useMemo<SelectOption[]>(() => {
        if (!options) return [];

        const entries: SelectOption[] = [];

        for (const clinic of options.clinics) {
            const clinicName = isRtl ? clinic.nameAr : clinic.nameEn;

            for (const doctor of options.doctors) {
                if (doctor.clinicId !== clinic.id) continue;

                const offDuty = doctor.presence === "OFF_DUTY";
                const name = displayDoctor(isRtl ? doctor.fullNameAr : doctor.fullNameEn, locale);

                entries.push({
                    value: doctor.id,
                    label: offDuty ? `${name} (${t.wiOffDuty})` : name,
                    disabled: offDuty,
                    group: clinicName,
                });
            }
        }

        return entries;
    }, [options, isRtl, locale, t.wiOffDuty]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");

        if (!patient) return setFormError(t.errPatient);
        if (!doctorId) return setFormError(t.errDoctor);

        setSubmitting(true);

        try {
            const result = await createWalkInAction({ patientId: patient.id, doctorId, reason });

            if (!result.success) {
                setFormError(result.error ?? t.failed);
                return;
            }

            onDone(t.toastWalkIn);
        } catch {
            setFormError(t.failed);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <ModalShell
            title={t.wiTitle}
            titleId="walk-in-title"
            onClose={onClose}
            closeLabel={t.close}
            footer={
                <>
                    <button type="button" onClick={onClose} className={`${outlineButton} h-11 px-6`}>
                        {t.cancel}
                    </button>
                    <button
                        type="submit"
                        form="walk-in-form"
                        disabled={submitting || !options}
                        className={`${tealButton} h-11 px-6`}
                    >
                        {submitting ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                        {submitting ? t.wiAdding : t.wiAdd}
                    </button>
                </>
            }
        >
            <form id="walk-in-form" noValidate onSubmit={handleSubmit} className="space-y-5">
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.wiHint}</p>

                <div>
                    <FieldLabel>{t.patientLabel}</FieldLabel>
                    <PatientPicker
                        locale={locale}
                        t={t}
                        value={patient}
                        onChange={setPatient}
                        onRegister={onRegisterPatient}
                    />
                </div>

                {optionsError && (
                    <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-500">
                        <p>{optionsError}</p>
                        <button
                            type="button"
                            onClick={() => void loadOptions()}
                            className="mt-2 font-semibold text-teal-600 underline dark:text-teal-400"
                        >
                            {t.retry}
                        </button>
                    </div>
                )}

                <div>
                    <FieldLabel htmlFor="wi-doctor">{t.wiDoctor}</FieldLabel>
                    <SelectBox
                        id="wi-doctor"
                        value={doctorId}
                        disabled={!options}
                        placeholder={options ? t.wiChooseDoctor : t.loading}
                        options={doctorSelectOptions}
                        onChange={setDoctorId}
                    />
                </div>

                <div>
                    <FieldLabel htmlFor="wi-reason">{t.qaReason}</FieldLabel>
                    <input
                        id="wi-reason"
                        value={reason}
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        className={baseInput}
                    />
                </div>

                <ErrorNote message={formError} />
            </form>
        </ModalShell>
    );
}

/* ------------------------------------------------------------------ */
/* Instant NPHIES eligibility                                         */
/* ------------------------------------------------------------------ */

export function EligibilityModal({
    locale,
    t,
    onClose,
    onChecked,
    onRegisterPatient,
}: {
    locale: Locale;
    t: Messages;
    onClose: () => void;
    onChecked: () => void;
    onRegisterPatient: () => void;
}) {
    const isRtl = locale === "ar";
    const [nationalId, setNationalId] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [notFound, setNotFound] = useState(false);
    const [result, setResult] = useState<EligibilityResultData | null>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setNotFound(false);
        setResult(null);

        const value = nationalId.trim();

        if (!/^[12]\d{9}$/.test(value)) {
            setError(t.elInvalidId);
            return;
        }

        setRunning(true);

        try {
            // Runs through nphies.checkEligibility (NPHIES_MODE adapter) and refreshes the feed.
            const response = await checkEligibilityByNationalIdAction(value);

            if (!response.success || !response.data) {
                setError(actionErrorMessage(t, response.code, response.error));
                setNotFound(response.code === "PATIENT_NOT_FOUND");
                return;
            }

            setResult(response.data);
            onChecked();
        } catch {
            setError(t.failed);
        } finally {
            setRunning(false);
        }
    }

    const tone =
        result === null
            ? ""
            : result.coverage === "ELIGIBLE"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : result.coverage === "INELIGIBLE" || result.coverage === "CASH"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400";

    const copayText = result?.copay
        ? [
            result.copay.type === "PERCENTAGE"
                ? fill(t.elCopayPercent, { value: result.copay.value })
                : fill(t.elCopayFixed, { value: result.copay.value }),
            result.copay.cap !== null ? fill(t.elCopayCap, { value: result.copay.cap }) : "",
        ]
            .filter(Boolean)
            .join(" · ")
        : t.none;

    const detailMessage = result
        ? result.messageCode === "NPHIES_ERROR"
            ? ((isRtl ? result.messageAr : result.messageEn) ?? t.codes.NPHIES_ERROR)
            : t.codes[result.messageCode]
        : "";

    const rows: Array<[string, string]> = result
        ? [
            [t.elPatient, isRtl ? result.patientNameAr : result.patientNameEn],
            [
                t.elPayer,
                (isRtl ? result.payerNameAr : result.payerNameEn) ?? t.coverageLabels.CASH,
            ],
            [t.elPolicy, result.policyName ?? t.none],
            [t.elCopay, copayText],
            [t.elReference, shortRef(result.referenceNumber)],
            [t.elLatency, `${result.latencyMs} ms`],
            [
                t.elMode,
                result.mode === "PRODUCTION" ? t.nphiesProduction : t.nphiesSimulator,
            ],
        ]
        : [];

    return (
        <ModalShell
            title={t.elTitle}
            titleId="eligibility-title"
            onClose={onClose}
            closeLabel={t.close}
            footer={
                <>
                    <button type="button" onClick={onClose} className={`${outlineButton} h-11 px-6`}>
                        {t.close}
                    </button>
                    <button
                        type="submit"
                        form="eligibility-form"
                        disabled={running}
                        className={`${tealButton} h-11 px-6`}
                    >
                        {running ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            <ShieldCheck className="h-4 w-4" />
                        )}
                        {running ? t.elRunning : t.elRun}
                    </button>
                </>
            }
        >
            <form id="eligibility-form" noValidate onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">{t.elHint}</p>

                <div>
                    <FieldLabel htmlFor="el-national-id">{t.elNationalId}</FieldLabel>
                    <input
                        id="el-national-id"
                        value={nationalId}
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={10}
                        autoComplete="off"
                        autoFocus
                        placeholder={t.elNationalIdPlaceholder}
                        onChange={(event) => setNationalId(event.target.value.replace(/\D/g, ""))}
                        className={`${baseInput} ${isRtl ? "text-end" : ""}`}
                    />
                </div>

                <ErrorNote message={error} />

                {notFound && (
                    <button
                        type="button"
                        onClick={onRegisterPatient}
                        className="text-sm font-semibold text-teal-600 underline dark:text-teal-400"
                    >
                        {t.registerInstead}
                    </button>
                )}
            </form>

            {result && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {t.elStatus}
                        </span>
                        <span className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tone}`}>
                            {t.nphiesStatus[result.status]} · {t.coverageLabels[result.coverage]}
                        </span>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300">{detailMessage}</p>

                    {result.cashFallbackRequired && (
                        <div
                            role="alert"
                            className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-400"
                        >
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{t.elCashFallback}</p>
                        </div>
                    )}

                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                        {rows.map(([label, value]) => (
                            <div key={label} className="min-w-0">
                                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                                <dd className="truncate font-semibold text-slate-900 dark:text-slate-100">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </ModalShell>
    );
}