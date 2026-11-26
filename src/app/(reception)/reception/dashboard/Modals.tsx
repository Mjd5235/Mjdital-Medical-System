"use client";

// ============================================================================
// app/(reception)/reception/dashboard/Modals.tsx
// Quick Appointment, Walk-in, Instant NPHIES Eligibility, Check-In & Payment Settlement,
// printable ZATCA Simplified Tax Invoice and brand-matched Confirmation modals, plus the shared
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
    Banknote,
    CalendarDays,
    CalendarX2,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    CreditCard,
    LoaderCircle,
    Printer,
    Receipt,
    Search,
    ShieldCheck,
    UserRound,
    UserX,
    X,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import {
    checkEligibilityByNationalIdAction,
    createAppointmentAction,
    createWalkInAction,
    getAvailableSlotsAction,
    getBookingOptionsAction,
    getCheckInQuoteAction,
    getInvoiceReceiptAction,
    searchPatientsAction,
    settleCheckInPaymentAction,
    type BookingOptionsData,
    type CheckInQuote,
    type EligibilityResultData,
    type PatientSearchRow,
    type PaymentMethod,
    type SettlementReceipt,
    type SlotOption,
} from "./actions";
import {
    actionErrorMessage,
    addDaysToDate,
    backdropMotion,
    baseInput,
    buildQrSvg,
    dangerButton,
    displayDoctor,
    fill,
    formatDateTimeSeconds,
    formatMoney,
    formatTime,
    messages,
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
    warnButton,
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
    maxWidth = "max-w-xl",
    busy = false,
}: {
    title: string;
    titleId: string;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
    closeLabel: string;
    maxWidth?: string;
    /** While busy (a mutation is running) the modal cannot be dismissed. */
    busy?: boolean;
}) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !busy) onClose();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose, busy]);

    return (
        <motion.div
            {...backdropMotion}
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/40 p-3 dark:bg-slate-950/80 sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onClose();
            }}
        >
            <motion.section
                {...panelMotion}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`my-auto w-full ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/60 dark:border-slate-700 dark:bg-slate-900`}
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
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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
/* Quick Appointment (Step 1: booking — zero payment)                 */
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

            // Booked in place (status Scheduled, no payment): the dashboard closes the modal,
            // toasts and refreshes the queue.
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
            busy={submitting}
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={submitting} className={`${outlineButton} h-11 px-6`}>
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
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.qaNoPaymentHint}</p>

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
/* Walk-in (creates a Scheduled visit, then opens the payment gate)   */
/* ------------------------------------------------------------------ */

export function WalkInModal({
    locale,
    t,
    onClose,
    onCreated,
    onRegisterPatient,
}: {
    locale: Locale;
    t: Messages;
    onClose: () => void;
    /** Called with the new (still Scheduled, unpaid) visit; the dashboard opens the settlement. */
    onCreated: (appointmentId: string) => void;
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

            if (!result.success || !result.data) {
                setFormError(actionErrorMessage(t, result.code, result.error));
                return;
            }

            // The visit is Scheduled and unpaid: hand over to the Check-In & Payment Settlement.
            onCreated(result.data.id);
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
            busy={submitting}
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={submitting} className={`${outlineButton} h-11 px-6`}>
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

/* ------------------------------------------------------------------ */
/* Check-In & Payment Settlement (Steps 2-4)                          */
/* ------------------------------------------------------------------ */

function StepCard({
    index,
    title,
    children,
}: {
    index: number;
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-bold text-white">
                    {index}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            </div>
            <div className="space-y-2 text-sm">{children}</div>
        </section>
    );
}

function AmountRow({
    label,
    value,
    muted = false,
    strong = false,
}: {
    label: ReactNode;
    value: ReactNode;
    muted?: boolean;
    strong?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt
                className={
                    muted
                        ? "text-slate-500 dark:text-slate-400"
                        : "text-slate-700 dark:text-slate-200"
                }
            >
                {label}
            </dt>
            <dd
                dir="ltr"
                className={`shrink-0 tabular-nums ${strong ? "font-extrabold text-slate-900 dark:text-white" : "font-semibold text-slate-900 dark:text-slate-100"
                    }`}
            >
                {value}
            </dd>
        </div>
    );
}

export function CheckInPaymentModal({
    locale,
    t,
    timezone,
    appointmentId,
    onClose,
    onSettled,
}: {
    locale: Locale;
    t: Messages;
    timezone: string;
    appointmentId: string;
    onClose: () => void;
    /** Called once the invoice is reported to ZATCA and the visit is Waiting. */
    onSettled: (receipt: SettlementReceipt) => void;
}) {
    const isRtl = locale === "ar";
    const [quote, setQuote] = useState<CheckInQuote | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [method, setMethod] = useState<PaymentMethod>("CASH");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const submittingRef = useRef(false);

    const loadQuote = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            // Fetches the doctor's fee, verifies insurance through @/lib/nphies + the center
            // contract, calculates ZATCA VAT and checks the ZATCA certificate. The visit stays
            // Scheduled.
            const result = await getCheckInQuoteAction(appointmentId);

            if (result.success && result.data) {
                setQuote(result.data);
            } else {
                setQuote(null);
                setLoadError(actionErrorMessage(t, result.code, result.error));
            }
        } catch {
            setQuote(null);
            setLoadError(t.failed);
        } finally {
            setLoading(false);
        }
    }, [appointmentId, t]);

    useEffect(() => {
        void loadQuote();
    }, [loadQuote]);

    async function handleConfirm() {
        if (!quote || submittingRef.current) return;

        submittingRef.current = true;
        setSubmitting(true);
        setFormError("");

        try {
            const result = await settleCheckInPaymentAction({
                appointmentId,
                paymentMethod: method,
                expectedTotalDue: quote.totalDue,
            });

            if (!result.success || !result.data) {
                setFormError(actionErrorMessage(t, result.code, result.error));

                // The amount changed server-side: show the fresh calculation before retrying.
                if (result.code === "PRICE_CHANGED") await loadQuote();

                return;
            }

            onSettled(result.data);
        } catch {
            setFormError(t.failed);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }

    const money = (value: number): ReactNode => (
        <span dir="ltr">
            {formatMoney(value, locale)} {t.ckCurrency}
        </span>
    );

    const conversionText = quote?.conversionCode
        ? quote.conversionCode === "NPHIES_ERROR"
            ? ((isRtl ? quote.conversionMessageAr : quote.conversionMessageEn) ?? t.codes.NPHIES_ERROR)
            : t.codes[quote.conversionCode]
        : "";

    const copayText = quote?.copay
        ? [
            quote.copay.type === "PERCENTAGE"
                ? fill(t.elCopayPercent, { value: quote.copay.value })
                : fill(t.elCopayFixed, { value: quote.copay.value }),
            quote.copay.cap !== null ? fill(t.elCopayCap, { value: quote.copay.cap }) : "",
        ]
            .filter(Boolean)
            .join(" · ")
        : t.none;

    const methods: Array<{ key: PaymentMethod; label: string; icon: typeof Banknote }> = [
        { key: "CASH", label: t.ckCash, icon: Banknote },
        { key: "MADA", label: t.ckMada, icon: CreditCard },
    ];

    return (
        <ModalShell
            title={t.ckTitle}
            titleId="check-in-payment-title"
            onClose={onClose}
            closeLabel={t.close}
            maxWidth="max-w-2xl"
            busy={submitting}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className={`${outlineButton} h-11 px-6`}
                    >
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={submitting || loading || !quote}
                        className={`${tealButton} h-11 px-6`}
                    >
                        {submitting ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            <Receipt className="h-4 w-4" />
                        )}
                        {submitting ? t.ckConfirming : t.ckConfirm}
                    </button>
                </>
            }
        >
            <p className="text-sm text-slate-600 dark:text-slate-300">{t.ckHint}</p>

            {loading && (
                <div aria-busy className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-teal-600 dark:text-teal-400">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        {t.ckLoading}
                    </p>
                    {Array.from({ length: 3 }, (_, index) => (
                        <div
                            key={index}
                            className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
                        />
                    ))}
                </div>
            )}

            {!loading && loadError && (
                <div className="space-y-3">
                    <ErrorNote message={loadError} />
                    <button
                        type="button"
                        onClick={() => void loadQuote()}
                        className="text-sm font-semibold text-teal-600 underline dark:text-teal-400"
                    >
                        {t.retry}
                    </button>
                </div>
            )}

            {!loading && quote && (
                <>
                    {/* ZATCA certificate pre-flight warning (the server enforces it on confirm) */}
                    {!quote.zatcaReady && (
                        <div
                            role="alert"
                            className="flex items-start gap-3 rounded-lg border-2 border-rose-500/50 bg-rose-500/10 p-3.5 text-rose-700 dark:text-rose-300"
                        >
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                            <p className="text-sm font-bold">{t.codes.ZATCA_CERT_MISSING}</p>
                        </div>
                    )}

                    {/* Patient & visit summary */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-500/30 bg-teal-600/10 px-4 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-base font-bold text-slate-900 dark:text-white">
                                {isRtl ? quote.patientNameAr : quote.patientNameEn}
                            </p>
                            <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                                <span dir="ltr">{quote.fileNumber}</span> ·{" "}
                                <span dir="ltr">{quote.nationalIdMasked}</span> ·{" "}
                                {quote.isSaudi ? t.ckIdNational : t.ckIdIqama}
                            </p>
                        </div>
                        <div className="min-w-0 text-end">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {displayDoctor(isRtl ? quote.doctorNameAr : quote.doctorNameEn, locale)}
                            </p>
                            <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                                {isRtl ? quote.clinicNameAr : quote.clinicNameEn} ·{" "}
                                <span dir="ltr">{formatTime(quote.scheduledAt, timezone, locale)}</span>
                            </p>
                        </div>
                    </div>

                    {/* Step 1 — consultation fee */}
                    <StepCard index={1} title={t.ckStepFee}>
                        <dl>
                            <AmountRow label={t.ckConsultationFee} value={money(quote.consultationFee)} strong />
                        </dl>
                    </StepCard>

                    {/* Step 2 — insurance & NPHIES coverage */}
                    <StepCard index={2} title={t.ckStepCoverage}>
                        {quote.insuranceConverted && (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3.5 text-amber-800 dark:text-amber-300"
                            >
                                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-extrabold">{t.ckConverted}</p>
                                    {conversionText && (
                                        <p className="text-xs font-medium opacity-90">{conversionText}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {quote.billingMode === "CASH" && !quote.insuranceConverted && (
                            <p className="font-medium text-slate-700 dark:text-slate-200">{t.ckCashPatient}</p>
                        )}

                        {quote.billingMode === "INSURED" && (
                            <>
                                <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    {t.ckInsuredEligible}
                                </p>
                                <dl className="space-y-1.5">
                                    <AmountRow
                                        muted
                                        label={t.ckPayer}
                                        value={
                                            <span dir="auto">
                                                {(isRtl ? quote.payerNameAr : quote.payerNameEn) ?? t.none}
                                            </span>
                                        }
                                    />
                                    <AmountRow muted label={t.elPolicy} value={<span dir="auto">{quote.policyName ?? t.none}</span>} />
                                    {quote.policyNumber && (
                                        <AmountRow muted label={t.invPolicy} value={quote.policyNumber} />
                                    )}
                                    <AmountRow muted label={t.elCopay} value={<span dir="auto">{copayText}</span>} />
                                    {quote.nphiesReference && (
                                        <AmountRow
                                            muted
                                            label={t.ckNphiesRef}
                                            value={shortRef(quote.nphiesReference)}
                                        />
                                    )}
                                    <AmountRow label={t.ckInsuranceShare} value={money(quote.insuranceShare)} />
                                    <AmountRow label={t.ckPatientShare} value={money(quote.patientShare)} />
                                </dl>
                            </>
                        )}
                    </StepCard>

                    {/* Step 3 — ZATCA VAT */}
                    <StepCard index={3} title={t.ckStepVat}>
                        <p className="font-medium text-slate-700 dark:text-slate-200">
                            {quote.isSaudi ? t.ckVatExempt : t.ckVatApplied}
                        </p>
                        <dl>
                            <AmountRow
                                muted
                                label={fill(t.ckVatLine, { rate: quote.vatRate })}
                                value={money(quote.vatAmount)}
                            />
                        </dl>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {fill(t.ckZatcaEnv, { env: quote.zatcaEnvironment })}
                        </p>
                    </StepCard>

                    {/* Step 4 — amount due + payment method */}
                    <section
                        aria-label={t.ckStepPay}
                        className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent p-5"
                    >
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                            {t.ckAmountDue}
                        </p>
                        <p
                            dir="ltr"
                            className={`mt-1 text-4xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 ${isRtl ? "text-end" : ""
                                }`}
                        >
                            {formatMoney(quote.totalDue, locale)}{" "}
                            <span className="text-xl font-bold">{t.ckCurrency}</span>
                        </p>

                        <dl className="mt-4 space-y-1.5 border-t border-emerald-500/20 pt-3">
                            <AmountRow muted label={t.ckConsultationFee} value={money(quote.consultationFee)} />
                            <AmountRow muted label={t.ckInsuranceShare} value={money(quote.insuranceShare)} />
                            <AmountRow muted label={t.ckPatientShare} value={money(quote.patientShare)} />
                            <AmountRow
                                muted
                                label={fill(t.ckVatLine, { rate: quote.vatRate })}
                                value={money(quote.vatAmount)}
                            />
                            <AmountRow strong label={t.ckTotal} value={money(quote.totalDue)} />
                        </dl>

                        {quote.totalDue === 0 && (
                            <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                {t.ckNoPaymentDue}
                            </p>
                        )}
                    </section>

                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {t.ckPayMethod}
                        </legend>
                        <div className="grid grid-cols-2 gap-3">
                            {methods.map((entry) => {
                                const active = method === entry.key;
                                const MethodIcon = entry.icon;

                                return (
                                    <button
                                        key={entry.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        disabled={submitting}
                                        onClick={() => setMethod(entry.key)}
                                        className={`flex h-14 items-center justify-center gap-2.5 rounded-xl border-2 text-sm font-bold transition-colors duration-150 disabled:opacity-50 ${active
                                            ? "border-teal-500 bg-teal-600/10 text-teal-700 dark:text-teal-300"
                                            : "border-slate-200 text-slate-700 hover:border-teal-500/60 dark:border-slate-700 dark:text-slate-200"
                                            }`}
                                    >
                                        <MethodIcon className="h-5 w-5" />
                                        {entry.label}
                                        {active && <Check className="h-4 w-4 text-teal-500" aria-hidden />}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.ckStaysScheduled}</p>
                </>
            )}

            <ErrorNote message={formError} />
        </ModalShell>
    );
}

/* ------------------------------------------------------------------ */
/* ZATCA Simplified Tax Invoice (printable receipt)                   */
/* ------------------------------------------------------------------ */

type InvoiceLabelKey =
    | "invoiceNo"
    | "date"
    | "patientVisit"
    | "name"
    | "mrn"
    | "id"
    | "doctor"
    | "insurance"
    | "payer"
    | "policy"
    | "copay"
    | "method"
    | "code"
    | "description"
    | "price"
    | "insShare"
    | "patient"
    | "vat"
    | "total"
    | "gross"
    | "insCovered"
    | "taxable"
    | "vatRow"
    | "netPayable"
    | "scan"
    | "customerCare"
    | "saudiPill"
    | "nonSaudiPill";

/** Short receipt labels (kept local to the receipt so the shared message catalogue is untouched). */
const INVOICE_LABELS: Record<Locale, Record<InvoiceLabelKey, string>> = {
    en: {
        invoiceNo: "Invoice #",
        date: "Date",
        patientVisit: "Patient & Visit",
        name: "Name",
        mrn: "MRN",
        id: "ID",
        doctor: "Doctor",
        insurance: "Insurance Coverage",
        payer: "Payer",
        policy: "Policy #",
        copay: "Co-pay",
        method: "Payment Method",
        code: "Code",
        description: "Description",
        price: "Price",
        insShare: "Ins. Share",
        patient: "Patient",
        vat: "VAT",
        total: "Total",
        gross: "Gross Total",
        insCovered: "Insurance Covered",
        taxable: "Taxable Amount",
        vatRow: "VAT {rate}%",
        netPayable: "Net Payable by Patient",
        scan: "Scan with ZATCA Fatoora App",
        customerCare: "Customer Care",
        saudiPill: "Saudi • 0% VAT Exempt",
        nonSaudiPill: "Non-Saudi • {rate}% VAT",
    },
    ar: {
        invoiceNo: "رقم الفاتورة",
        date: "التاريخ",
        patientVisit: "المريض والزيارة",
        name: "الاسم",
        mrn: "رقم الملف",
        id: "الهوية",
        doctor: "الطبيب",
        insurance: "التأمين",
        payer: "شركة التأمين",
        policy: "رقم الوثيقة",
        copay: "نسبة التحمّل",
        method: "طريقة الدفع",
        code: "الرمز",
        description: "الوصف",
        price: "السعر",
        insShare: "حصة التأمين",
        patient: "المريض",
        vat: "الضريبة",
        total: "الإجمالي",
        gross: "الإجمالي قبل التأمين",
        insCovered: "المغطى من التأمين",
        taxable: "المبلغ الخاضع للضريبة",
        vatRow: "ضريبة {rate}%",
        netPayable: "الصافي المستحق",
        scan: "امسح الرمز بتطبيق «فاتورة»",
        customerCare: "خدمة العملاء",
        saudiPill: "سعودي • معفى من الضريبة 0%",
        nonSaudiPill: "غير سعودي • ضريبة {rate}%",
    },
};

const INVOICE_PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  body > *:not(#zatca-print-portal) { display: none !important; }
  #zatca-print-portal { position: static !important; display: block !important; overflow: visible !important; height: auto !important; background: #fff !important; padding: 0 !important; }
  #zatca-print-portal .no-print { display: none !important; }
  #zatca-print-portal .print-frame { max-width: none !important; width: 100% !important; margin: 0 !important; }
  #zatca-print-portal .print-sheet { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; overflow: visible !important; }
  #zatca-print-portal .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
  #zatca-print-portal .print-qr { width: 3.8cm !important; height: 3.8cm !important; }
  #zatca-print-portal * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

function MedicalCross({ className = "" }: { className?: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 48 48"
            className={className}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M18 4h12a2 2 0 0 1 2 2v10h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H32v10a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V32H6a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2h10V6a2 2 0 0 1 2-2Z"
                fill="#14b8a6"
            />
        </svg>
    );
}

function QrCodeSvg({ payload, label }: { payload: string; label: string }) {
    const qr = useMemo(() => buildQrSvg(payload), [payload]);

    if (!qr) return null;

    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            shapeRendering="crispEdges"
            className="print-qr mx-auto h-32 w-32 bg-white sm:h-36 sm:w-36"
        >
            <rect width={qr.size} height={qr.size} fill="#ffffff" />
            <path d={qr.path} fill="#000000" />
        </svg>
    );
}

function InvoiceInfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline gap-x-2 text-[15px] leading-snug">
            <span className="shrink-0 text-slate-500">{label}:</span>
            <span className="min-w-0 flex-1 font-medium text-slate-900">{children}</span>
        </div>
    );
}

export function InvoiceReceiptModal({
    locale,
    t,
    timezone,
    receipt: initialReceipt,
    invoiceId,
    onClose,
}: {
    locale: Locale;
    t: Messages;
    timezone: string;
    /** Receipt returned by the settlement; when null it is loaded by `invoiceId`. */
    receipt: SettlementReceipt | null;
    invoiceId: string | null;
    onClose: () => void;
}) {
    const isRtl = locale === "ar";
    const [receipt, setReceipt] = useState<SettlementReceipt | null>(initialReceipt);
    const [loading, setLoading] = useState(initialReceipt === null && invoiceId !== null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (initialReceipt !== null || invoiceId === null) return;

        let cancelled = false;

        setLoading(true);
        setError("");

        getInvoiceReceiptAction(invoiceId)
            .then((result) => {
                if (cancelled) return;

                if (result.success && result.data) setReceipt(result.data);
                else setError(actionErrorMessage(t, result.code, result.error));
            })
            .catch(() => {
                if (!cancelled) setError(t.failed);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [initialReceipt, invoiceId, t]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const primary = messages[locale];
    const secondary = messages[isRtl ? "en" : "ar"];
    const L = INVOICE_LABELS[locale];
    const LS = INVOICE_LABELS[isRtl ? "en" : "ar"];

    /** Bilingual heading: current language first, then the other language (`EN / AR`). */
    const biTitle = (key: InvoiceLabelKey): string => `${L[key]} / ${LS[key]}`;

    const fmt = (value: number): string => `${formatMoney(value, locale)} SAR`;

    const content = (() => {
        if (loading) {
            return (
                <div className="flex items-center justify-center gap-3 rounded-2xl bg-white p-12 text-sm font-medium text-slate-700">
                    <LoaderCircle className="h-5 w-5 animate-spin text-teal-600" />
                    {t.invLoading}
                </div>
            );
        }

        if (!receipt) {
            return (
                <div role="alert" className="rounded-2xl bg-white p-8 text-center text-sm font-medium text-rose-600">
                    {error || t.failed}
                </div>
            );
        }

        const issued = formatDateTimeSeconds(receipt.issuedAt, timezone, locale);
        const reported = receipt.zatcaStatus === "REPORTED" || receipt.zatcaStatus === "CLEARED";
        const uuidShort = `${receipt.invoiceUuid.slice(0, 8)}…${receipt.invoiceUuid.slice(-4)}`;
        const doctor = displayDoctor(isRtl ? receipt.doctorNameAr : receipt.doctorNameEn, locale);
        const insured = receipt.billingMode === "INSURED";
        const copayText = receipt.copay
            ? receipt.copay.type === "PERCENTAGE"
                ? `${receipt.copay.value}%`
                : `${formatMoney(receipt.copay.value, locale)} SAR`
            : t.none;
        const vatRate = receipt.vatExempt ? 0 : receipt.vatRate;
        const nationalityPill = receipt.isSaudi
            ? L.saudiPill
            : fill(L.nonSaudiPill, { rate: receipt.vatRate });
        const methodText =
            receipt.paymentMethod === "CASH"
                ? isRtl
                    ? `${messages.ar.ckCash} / Cash`
                    : `Cash / ${messages.ar.ckCash}`
                : isRtl
                    ? `${messages.ar.ckMada} / Mada`
                    : `Mada / ${messages.ar.ckMada}`;
        const addresses = Array.from(
            new Set(
                (isRtl
                    ? [receipt.sellerAddressAr, receipt.sellerAddressEn]
                    : [receipt.sellerAddressEn, receipt.sellerAddressAr]
                ).filter((line): line is string => typeof line === "string" && line.trim() !== ""),
            ),
        );
        const itemNames = isRtl
            ? [
                { text: receipt.itemNameAr, dir: "rtl" as const },
                { text: receipt.itemNameEn, dir: "ltr" as const },
            ]
            : [
                { text: receipt.itemNameEn, dir: "ltr" as const },
                { text: receipt.itemNameAr, dir: "rtl" as const },
            ];
        const insuranceShareText =
            receipt.insuranceShare > 0 ? `-${fmt(receipt.insuranceShare)}` : fmt(0);

        const summaryRows: Array<{ label: string; value: string }> = [
            { label: L.gross, value: fmt(receipt.consultationFee) },
            { label: L.insCovered, value: insuranceShareText },
            { label: L.taxable, value: fmt(receipt.patientShare) },
            { label: fill(L.vatRow, { rate: vatRate }), value: fmt(receipt.vatAmount) },
        ];

        const cell = "px-3 py-4 align-top text-[13px] leading-snug text-slate-900";
        const head =
            "px-3 py-3 text-start text-[13px] font-semibold text-slate-800 first:rounded-s-lg last:rounded-e-lg";

        return (
            <article
                dir={isRtl ? "rtl" : "ltr"}
                lang={locale}
                className="print-sheet overflow-hidden rounded-3xl border border-white/10 bg-white text-slate-900 shadow-2xl shadow-black/50"
            >
                {/* 1. Dark navy header banner */}
                <header className="border-b-4 border-teal-500 bg-gradient-to-br from-[#0b1d33] via-[#0d2340] to-[#0b1d33] px-6 pb-7 pt-8 text-white sm:px-10">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-4">
                            {receipt.sellerLogoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={receipt.sellerLogoUrl}
                                    alt=""
                                    className="h-12 w-12 shrink-0 rounded-lg bg-white/5 object-contain"
                                />
                            ) : (
                                <MedicalCross className="h-12 w-12 shrink-0" />
                            )}
                            <div className="min-w-0 space-y-0.5">
                                <p dir="ltr" className="text-xl font-semibold leading-tight">
                                    <span dir="rtl">{receipt.sellerNameAr}</span>
                                    <span className="mx-1.5 text-white/70">/</span>
                                    <span dir="ltr">{receipt.sellerNameEn}</span>
                                </p>
                                {addresses.map((line, index) => (
                                    <p key={index} dir="auto" className="text-sm text-slate-300">
                                        {line}
                                    </p>
                                ))}
                                <p className="text-sm text-slate-300">
                                    {L.vat === "VAT" ? "VAT Reg #" : primary.invVatNo}:{" "}
                                    <span dir="ltr">{receipt.sellerVatNumber}</span>
                                    {receipt.sellerCrNumber && (
                                        <>
                                            <span className="mx-2 text-slate-500">•</span>
                                            {primary.invCrNo}: <span dir="ltr">{receipt.sellerCrNumber}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {receipt.zatcaEnvironment === "SIMULATION" && (
                                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-300/40">
                                    {primary.invSimulation} / {secondary.invSimulation}
                                </span>
                            )}
                            <span
                                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${reported
                                    ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
                                    : "bg-amber-400/15 text-amber-100 ring-amber-300/40"
                                    }`}
                            >
                                <span
                                    className={`grid h-5 w-5 place-items-center rounded-full text-white ${reported ? "bg-emerald-500" : "bg-amber-500"
                                        }`}
                                >
                                    {reported ? (
                                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                                    ) : (
                                        <LoaderCircle className="h-3 w-3" aria-hidden />
                                    )}
                                </span>
                                {reported ? primary.invReported : primary.invPending}
                            </span>
                        </div>
                    </div>

                    <h2 className="mt-6 text-center">
                        <span dir="rtl" className="block text-3xl font-extrabold leading-tight sm:text-4xl">
                            {messages.ar.invTitle} /
                        </span>
                        <span dir="ltr" className="mt-2 block text-xl font-medium text-white/95 sm:text-2xl">
                            {messages.en.invTitle}
                        </span>
                    </h2>
                </header>

                {/* 2. Invoice metadata strip */}
                <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-slate-200 bg-slate-50 px-6 py-4 text-[15px] sm:px-10">
                    <p>
                        <span className="text-slate-500">{L.invoiceNo}:</span>{" "}
                        <span dir="ltr" className="font-semibold text-slate-900">
                            {receipt.invoiceNumber}
                        </span>
                    </p>
                    <p>
                        <span className="text-slate-500">{L.date}:</span>{" "}
                        <span dir="ltr" className="font-semibold text-slate-900">
                            {issued}
                        </span>
                    </p>
                </section>

                <div className="space-y-6 px-6 py-6 sm:px-10">
                    {/* 3. Patient & visit + insurance cards */}
                    <section className="print-avoid-break grid gap-5 sm:grid-cols-2">
                        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/90 p-5">
                            <h3 className="mb-3 text-base font-semibold text-slate-900">
                                {biTitle("patientVisit")}
                            </h3>
                            <InvoiceInfoRow label={L.name}>
                                {isRtl ? receipt.patientNameAr : receipt.patientNameEn}
                            </InvoiceInfoRow>
                            <InvoiceInfoRow label={L.mrn}>
                                <span dir="ltr">{receipt.fileNumber}</span>
                            </InvoiceInfoRow>
                            <InvoiceInfoRow label={L.id}>
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span dir="ltr">{receipt.nationalIdMasked}</span>
                                    <span className="rounded-md bg-slate-200/70 px-2.5 py-1 text-xs font-medium text-slate-700">
                                        {nationalityPill}
                                    </span>
                                </span>
                            </InvoiceInfoRow>
                            <InvoiceInfoRow label={L.doctor}>
                                {doctor} <span className="mx-1 text-slate-500">•</span>{" "}
                                {isRtl ? receipt.clinicNameAr : receipt.clinicNameEn}
                            </InvoiceInfoRow>
                        </div>

                        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/90 p-5">
                            <h3 className="mb-3 text-base font-semibold text-slate-900">
                                {biTitle("insurance")}
                            </h3>
                            {insured ? (
                                <>
                                    <InvoiceInfoRow label={L.payer}>
                                        {(isRtl ? receipt.payerNameAr : receipt.payerNameEn) ?? t.none}
                                    </InvoiceInfoRow>
                                    <InvoiceInfoRow label={L.policy}>
                                        <span dir="ltr">{receipt.policyNumber ?? t.none}</span>
                                    </InvoiceInfoRow>
                                    <InvoiceInfoRow label={L.copay}>
                                        <span dir="ltr">{copayText}</span>
                                    </InvoiceInfoRow>
                                </>
                            ) : (
                                <p className="text-[15px] font-medium text-slate-700">
                                    {receipt.insuranceConverted ? primary.invConverted : primary.invCash}
                                </p>
                            )}
                            <div className={insured ? "pt-1" : ""}>
                                <InvoiceInfoRow label={L.method}>{methodText}</InvoiceInfoRow>
                            </div>
                        </div>
                    </section>

                    {/* 4. Line items */}
                    <section className="print-avoid-break overflow-x-auto">
                        <table className="w-full min-w-[560px] border-collapse">
                            <thead className="bg-slate-100/80">
                                <tr>
                                    <th className={head}>{L.code}</th>
                                    <th className={head}>{L.description}</th>
                                    <th className={head}>{L.price}</th>
                                    <th className={head}>{L.insShare}</th>
                                    <th className={head}>{L.patient}</th>
                                    <th className={head}>{L.vat}</th>
                                    <th className={head}>{L.total}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-slate-200">
                                    <td dir="ltr" className={`${cell} text-start font-medium`}>
                                        {receipt.itemCode}
                                    </td>
                                    <td className={cell}>
                                        {itemNames.map((name, index) => (
                                            <span key={index} dir={name.dir} className="block">
                                                {name.text}
                                            </span>
                                        ))}
                                    </td>
                                    <td dir="ltr" className={`${cell} text-start tabular-nums`}>
                                        {fmt(receipt.consultationFee)}
                                    </td>
                                    <td dir="ltr" className={`${cell} text-start tabular-nums`}>
                                        {insuranceShareText}
                                    </td>
                                    <td dir="ltr" className={`${cell} text-start tabular-nums`}>
                                        {fmt(receipt.patientShare)}
                                    </td>
                                    <td dir="ltr" className={`${cell} text-start tabular-nums`}>
                                        {fmt(receipt.vatAmount)}
                                    </td>
                                    <td dir="ltr" className={`${cell} text-start font-semibold tabular-nums`}>
                                        {fmt(receipt.totalPaid)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {/* 5. QR + financial summary */}
                    <section className="print-avoid-break grid items-start gap-6 sm:grid-cols-[2fr_3fr]">
                        <div className="rounded-2xl bg-slate-50/80 px-4 py-6 text-center">
                            <div className="mx-auto inline-block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <QrCodeSvg payload={receipt.qrPayload} label={primary.invQrLabel} />
                            </div>
                            <p className="mt-3 text-[15px] text-slate-700">{L.scan}</p>
                            {receipt.claimReference && (
                                <p className="mt-1 text-xs text-slate-500">
                                    {primary.invClaim}: <span dir="ltr">{receipt.claimReference}</span>
                                </p>
                            )}
                        </div>

                        <div>
                            <div className="space-y-3 border-t border-slate-200 pb-4 pt-4">
                                {summaryRows.map((row, index) => (
                                    <div
                                        key={index}
                                        className="flex items-start justify-between gap-3 text-[15px] text-slate-800"
                                    >
                                        <span>{row.label}:</span>
                                        <span dir="ltr" className="shrink-0 font-medium tabular-nums">
                                            {row.value}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal-100 bg-teal-50 px-5 py-4">
                                <p className="min-w-0 text-[15px] font-medium leading-snug text-slate-900">
                                    <span className="block">{L.netPayable} /</span>
                                    <span className="block">{LS.netPayable}:</span>
                                </p>
                                <span
                                    dir="ltr"
                                    className="shrink-0 text-2xl font-bold tabular-nums text-slate-900"
                                >
                                    {fmt(receipt.totalPaid)}
                                </span>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 6. Footer */}
                <footer className="print-avoid-break space-y-1.5 px-6 pb-8 pt-4 text-center sm:px-10">
                    <p dir="rtl" className="text-[15px] text-slate-800">
                        {messages.ar.invThanks}
                    </p>
                    {receipt.sellerPhone && (
                        <p className="text-sm text-slate-700">
                            {L.customerCare}: <span dir="ltr">{receipt.sellerPhone}</span>
                        </p>
                    )}
                    <p dir="ltr" title={receipt.invoiceUuid} className="pt-1 font-mono text-[10px] text-slate-400">
                        UUID {uuidShort}
                    </p>
                </footer>
            </article>
        );
    })();

    return createPortal(
        <div
            id="zatca-print-portal"
            dir={isRtl ? "rtl" : "ltr"}
            className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/90 p-3 sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <style>{INVOICE_PRINT_CSS}</style>
            <div className="print-frame my-auto w-full max-w-3xl">
                <div className="no-print mb-4 flex items-center justify-center gap-3 print:hidden">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        disabled={!receipt}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-500 px-6 text-base font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Printer className="h-5 w-5" />
                        {t.ckPrint}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 text-base font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                    >
                        <X className="h-5 w-5" />
                        {t.close}
                    </button>
                </div>
                {content}
            </div>
        </div>,
        document.body,
    );
}

/* ------------------------------------------------------------------ */
/* Confirmation modal (cancel appointment / mark no-show)             */
/* ------------------------------------------------------------------ */

export function ConfirmActionModal({
    t,
    tone,
    title,
    description,
    rows,
    confirmLabel,
    loading,
    error,
    onConfirm,
    onClose,
}: {
    locale: Locale;
    t: Messages;
    tone: "danger" | "warn";
    title: string;
    description: string;
    rows: Array<{ label: string; value: string }>;
    confirmLabel: string;
    loading: boolean;
    error: string;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const Icon = tone === "danger" ? CalendarX2 : UserX;
    const iconTone =
        tone === "danger"
            ? "bg-rose-500/10 text-rose-500 ring-rose-500/30"
            : "bg-amber-500/10 text-amber-500 ring-amber-500/30";

    return (
        <ModalShell
            title={title}
            titleId="confirm-action-title"
            onClose={onClose}
            closeLabel={t.close}
            maxWidth="max-w-md"
            busy={loading}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className={`${outlineButton} h-11 px-6`}
                    >
                        {t.cfBack}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`${tone === "danger" ? dangerButton : warnButton} h-11 px-6`}
                    >
                        {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                        {loading ? t.cfWorking : confirmLabel}
                    </button>
                </>
            }
        >
            <div className="flex items-start gap-4">
                <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ring-1 ${iconTone}`}
                >
                    <Icon className="h-6 w-6" />
                </span>
                <p className="pt-1 text-sm text-slate-600 dark:text-slate-300">{description}</p>
            </div>

            <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/60 px-4 dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-950/40">
                {rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                        <dt className="text-slate-500 dark:text-slate-400">{row.label}</dt>
                        <dd className="min-w-0 truncate text-end font-semibold text-slate-900 dark:text-slate-100">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>

            <ErrorNote message={error} />
        </ModalShell>
    );
}