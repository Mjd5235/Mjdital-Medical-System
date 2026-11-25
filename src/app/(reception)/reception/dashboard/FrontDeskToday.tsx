"use client";

// ============================================================================
// app/(reception)/reception/dashboard/FrontDeskToday.tsx
//
// Assumed props of the existing portal chrome (same pattern as the Admin ones):
//   <ReceptionSidebar locale activeHref open onClose />
//   <ReceptionHeader  locale onMenuOpen />
//
// Appointment lifecycle on this page:
//   1. Booking   - "+ Quick Appointment" books a SCHEDULED visit (no payment).
//   2. Check-In  - the Check-In button (and every Walk-in) opens the Check-In & Payment
//                  Settlement modal: doctor fee -> NPHIES / contract coverage -> ZATCA VAT.
//                  Closing the modal without paying leaves the visit SCHEDULED.
//   3. Settle    - "Confirm Payment & Issue ZATCA" runs one atomic server transaction
//                  (invoice + pending NPHIES claim + SCHEDULED -> WAITING).
//   4. Waiting   - the visit appears in the live queue / doctor's queue; the modal closes, the
//                  queue and KPIs refresh and a toast offers to print the receipt.
//   Cancel / No-show use a brand-matched confirmation modal (no native confirm()).
//
// Appointment entry points (two separate flows):
//   * Sidebar "Appointments" button  -> navigates to /reception/appointments
//     (or /reception/appointments?new=true). That link lives in ReceptionSidebar and is not
//     touched here.
//   * "+ Quick Appointment" button in this page's header -> opens the in-page
//     QuickAppointmentModal, books through createAppointmentAction and refreshes the queue
//     without leaving the dashboard (no router navigation involved).
//
// Real-time strategy:
//   * Supabase Realtime (postgres_changes on appointments / nphies_transactions /
//     invoices, filtered by organization_id) is used purely as a "something changed"
//     signal. Each signal triggers a debounced re-read through the server action, so
//     tenant scoping always stays on the server.
//     (Tables must be in the `supabase_realtime` publication.)
//   * Fallback: polling every 15s (every 60s as a safety net while realtime is up),
//     plus an immediate refresh on tab focus / visibility.
// ============================================================================

import {
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
    Activity,
    Building2,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    FileText,
    Footprints,
    Info,
    LoaderCircle,
    MoreHorizontal,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    UserPlus,
    X,
} from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import type { Locale } from "@/lib/i18n/types";
import ReceptionSidebar from "@/components/ReceptionSidebar/Sidebar";
import ReceptionHeader from "@/components/ReceptionHeader/Header";
import {
    getFrontDeskSnapshotAction,
    updateAppointmentStatusAction,
    verifyAppointmentNphiesAction,
    type CoverageState,
    type FrontDeskSnapshot,
    type NphiesFeedItem,
    type QueueItem,
    type SettlementReceipt,
} from "./actions";
import {
    CheckInPaymentModal,
    ConfirmActionModal,
    EligibilityModal,
    QuickAppointmentModal,
    SelectBox,
    WalkInModal,
    type SelectOption,
} from "./Modals";
import {
    actionErrorMessage,
    baseInput,
    cardSurface,
    displayDoctor,
    fill,
    formatLongDate,
    formatTime,
    messages,
    outlineButton,
    printReceipt,
    relativeTime,
    shortRef,
    tealButton,
    type Messages,
} from "./FrontDeskShared";

const PAGE_SIZE = 8;
const FRONT_DESK_HREF = "/reception";
const POLL_MS = 15_000;
const REALTIME_SAFETY_TICKS = 4;
const TOAST_MS = 6000;
const TOAST_ACTION_MS = 14_000;
const MAX_TOASTS = 3;
const CLINIC_ALL = "ALL";

type QueueTab = "ALL" | "SCHEDULED" | "WAITING" | "IN_CLINIC" | "COMPLETED";
type LiveMode = "connecting" | "realtime" | "polling";
type ToastKind = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; kind: ToastKind; message: string; action?: ToastAction };
type ModalName = "quick" | "walkin" | "eligibility" | null;
type ConfirmableStatus = "CANCELLED" | "NO_SHOW";
type ConfirmTarget = { item: QueueItem; next: ConfirmableStatus };
type PrimaryAction =
    | "CHECK_IN"
    | "VERIFY"
    | "CREATE_INVOICE"
    | "VIEW_INVOICE"
    | "CHECKED_IN"
    | null;
type MenuItem = {
    key: string;
    label: string;
    tone: "default" | "warn" | "danger";
    onSelect: () => void;
};

type FeedStatus = NphiesFeedItem["status"];

/* ------------------------------------------------------------------ */
/* Pure helpers                                                       */
/* ------------------------------------------------------------------ */

function tabOf(status: AppointmentStatus): Exclude<QueueTab, "ALL"> | null {
    switch (status) {
        case "SCHEDULED":
        case "CONFIRMED":
            return "SCHEDULED";
        case "WAITING":
            return "WAITING";
        case "IN_PROGRESS":
            return "IN_CLINIC";
        case "COMPLETED":
            return "COMPLETED";
        default:
            return null;
    }
}

function primaryActionOf(item: QueueItem): PrimaryAction {
    const state = item.coverage.state;
    const needsVerify =
        state === "NOT_VERIFIED" || state === "PRE_AUTH_PENDING" || state === "INELIGIBLE";

    switch (item.status) {
        case "COMPLETED":
        case "IN_PROGRESS":
            return item.invoiceId ? "VIEW_INVOICE" : "CREATE_INVOICE";
        case "SCHEDULED":
        case "CONFIRMED":
            // The Check-In & Payment Settlement verifies coverage itself, so Check-In is always
            // the primary action for a visit that is waiting to be settled.
            return "CHECK_IN";
        case "WAITING":
            return needsVerify ? "VERIFY" : "CHECKED_IN";
        default:
            return null;
    }
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
    SCHEDULED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    CONFIRMED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    WAITING: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    IN_PROGRESS: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    COMPLETED: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    CANCELLED: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    NO_SHOW: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const FEED_DOT: Record<FeedStatus, string> = {
    COMPLETE: "bg-emerald-500",
    QUEUED: "bg-amber-500",
    PARTIAL: "bg-sky-500",
    ERROR: "bg-rose-500",
};

const COVERAGE_STYLES: Record<Exclude<CoverageState, "CASH">, string> = {
    ELIGIBLE: "text-emerald-600 dark:text-emerald-400",
    PRE_AUTH_PENDING: "text-amber-600 dark:text-amber-400",
    PARTIAL: "text-sky-600 dark:text-sky-400",
    INELIGIBLE: "text-rose-600 dark:text-rose-400",
    NOT_VERIFIED: "text-slate-500 dark:text-slate-400",
};

function statusToast(next: AppointmentStatus, t: Messages): string {
    switch (next) {
        case "WAITING":
            return t.toastCheckedIn;
        case "CONFIRMED":
            return t.toastConfirmed;
        case "IN_PROGRESS":
            return t.toastSentToClinic;
        case "CANCELLED":
            return t.toastCancelled;
        case "NO_SHOW":
            return t.toastNoShow;
        default:
            return t.toastCheckedIn;
    }
}

/* ------------------------------------------------------------------ */
/* Live refresh hook (Supabase Realtime + polling fallback)           */
/* ------------------------------------------------------------------ */

function useLiveRefresh(organizationId: string | null, onSignal: () => void): LiveMode {
    const [mode, setMode] = useState<LiveMode>("connecting");
    const signalRef = useRef(onSignal);
    const modeRef = useRef<LiveMode>("connecting");

    useEffect(() => {
        signalRef.current = onSignal;
    }, [onSignal]);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        if (!organizationId) return;

        let disposed = false;
        let debounce: number | undefined;
        let removeChannel: (() => void) | undefined;
        let ticks = 0;

        const fire = () => {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => signalRef.current(), 400);
        };

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (url && key) {
            void import("@supabase/supabase-js")
                .then(({ createClient }) => {
                    if (disposed) return;

                    const client = createClient(url, key, {
                        auth: {
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false,
                        },
                        realtime: { params: { eventsPerSecond: 5 } },
                    });

                    const filter = `organization_id=eq.${organizationId}`;
                    const channel = client.channel(`front-desk:${organizationId}`);

                    for (const table of ["appointments", "nphies_transactions", "invoices"]) {
                        channel.on(
                            "postgres_changes",
                            { event: "*", schema: "public", table, filter },
                            fire,
                        );
                    }

                    channel.subscribe((status: string) => {
                        if (disposed) return;

                        if (status === "SUBSCRIBED") setMode("realtime");
                        else if (
                            status === "CHANNEL_ERROR" ||
                            status === "TIMED_OUT" ||
                            status === "CLOSED"
                        ) {
                            setMode("polling");
                        }
                    });

                    removeChannel = () => {
                        void client.removeChannel(channel);
                    };
                })
                .catch(() => setMode("polling"));
        } else {
            setMode("polling");
        }

        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;

            ticks += 1;

            if (modeRef.current !== "realtime" || ticks % REALTIME_SAFETY_TICKS === 0) {
                signalRef.current();
            }
        }, POLL_MS);

        const onVisible = () => {
            if (document.visibilityState === "visible") signalRef.current();
        };

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);

        return () => {
            disposed = true;
            window.clearTimeout(debounce);
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
            removeChannel?.();
        };
    }, [organizationId]);

    return mode;
}

/* ------------------------------------------------------------------ */
/* Small presentational components                                    */
/* ------------------------------------------------------------------ */

function KpiCard({
    title,
    value,
    visual,
    footer,
}: {
    title: string;
    value: number;
    visual: ReactNode;
    footer: ReactNode;
}) {
    return (
        <div className={`${cardSurface} p-5`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
                    <p className="mt-2 text-4xl font-extrabold tracking-tight text-teal-600 dark:text-teal-400">
                        {value}
                    </p>
                </div>
                <div className="grid h-12 w-12 place-items-center text-teal-600 dark:text-teal-400">
                    {visual}
                </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
                {footer}
            </p>
        </div>
    );
}

function KpiSkeleton() {
    return (
        <div className={`${cardSurface} animate-pulse p-5`}>
            <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-9 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 h-3 w-40 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
    );
}

function RowSkeleton() {
    return (
        <tr className="animate-pulse">
            {[96, 150, 140, 110, 90, 110].map((width, index) => (
                <td key={index} className="px-4 py-5 align-middle">
                    <div
                        className="h-4 rounded bg-slate-200 dark:bg-slate-800"
                        style={{ width }}
                    />
                    {index < 3 && (
                        <div className="mt-2 h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                    )}
                </td>
            ))}
        </tr>
    );
}

function StatusPill({ status, t }: { status: AppointmentStatus; t: Messages }) {
    return (
        <span
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${STATUS_STYLES[status]}`}
        >
            {status === "WAITING" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            {t.statusLabels[status]}
        </span>
    );
}

/** Payment sub-label under the status pill: unpaid until check-in settles the visit. */
function PaymentHint({ item, t }: { item: QueueItem; t: Messages }) {
    if (item.status === "SCHEDULED" || item.status === "CONFIRMED") {
        if (item.paid) return null;

        return (
            <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                {t.payPending}
            </p>
        );
    }

    if (item.status === "WAITING" && item.paid) {
        return (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t.paidBadge}
            </p>
        );
    }

    return null;
}

function CoverageCell({
    item,
    locale,
    t,
}: {
    item: QueueItem;
    locale: Locale;
    t: Messages;
}) {
    const state = item.coverage.state;

    if (state === "CASH") {
        return (
            <span className="inline-flex items-center rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white">
                {t.coverageLabels.CASH}
            </span>
        );
    }

    const payer =
        locale === "ar"
            ? (item.coverage.payerNameAr ?? item.coverage.payerNameEn)
            : item.coverage.payerNameEn;
    const pending = state === "PRE_AUTH_PENDING";

    return (
        <div className="min-w-0 max-w-48">
            <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {payer ?? t.none}
            </p>
            <p
                className={`mt-1 inline-flex items-center gap-1.5 text-sm ${COVERAGE_STYLES[state]} ${pending ? "rounded-full bg-amber-500/10 px-2.5 py-0.5 font-medium" : ""
                    }`}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {t.coverageLabels[state]}
            </p>
        </div>
    );
}

function RowMenu({
    items,
    isRtl,
    label,
    disabled,
}: {
    items: MenuItem[];
    isRtl: boolean;
    label: string;
    disabled: boolean;
}) {
    const MENU_WIDTH = 224;
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const place = useCallback(() => {
        const button = buttonRef.current;

        if (!button) return;

        const rect = button.getBoundingClientRect();
        const height = menuRef.current?.offsetHeight ?? 0;
        let left = isRtl ? rect.left : rect.right - MENU_WIDTH;

        left = Math.min(Math.max(8, left), window.innerWidth - MENU_WIDTH - 8);

        let top = rect.bottom + 6;

        if (height && top + height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - height - 6);
        }

        setPosition({ top, left });
    }, [isRtl]);

    useLayoutEffect(() => {
        if (open) place();
    }, [open, place]);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        const onViewport = () => place();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onViewport);
        window.addEventListener("scroll", onViewport, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", onViewport);
            window.removeEventListener("scroll", onViewport, true);
        };
    }, [open, place]);

    if (items.length === 0) return null;

    const toneClass: Record<MenuItem["tone"], string> = {
        default: "text-slate-900 hover:bg-teal-600/10 dark:text-slate-100",
        warn: "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
        danger: "text-rose-500 hover:bg-rose-500/10",
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-transparent text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <MoreHorizontal className="h-5 w-5" />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            width: MENU_WIDTH,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[150] rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-2xl shadow-black/40 dark:border-slate-800 dark:bg-slate-900"
                    >
                        {items.map((entry) => (
                            <button
                                key={entry.key}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    entry.onSelect();
                                }}
                                className={`flex w-full items-center rounded-lg px-3 py-2.5 text-start font-medium transition focus:outline-none ${toneClass[entry.tone]}`}
                            >
                                {entry.label}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

function QuickActionCard({
    icon: Icon,
    label,
    onClick,
    ChevronIcon,
}: {
    icon: typeof UserPlus;
    label: string;
    onClick: () => void;
    ChevronIcon: typeof ChevronRight;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${cardSurface} flex w-full items-center gap-4 px-5 py-5 text-start transition hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500`}
        >
            <Icon className="h-7 w-7 shrink-0 text-teal-600 dark:text-teal-400" strokeWidth={1.7} />
            <span className="min-w-0 flex-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                {label}
            </span>
            <ChevronIcon className="h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" />
        </button>
    );
}

function feedMessage(item: NphiesFeedItem, t: Messages, locale: Locale): string {
    const name =
        (locale === "ar" ? item.patientNameAr : item.patientNameEn) ?? t.unknownPatient;
    const ref = shortRef(item.referenceNumber);

    if (item.transactionType === "ELIGIBILITY" && item.status === "COMPLETE" && item.policyInactive) {
        return fill(t.feedPolicyInactive, { name, ref });
    }

    const template = t.feed[item.transactionType][item.status];

    return fill(template, { name, ref });
}

/* ------------------------------------------------------------------ */
/* Page component                                                     */
/* ------------------------------------------------------------------ */

export default function FrontDeskToday({ initialLocale }: { initialLocale: Locale }) {
    const router = useRouter();
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [snapshot, setSnapshot] = useState<FrontDeskSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [tab, setTab] = useState<QueueTab>("ALL");
    const [query, setQuery] = useState("");
    const [clinicFilter, setClinicFilter] = useState(CLINIC_ALL);
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState<ModalName>(null);
    const [settleId, setSettleId] = useState<string | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmError, setConfirmError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const t = messages[locale];
    const isRtl = locale === "ar";
    const tRef = useRef<Messages>(t);
    const snapshotRef = useRef<FrontDeskSnapshot | null>(null);
    const inflightRef = useRef(false);
    const pendingRef = useRef(false);
    const refreshRef = useRef<() => Promise<void>>(async () => undefined);
    const toastIdRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    /* Keep locale in sync with the app-level language switch (html[lang]). */
    useEffect(() => {
        const root = document.documentElement;
        const sync = () => setLocale(root.lang === "en" ? "en" : "ar");

        sync();

        const observer = new MutationObserver(sync);

        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    /* Ticker for relative times in the feed. */
    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    /* ------------------------------ toasts ------------------------------ */

    const dismissToast = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushToast = useCallback(
        (kind: ToastKind, message: string, action?: ToastAction) => {
            const id = ++toastIdRef.current;

            setToasts((current) => [
                ...current.slice(-(MAX_TOASTS - 1)),
                { id, kind, message, ...(action ? { action } : {}) },
            ]);
            window.setTimeout(() => dismissToast(id), action ? TOAST_ACTION_MS : TOAST_MS);
        },
        [dismissToast],
    );

    /* ------------------------------ loading ----------------------------- */

    const refresh = useCallback(async (): Promise<void> => {
        if (inflightRef.current) {
            pendingRef.current = true;
            return;
        }

        inflightRef.current = true;

        if (snapshotRef.current) setRefreshing(true);

        try {
            const result = await getFrontDeskSnapshotAction();

            if (result.success && result.data) {
                snapshotRef.current = result.data;
                setSnapshot(result.data);
                setLoadError("");
            } else if (!snapshotRef.current) {
                setLoadError(result.error ?? tRef.current.loadFailed);
            }
        } catch {
            if (!snapshotRef.current) setLoadError(tRef.current.loadFailed);
        } finally {
            inflightRef.current = false;
            setLoading(false);
            setRefreshing(false);

            if (pendingRef.current) {
                pendingRef.current = false;
                void refreshRef.current();
            }
        }
    }, []);

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const liveMode = useLiveRefresh(snapshot?.organizationId ?? null, refresh);

    /* ------------------------------ derived ----------------------------- */

    const deferredQuery = useDeferredValue(query);
    const queue = useMemo<QueueItem[]>(() => snapshot?.queue ?? [], [snapshot]);

    const clinicOptions = useMemo(() => {
        const map = new Map<string, { id: string; nameEn: string; nameAr: string }>();

        for (const item of queue) {
            map.set(item.clinicId, {
                id: item.clinicId,
                nameEn: item.clinicNameEn,
                nameAr: item.clinicNameAr,
            });
        }

        return [...map.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    }, [queue]);

    const clinicSelectOptions = useMemo<SelectOption[]>(
        () => [
            { value: CLINIC_ALL, label: t.allClinics },
            ...clinicOptions.map((clinic) => ({
                value: clinic.id,
                label: isRtl ? clinic.nameAr : clinic.nameEn,
            })),
        ],
        [clinicOptions, t.allClinics, isRtl],
    );

    const baseFiltered = useMemo(() => {
        const normalized = deferredQuery.trim().toLowerCase();

        return queue.filter(
            (item) =>
                (!normalized || item.searchText.includes(normalized)) &&
                (clinicFilter === CLINIC_ALL || item.clinicId === clinicFilter),
        );
    }, [queue, deferredQuery, clinicFilter]);

    const tabCounts = useMemo(() => {
        const counts: Record<QueueTab, number> = {
            ALL: baseFiltered.length,
            SCHEDULED: 0,
            WAITING: 0,
            IN_CLINIC: 0,
            COMPLETED: 0,
        };

        for (const item of baseFiltered) {
            const key = tabOf(item.status);

            if (key) counts[key] += 1;
        }

        return counts;
    }, [baseFiltered]);

    const filtered = useMemo(
        () => (tab === "ALL" ? baseFiltered : baseFiltered.filter((item) => tabOf(item.status) === tab)),
        [baseFiltered, tab],
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const showingFrom = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);

    const filtersActive = tab !== "ALL" || query.trim() !== "" || clinicFilter !== CLINIC_ALL;

    function resetFilters() {
        setTab("ALL");
        setQuery("");
        setClinicFilter(CLINIC_ALL);
        setPage(1);
    }

    /* ----------------------------- navigation --------------------------- */

    const goRegisterPatient = useCallback(() => {
        router.push("/reception/patients?new=true");
    }, [router]);

    function goCreateInvoice(item: QueueItem) {
        router.push(
            `/reception/billing?action=create&appointmentId=${encodeURIComponent(
                item.id,
            )}&patientId=${encodeURIComponent(item.patientId)}`,
        );
    }

    function goViewInvoice(item: QueueItem) {
        if (!item.invoiceId) return;

        router.push(
            `/reception/billing?invoiceId=${encodeURIComponent(
                item.invoiceId,
            )}&appointmentId=${encodeURIComponent(item.id)}`,
        );
    }

    /* ------------------------------ mutations --------------------------- */

    /** Runs a status change and reports the outcome (no toast / refresh side effects). */
    async function applyStatus(
        item: QueueItem,
        next: AppointmentStatus,
    ): Promise<{ ok: boolean; error?: string }> {
        try {
            const result = await updateAppointmentStatusAction({
                appointmentId: item.id,
                status: next,
            });

            if (!result.success) {
                return {
                    ok: false,
                    error: actionErrorMessage(tRef.current, result.code, result.error),
                };
            }

            return { ok: true };
        } catch {
            return { ok: false, error: tRef.current.failed };
        }
    }

    async function changeStatus(item: QueueItem, next: AppointmentStatus) {
        setBusyId(item.id);

        try {
            const outcome = await applyStatus(item, next);

            if (outcome.ok) pushToast("success", statusToast(next, tRef.current));
            else pushToast("error", outcome.error ?? tRef.current.failed);
        } finally {
            setBusyId(null);
            await refresh();
        }
    }

    /**
     * Check-In never flips the status directly: it opens the Check-In & Payment Settlement. The
     * only exception is a visit that already carries an invoice (e.g. billed from the billing
     * page), which the server allows to move to Waiting.
     */
    function startCheckIn(item: QueueItem) {
        if (item.paid) {
            void changeStatus(item, "WAITING");
            return;
        }

        setSettleId(item.id);
    }

    /** "Verify NPHIES" row action: runs through nphies.checkEligibility (NPHIES_MODE adapter). */
    async function verifyRow(item: QueueItem) {
        setBusyId(item.id);

        try {
            const result = await verifyAppointmentNphiesAction(item.id);
            const current = tRef.current;

            if (!result.success || !result.data) {
                pushToast("error", actionErrorMessage(current, result.code, result.error));
            } else {
                const data = result.data;
                const payer =
                    (locale === "ar" ? data.payerNameAr : data.payerNameEn) ?? data.payerNameEn ?? "";

                if (data.coverage === "ELIGIBLE") {
                    pushToast("success", `${current.toastEligible} ${payer}`.trim());
                } else if (data.coverage === "PRE_AUTH_PENDING") {
                    pushToast("info", current.toastEligibilityPending);
                } else if (data.coverage === "PARTIAL") {
                    pushToast("info", current.toastEligibilityPartial);
                } else if (data.messageCode === "NPHIES_ERROR") {
                    pushToast(
                        "error",
                        (locale === "ar" ? data.messageAr : data.messageEn) ??
                        current.codes.NPHIES_ERROR,
                    );
                } else {
                    pushToast("error", current.codes[data.messageCode]);
                }
            }
        } catch {
            pushToast("error", tRef.current.failed);
        } finally {
            setBusyId(null);
            await refresh();
        }
    }

    /** Cancel / No-show open the brand-matched confirmation modal; other moves run directly. */
    function confirmThenChange(item: QueueItem, next: AppointmentStatus) {
        if (next === "CANCELLED" || next === "NO_SHOW") {
            setConfirmError("");
            setConfirmTarget({ item, next });
            return;
        }

        if (next === "WAITING") {
            startCheckIn(item);
            return;
        }

        void changeStatus(item, next);
    }

    async function runConfirmed() {
        if (!confirmTarget || confirmBusy) return;

        const { item, next } = confirmTarget;

        setConfirmBusy(true);
        setConfirmError("");

        const outcome = await applyStatus(item, next);

        setConfirmBusy(false);

        if (outcome.ok) {
            setConfirmTarget(null);
            pushToast("success", statusToast(next, tRef.current));
        } else {
            setConfirmError(outcome.error ?? tRef.current.failed);
        }

        await refresh();
    }

    function closeConfirm() {
        if (confirmBusy) return;

        setConfirmTarget(null);
        setConfirmError("");
    }

    function menuItemsFor(item: QueueItem, primary: PrimaryAction): MenuItem[] {
        if (item.isLocked) return [];

        const entries: MenuItem[] = [];

        for (const next of item.allowedNext) {
            if (next === "WAITING" && primary === "CHECK_IN") continue;

            const base = { key: next, onSelect: () => confirmThenChange(item, next) };

            switch (next) {
                case "CONFIRMED":
                    entries.push({ ...base, label: t.menuConfirm, tone: "default" });
                    break;
                case "WAITING":
                    entries.push({ ...base, label: t.menuCheckIn, tone: "default" });
                    break;
                case "IN_PROGRESS":
                    entries.push({ ...base, label: t.menuSendToClinic, tone: "default" });
                    break;
                case "CANCELLED":
                    entries.push({ ...base, label: t.menuCancel, tone: "danger" });
                    break;
                case "NO_SHOW":
                    entries.push({ ...base, label: t.menuNoShow, tone: "warn" });
                    break;
                default:
                    break;
            }
        }

        return entries;
    }

    const closeModal = useCallback(() => setModal(null), []);

    const handleModalDone = useCallback(
        (message: string) => {
            setModal(null);
            pushToast("success", message);
            void refresh();
        },
        [pushToast, refresh],
    );

    /** A walk-in is created Scheduled/unpaid; the settlement modal opens straight away. */
    const handleWalkInCreated = useCallback(
        (appointmentId: string) => {
            setModal(null);
            setSettleId(appointmentId);
            pushToast("info", tRef.current.toastWalkInCreated);
            void refresh();
        },
        [pushToast, refresh],
    );

    const closeSettlement = useCallback(() => {
        // The visit stays Scheduled (unpaid); just make sure the queue shows it.
        setSettleId(null);
        void refresh();
    }, [refresh]);

    const timezone = snapshot?.timezone ?? "Asia/Riyadh";

    const handleSettled = useCallback(
        (receipt: SettlementReceipt) => {
            const current = tRef.current;
            const name = locale === "ar" ? receipt.patientNameAr : receipt.patientNameEn;

            setSettleId(null);
            pushToast("success", fill(current.ckToastPaid, { name }), {
                label: current.ckPrint,
                onClick: () => {
                    if (!printReceipt(receipt, tRef.current, locale, timezone)) {
                        pushToast("error", tRef.current.ckPopupBlocked);
                    }
                },
            });
            void refresh();
        },
        [locale, pushToast, refresh, timezone],
    );

    const handleRegisterFromModal = useCallback(() => {
        setModal(null);
        goRegisterPatient();
    }, [goRegisterPatient]);

    /* ------------------------------ render ------------------------------ */

    const kpis = snapshot?.kpis;
    const showSkeleton = loading && !snapshot;
    const ChevronIcon = isRtl ? ChevronLeft : ChevronRight;
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const showEmptyState = !showSkeleton && visible.length === 0;

    const liveLabel =
        liveMode === "realtime"
            ? t.liveRealtime
            : liveMode === "polling"
                ? t.livePolling
                : t.liveConnecting;

    const tabs: Array<{ key: QueueTab; label: string }> = [
        { key: "ALL", label: t.tabAll },
        { key: "SCHEDULED", label: t.tabScheduled },
        { key: "WAITING", label: t.tabWaiting },
        { key: "IN_CLINIC", label: t.tabInClinic },
        { key: "COMPLETED", label: t.tabCompleted },
    ];

    const confirmRows = confirmTarget
        ? [
            {
                label: t.cfPatient,
                value: isRtl ? confirmTarget.item.patientNameAr : confirmTarget.item.patientNameEn,
            },
            {
                label: t.cfDoctor,
                value: displayDoctor(
                    isRtl ? confirmTarget.item.doctorNameAr : confirmTarget.item.doctorNameEn,
                    locale,
                ),
            },
            {
                label: t.cfTime,
                value: formatTime(confirmTarget.item.scheduledAt, timezone, locale),
            },
            { label: t.cfStatus, value: t.statusLabels[confirmTarget.item.status] },
        ]
        : [];

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <ReceptionSidebar
                    locale={locale}
                    activeHref={FRONT_DESK_HREF}
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                />

                <main className="min-w-0 flex-1">
                    <ReceptionHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        {/* Page header + Quick Appointment */}
                        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                                <div className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                    <span>{t.breadcrumbRoot}</span>
                                    <span>/</span>
                                    <span className="text-teal-700 dark:text-teal-400">{t.pageTitle}</span>
                                </div>
                                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                                    {t.pageTitle}
                                </h1>
                                <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
                                    {t.subtitle}
                                    {snapshot && <> · {formatLongDate(snapshot.today, locale)}</>}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <span
                                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    aria-live="polite"
                                >
                                    <span
                                        className={`h-2.5 w-2.5 rounded-full ${liveMode === "realtime"
                                            ? "animate-pulse bg-emerald-500"
                                            : liveMode === "polling"
                                                ? "bg-amber-500"
                                                : "bg-slate-400"
                                            }`}
                                    />
                                    {liveLabel}
                                </span>

                                <button
                                    type="button"
                                    onClick={() => void refresh()}
                                    aria-label={t.refresh}
                                    title={t.refresh}
                                    className={`${outlineButton} h-11 w-11 px-0`}
                                >
                                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                                </button>

                                {/* In-page quick booking: opens the modal, never navigates away. */}
                                <button
                                    type="button"
                                    onClick={() => setModal("quick")}
                                    className={`${tealButton} h-11 px-5 text-base`}
                                >
                                    <Plus className="h-5 w-5" />
                                    {t.quickAppointment}
                                </button>
                            </div>
                        </header>

                        {/* KPI cards */}
                        <section
                            aria-label={t.pageTitle}
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
                        >
                            {showSkeleton || !kpis ? (
                                <>
                                    <KpiSkeleton />
                                    <KpiSkeleton />
                                    <KpiSkeleton />
                                    <KpiSkeleton />
                                </>
                            ) : (
                                <>
                                    <KpiCard
                                        title={t.kpiAppointments}
                                        value={kpis.totalToday}
                                        visual={<CalendarDays className="h-10 w-10" strokeWidth={1.5} />}
                                        footer={
                                            <>
                                                <span>
                                                    {kpis.completed} {t.kpiCompleted}
                                                </span>
                                                <span aria-hidden>•</span>
                                                <span>
                                                    {kpis.upcoming} {t.kpiUpcoming}
                                                </span>
                                            </>
                                        }
                                    />
                                    <KpiCard
                                        title={t.kpiWaiting}
                                        value={kpis.waiting}
                                        visual={
                                            <span className="relative flex h-10 w-10 items-center justify-center">
                                                <span className="absolute h-10 w-10 animate-ping rounded-full bg-teal-500/20" />
                                                <span className="h-4 w-4 rounded-full bg-teal-500" />
                                            </span>
                                        }
                                        footer={<span>{t.kpiPatients}</span>}
                                    />
                                    <KpiCard
                                        title={t.kpiNphies}
                                        value={kpis.nphiesEligible}
                                        visual={<ShieldCheck className="h-10 w-10" strokeWidth={1.5} />}
                                        footer={
                                            <>
                                                <span>
                                                    {kpis.nphiesEligible} {t.kpiEligible}
                                                </span>
                                                <span aria-hidden>•</span>
                                                <span className="text-amber-600 dark:text-amber-400">
                                                    {kpis.nphiesAuthPending} {t.kpiAuthPending}
                                                </span>
                                            </>
                                        }
                                    />
                                    <KpiCard
                                        title={t.kpiBilling}
                                        value={kpis.pendingBilling}
                                        visual={<FileText className="h-10 w-10" strokeWidth={1.5} />}
                                        footer={
                                            <span>
                                                {kpis.pendingBilling} {t.kpiUnpaid}
                                            </span>
                                        }
                                    />
                                </>
                            )}
                        </section>

                        {/* items-start: the queue card height follows its own rows, never the NPHIES feed column. */}
                        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                            {/* Live queue */}
                            <section className={`${cardSurface} min-w-0 self-start overflow-hidden`}>
                                <div className="space-y-4 px-6 pt-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            {t.queueTitle}
                                        </h2>

                                        {filtersActive && (
                                            <button
                                                type="button"
                                                onClick={resetFilters}
                                                className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-sm font-semibold text-amber-600 transition hover:bg-amber-500/20 dark:text-amber-400"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                                {t.resetFilters}
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                                        <label className="relative block">
                                            <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                                            <input
                                                value={query}
                                                onChange={(event) => {
                                                    setQuery(event.target.value);
                                                    setPage(1);
                                                }}
                                                placeholder={t.search}
                                                aria-label={t.search}
                                                className={`${baseInput} ps-11`}
                                            />
                                        </label>

                                        <SelectBox
                                            value={clinicFilter}
                                            ariaLabel={t.allClinics}
                                            icon={Building2}
                                            options={clinicSelectOptions}
                                            onChange={(value) => {
                                                setClinicFilter(value);
                                                setPage(1);
                                            }}
                                        />
                                    </div>

                                    <div
                                        role="tablist"
                                        aria-label={t.queueTitle}
                                        className="flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-200 dark:border-slate-800"
                                    >
                                        {tabs.map((entry) => {
                                            const active = tab === entry.key;

                                            return (
                                                <button
                                                    key={entry.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={active}
                                                    onClick={() => {
                                                        setTab(entry.key);
                                                        setPage(1);
                                                    }}
                                                    className={`-mb-px border-b-2 pb-3 text-base font-semibold transition ${active
                                                        ? "border-teal-500 text-teal-600 dark:text-teal-400"
                                                        : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                                                        }`}
                                                >
                                                    {entry.label}
                                                    {entry.key === "ALL" || active ? (
                                                        <span className="ms-1.5">({tabCounts[entry.key]})</span>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {loadError ? (
                                    <div className="flex flex-col items-center justify-center gap-4 px-8 py-12 text-center">
                                        <CircleAlert className="h-8 w-8 text-teal-500" />
                                        <p className="text-sm">{loadError}</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setLoading(true);
                                                setLoadError("");
                                                void refresh();
                                            }}
                                            className={tealButton}
                                        >
                                            {t.retry}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {showEmptyState ? (
                                            /* Compact empty state: the card is only as tall as its content. */
                                            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                                                <CalendarDays className="h-8 w-8 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
                                                <span>{queue.length === 0 ? t.emptyToday : t.empty}</span>
                                                {filtersActive && (
                                                    <button
                                                        type="button"
                                                        onClick={resetFilters}
                                                        className="font-semibold text-teal-600 underline dark:text-teal-400"
                                                    >
                                                        {t.resetFilters}
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[980px] border-collapse text-start">
                                                    <caption className="sr-only">{t.queueTitle}</caption>
                                                    <thead>
                                                        <tr className="bg-slate-50 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                                            <th className="px-6 py-4 text-start">{t.colTime}</th>
                                                            <th className="px-4 py-4 text-start">{t.colPatient}</th>
                                                            <th className="px-4 py-4 text-start">{t.colDoctor}</th>
                                                            <th className="px-4 py-4 text-start">{t.colCoverage}</th>
                                                            <th className="px-4 py-4 text-start">{t.colStatus}</th>
                                                            <th className="px-4 py-4 text-end">{t.colActions}</th>
                                                        </tr>
                                                    </thead>

                                                    <tbody
                                                        aria-busy={showSkeleton}
                                                        className="divide-y divide-slate-200 dark:divide-slate-800"
                                                    >
                                                        {showSkeleton
                                                            ? Array.from({ length: PAGE_SIZE }, (_, index) => (
                                                                <RowSkeleton key={index} />
                                                            ))
                                                            : visible.map((item) => {
                                                                const primary = primaryActionOf(item);
                                                                const busy = busyId === item.id;
                                                                const menuItems = menuItemsFor(item, primary);
                                                                const clinicName = isRtl
                                                                    ? item.clinicNameAr
                                                                    : item.clinicNameEn;

                                                                return (
                                                                    <tr
                                                                        key={item.id}
                                                                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                                                                    >
                                                                        <td className="px-6 py-4 align-middle">
                                                                            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                                                                <span dir="ltr">
                                                                                    {formatTime(item.scheduledAt, timezone, locale)}
                                                                                </span>
                                                                            </p>
                                                                            <p
                                                                                dir="ltr"
                                                                                className={`mt-1 text-sm text-slate-500 dark:text-slate-400 ${isRtl ? "text-end" : ""
                                                                                    }`}
                                                                            >
                                                                                {item.token}
                                                                            </p>
                                                                        </td>

                                                                        <td className="px-4 py-4 align-middle">
                                                                            <p className="max-w-52 truncate text-base font-bold text-slate-900 dark:text-white">
                                                                                {isRtl ? item.patientNameAr : item.patientNameEn}
                                                                            </p>
                                                                            <p
                                                                                dir="ltr"
                                                                                className={`mt-1 text-sm text-slate-500 dark:text-slate-400 ${isRtl ? "text-end" : ""
                                                                                    }`}
                                                                            >
                                                                                {item.nationalIdMasked}
                                                                            </p>
                                                                        </td>

                                                                        <td className="px-4 py-4 align-middle">
                                                                            <p className="max-w-52 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                                                                                {displayDoctor(
                                                                                    isRtl ? item.doctorNameAr : item.doctorNameEn,
                                                                                    locale,
                                                                                )}
                                                                            </p>
                                                                            <p className="mt-1 max-w-52 truncate text-sm text-slate-500 dark:text-slate-400">
                                                                                • {clinicName}
                                                                            </p>
                                                                        </td>

                                                                        <td className="px-4 py-4 align-middle">
                                                                            <CoverageCell item={item} locale={locale} t={t} />
                                                                        </td>

                                                                        <td className="px-4 py-4 align-middle">
                                                                            <StatusPill status={item.status} t={t} />
                                                                            <PaymentHint item={item} t={t} />
                                                                        </td>

                                                                        <td className="px-4 py-4 align-middle">
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                {busy ? (
                                                                                    <LoaderCircle className="h-5 w-5 animate-spin text-teal-500" />
                                                                                ) : (
                                                                                    <>
                                                                                        {primary === "CHECK_IN" && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => startCheckIn(item)}
                                                                                                className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                                                                            >
                                                                                                {t.checkIn}
                                                                                            </button>
                                                                                        )}

                                                                                        {primary === "VERIFY" && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => void verifyRow(item)}
                                                                                                className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-teal-500 px-4 text-sm font-semibold text-teal-600 transition hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-teal-400"
                                                                                            >
                                                                                                {t.verifyNphies}
                                                                                            </button>
                                                                                        )}

                                                                                        {primary === "CREATE_INVOICE" && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => goCreateInvoice(item)}
                                                                                                className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-teal-500 px-4 text-sm font-semibold text-teal-600 transition hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-teal-400"
                                                                                            >
                                                                                                {t.createInvoice}
                                                                                            </button>
                                                                                        )}

                                                                                        {primary === "VIEW_INVOICE" && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => goViewInvoice(item)}
                                                                                                className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-sky-500 px-4 text-sm font-semibold text-sky-600 transition hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-sky-400"
                                                                                            >
                                                                                                {t.viewInvoice}
                                                                                            </button>
                                                                                        )}

                                                                                        {primary === "CHECKED_IN" && (
                                                                                            <span className="inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                                                                                <CheckCircle2 className="h-4 w-4" />
                                                                                                {t.checkedIn}
                                                                                            </span>
                                                                                        )}

                                                                                        <RowMenu
                                                                                            items={menuItems}
                                                                                            isRtl={isRtl}
                                                                                            label={t.rowActions}
                                                                                            disabled={busy}
                                                                                        />
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {!showEmptyState && (
                                            <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                    {t.showing}{" "}
                                                    <strong className="text-slate-900 dark:text-slate-100">
                                                        {showingFrom}–{showingTo}
                                                    </strong>{" "}
                                                    {t.of}{" "}
                                                    <strong className="text-slate-900 dark:text-slate-100">
                                                        {filtered.length}
                                                    </strong>{" "}
                                                    {t.visits}
                                                </p>

                                                <nav aria-label={t.queueTitle} className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        aria-label={t.previous}
                                                        disabled={currentPage <= 1}
                                                        onClick={() => setPage(Math.max(1, currentPage - 1))}
                                                        className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-teal-500 hover:text-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                                    >
                                                        <PrevIcon className="h-4 w-4" />
                                                    </button>
                                                    <span className="min-w-16 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                        {currentPage} / {totalPages}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-label={t.next}
                                                        disabled={currentPage >= totalPages}
                                                        onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                                                        className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:border-teal-500 hover:text-teal-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                                                    >
                                                        <ChevronIcon className="h-4 w-4" />
                                                    </button>
                                                </nav>
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>

                            {/* Right column */}
                            <aside className="space-y-4">
                                <QuickActionCard
                                    icon={UserPlus}
                                    label={t.registerPatient}
                                    onClick={goRegisterPatient}
                                    ChevronIcon={ChevronIcon}
                                />
                                <QuickActionCard
                                    icon={ShieldCheck}
                                    label={t.instantCheck}
                                    onClick={() => setModal("eligibility")}
                                    ChevronIcon={ChevronIcon}
                                />
                                <QuickActionCard
                                    icon={Footprints}
                                    label={t.walkIn}
                                    onClick={() => setModal("walkin")}
                                    ChevronIcon={ChevronIcon}
                                />

                                <section className={`${cardSurface} p-5`}>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                                                {t.feedTitle}
                                            </h2>
                                            {snapshot && (
                                                <span
                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${snapshot.nphiesMode === "PRODUCTION"
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                        }`}
                                                >
                                                    {snapshot.nphiesMode === "PRODUCTION"
                                                        ? t.nphiesProduction
                                                        : t.nphiesSimulator}
                                                </span>
                                            )}
                                        </div>
                                        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-teal-600 dark:text-teal-400">
                                            <Activity className="h-4 w-4" />
                                            {liveLabel}
                                        </span>
                                    </div>

                                    {showSkeleton ? (
                                        <div className="animate-pulse space-y-4">
                                            {Array.from({ length: 5 }, (_, index) => (
                                                <div key={index} className="space-y-2">
                                                    <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
                                                    <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : !snapshot || snapshot.feed.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                                            {t.feedEmpty}
                                        </p>
                                    ) : (
                                        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {snapshot.feed.map((entry) => (
                                                <li key={entry.id} className="flex items-start gap-3 py-3">
                                                    <span
                                                        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${entry.policyInactive ? "bg-rose-500" : FEED_DOT[entry.status]
                                                            }`}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                            {feedMessage(entry, t, locale)}
                                                        </p>
                                                        {entry.copayPercentage !== null && (
                                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                                {fill(t.feedCopay, { value: entry.copayPercentage })}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                                        {relativeTime(entry.createdAt, nowMs, locale)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            </aside>
                        </div>
                    </div>
                </main>
            </div>

            <AnimatePresence>
                {modal === "quick" && snapshot && (
                    <QuickAppointmentModal
                        key="quick-appointment"
                        locale={locale}
                        t={t}
                        timezone={snapshot.timezone}
                        today={snapshot.today}
                        onClose={closeModal}
                        onDone={handleModalDone}
                        onRegisterPatient={handleRegisterFromModal}
                    />
                )}

                {modal === "walkin" && (
                    <WalkInModal
                        key="walk-in"
                        locale={locale}
                        t={t}
                        onClose={closeModal}
                        onCreated={handleWalkInCreated}
                        onRegisterPatient={handleRegisterFromModal}
                    />
                )}

                {modal === "eligibility" && (
                    <EligibilityModal
                        key="eligibility"
                        locale={locale}
                        t={t}
                        onClose={closeModal}
                        onChecked={() => void refresh()}
                        onRegisterPatient={handleRegisterFromModal}
                    />
                )}

                {settleId && (
                    <CheckInPaymentModal
                        key={`check-in-payment-${settleId}`}
                        locale={locale}
                        t={t}
                        timezone={timezone}
                        appointmentId={settleId}
                        onClose={closeSettlement}
                        onSettled={handleSettled}
                    />
                )}

                {confirmTarget && (
                    <ConfirmActionModal
                        key="confirm-action"
                        locale={locale}
                        t={t}
                        tone={confirmTarget.next === "CANCELLED" ? "danger" : "warn"}
                        title={confirmTarget.next === "CANCELLED" ? t.confirmCancel : t.confirmNoShow}
                        description={
                            confirmTarget.next === "CANCELLED" ? t.cfCancelBody : t.cfNoShowBody
                        }
                        rows={confirmRows}
                        confirmLabel={
                            confirmTarget.next === "CANCELLED" ? t.cfConfirmCancel : t.cfConfirmNoShow
                        }
                        loading={confirmBusy}
                        error={confirmError}
                        onConfirm={() => void runConfirmed()}
                        onClose={closeConfirm}
                    />
                )}
            </AnimatePresence>

            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed bottom-6 end-6 z-[200] flex flex-col items-end gap-3"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xl shadow-black/40 dark:bg-slate-900 ${toast.kind === "success"
                            ? "border-teal-600/40"
                            : toast.kind === "info"
                                ? "border-sky-500/40"
                                : "border-rose-500/40"
                            }`}
                    >
                        {toast.kind === "success" ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                        ) : toast.kind === "info" ? (
                            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
                        ) : (
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                        )}

                        <div className="min-w-0 flex-1">
                            <p className="break-words text-slate-900 dark:text-slate-100">
                                {toast.message}
                            </p>
                            {toast.action && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        toast.action?.onClick();
                                        dismissToast(toast.id);
                                    }}
                                    className="mt-2 inline-flex h-8 items-center rounded-lg border border-teal-500 px-3 text-xs font-semibold text-teal-600 transition hover:bg-teal-600/10 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-teal-400"
                                >
                                    {toast.action.label}
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => dismissToast(toast.id)}
                            aria-label={t.close}
                            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}