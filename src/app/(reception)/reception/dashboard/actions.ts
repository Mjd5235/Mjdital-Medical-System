// ============================================================================
// app/(reception)/reception/dashboard/actions.ts
// Front Desk / Today: server actions & queries (Mjdital Reception Portal)
//
// Assumptions:
//  - requirePortalSession("reception"): change the portal key if your guard names it differently.
//  - Every query is scoped by organizationId AND by `clinicId IN (tenant clinics)`, which keeps
//    the tenant middleware used on Doctor / Appointment / Patient happy.
//  - NPHIES: eligibility checks go through the unified service in `@/lib/nphies`
//    (`nphies.checkEligibility`). `NPHIES_MODE` ("SIMULATOR" | "PRODUCTION") selects the adapter,
//    the service builds the FHIR bundle, dispatches it and persists the `nphies_transactions`
//    audit row. This file only maps the normalized result to the Front Desk UI, so there is no
//    duplicate transaction logic here.
// ============================================================================
"use server";

import { revalidatePath } from "next/cache";
import {
    AppointmentStatus,
    AuditActionType,
    NphiesTransactionStatus,
    NphiesTransactionType,
    Prisma,
} from "@prisma/client";
import type { DoctorPresence } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import {
    NphiesConfigurationError,
    nphies,
    resolveNphiesMode,
    type EligibilityCheckRequest,
    type EligibilityResult,
    type NphiesMode,
    type NphiesServiceResponse,
    type PortalIdentityType,
} from "@/lib/nphies";

/* -------------------------------------------------------------------------- */
/* Constants (module-private: "use server" files may only export async fns)   */
/* -------------------------------------------------------------------------- */

const PORTAL = "reception" as const;
const DEFAULT_TIMEZONE = "Asia/Riyadh";
const QUEUE_CAP = 1000;
const FEED_LIMIT = 12;
const PATIENT_SEARCH_LIMIT = 8;
const MAX_BOOKING_DAYS_AHEAD = 60;
const FRONT_DESK_PATH = "/reception";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Status moves the reception desk is allowed to make (doctors complete visits). */
const RECEPTION_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
    SCHEDULED: ["CONFIRMED", "WAITING", "CANCELLED", "NO_SHOW"],
    CONFIRMED: ["WAITING", "CANCELLED", "NO_SHOW"],
    WAITING: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
    IN_PROGRESS: [],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
};

const INACTIVE_STATUSES: AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];
const ACTIVE_VISIT_STATUSES: AppointmentStatus[] = [
    "SCHEDULED",
    "CONFIRMED",
    "WAITING",
    "IN_PROGRESS",
];

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface FrontDeskActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export type FrontDeskNphiesMode = NphiesMode;

export type CoverageState =
    | "CASH"
    | "ELIGIBLE"
    | "PRE_AUTH_PENDING"
    | "PARTIAL"
    | "INELIGIBLE"
    | "NOT_VERIFIED";

export type EligibilityMessageCode =
    | "ELIGIBLE"
    | "NO_COVERAGE"
    | "PROVIDER_INACTIVE"
    | "MISSING_MEMBER_ID"
    | "POLICY_INACTIVE"
    | "POLICY_EXPIRED"
    | "POLICY_PENDING"
    | "PARTIAL_COVERAGE"
    | "NPHIES_ERROR";

export interface QueueCoverage {
    state: CoverageState;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyName: string | null;
    referenceNumber: string | null;
    checkedAt: string | null;
}

export interface QueueItem {
    id: string;
    /** Derived queue token for today (position by scheduled time), not stored. */
    token: string;
    scheduledAt: string;
    status: AppointmentStatus;
    isLocked: boolean;
    allowedNext: AppointmentStatus[];
    patientId: string;
    patientNameEn: string;
    patientNameAr: string;
    nationalIdMasked: string;
    fileNumber: string;
    doctorNameEn: string;
    doctorNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    clinicId: string;
    clinicNameEn: string;
    clinicNameAr: string;
    coverage: QueueCoverage;
    invoiceId: string | null;
    searchText: string;
}

export interface FrontDeskKpis {
    totalToday: number;
    completed: number;
    upcoming: number;
    waiting: number;
    nphiesEligible: number;
    nphiesAuthPending: number;
    pendingBilling: number;
}

export interface NphiesFeedItem {
    id: string;
    transactionType: NphiesTransactionType;
    status: NphiesTransactionStatus;
    referenceNumber: string;
    patientNameEn: string | null;
    patientNameAr: string | null;
    copayPercentage: number | null;
    /** True when an eligibility response came back "complete" but the policy is not active. */
    policyInactive: boolean;
    createdAt: string;
}

export interface FrontDeskSnapshot {
    organizationId: string;
    timezone: string;
    /** YYYY-MM-DD in the organization's timezone. */
    today: string;
    generatedAt: string;
    /** Active NPHIES adapter (NPHIES_MODE). */
    nphiesMode: FrontDeskNphiesMode;
    kpis: FrontDeskKpis;
    queue: QueueItem[];
    feed: NphiesFeedItem[];
}

export interface BookingClinicOption {
    id: string;
    nameEn: string;
    nameAr: string;
}

export interface BookingDoctorOption {
    id: string;
    clinicId: string;
    fullNameEn: string;
    fullNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    presence: DoctorPresence;
    hasActiveShifts: boolean;
}

export interface BookingOptionsData {
    clinics: BookingClinicOption[];
    doctors: BookingDoctorOption[];
}

export interface PatientSearchRow {
    id: string;
    fileNumber: string;
    nationalIdMasked: string;
    fullNameEn: string;
    fullNameAr: string;
    phone: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
}

export interface SlotOption {
    shiftId: string;
    serviceId: string;
    serviceNameEn: string;
    serviceNameAr: string;
    startMinute: number;
    startIso: string;
    durationMinutes: number;
}

export interface AvailableSlotsData {
    date: string;
    slots: SlotOption[];
}

export interface CreateAppointmentInput {
    patientId: string;
    doctorId: string;
    shiftId: string;
    /** YYYY-MM-DD in the organization's timezone. */
    date: string;
    startMinute: number;
    reason?: string;
}

export interface CreateWalkInInput {
    patientId: string;
    doctorId: string;
    reason?: string;
}

export interface UpdateAppointmentStatusInput {
    appointmentId: string;
    status: AppointmentStatus;
}

export interface AppointmentMutationData {
    id: string;
    status: AppointmentStatus;
    scheduledAt: string;
}

export interface EligibilityCopay {
    type: "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    cap: number | null;
}

export interface EligibilityResultData {
    patientId: string;
    patientNameEn: string;
    patientNameAr: string;
    status: NphiesTransactionStatus;
    coverage: CoverageState;
    messageCode: EligibilityMessageCode;
    /** Localized status message returned by NPHIES / the simulator (or the transport error). */
    messageEn: string | null;
    messageAr: string | null;
    /** True when the desk must collect payment in cash (inactive / expired policy). */
    cashFallbackRequired: boolean;
    referenceNumber: string;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyName: string | null;
    copay: EligibilityCopay | null;
    latencyMs: number;
    mode: FrontDeskNphiesMode;
    checkedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Infrastructure helpers                                                     */
/* -------------------------------------------------------------------------- */

class ActionFailure extends Error {
    readonly code: string;

    constructor(message: string, code: string) {
        super(message);
        this.name = "ActionFailure";
        this.code = code;
    }
}

interface Ctx {
    organizationId: string;
    userId: string | null;
    timezone: string;
    clinicIds: string[];
}

type PortalSession = Awaited<ReturnType<typeof requirePortalSession>>;

function invalid<T>(error: string, code = "INVALID_INPUT"): FrontDeskActionResult<T> {
    return { success: false, error, code };
}

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function isNextRedirect(error: unknown): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;

    return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function actorIdOf(...sources: unknown[]): string | null {
    for (const source of sources) {
        const candidate = source as { userId?: unknown; id?: unknown; sub?: unknown } | null;

        for (const value of [candidate?.userId, candidate?.sub, candidate?.id]) {
            if (typeof value === "string" && validUuid(value)) return value;
        }
    }

    return null;
}

function failure<T>(action: string, error: unknown): FrontDeskActionResult<T> {
    if (error instanceof ActionFailure) {
        return invalid(error.message, error.code);
    }

    if (error instanceof NphiesConfigurationError) {
        console.error(`[${action}]`, error);

        return invalid(
            "NPHIES is not configured correctly for this center. Contact your administrator.",
            "NPHIES_CONFIGURATION",
        );
    }

    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return invalid("This record already exists.", "DUPLICATE_RECORD");
            case "P2003":
                return invalid(
                    "A selected patient, doctor or clinic is no longer available.",
                    "INVALID_RELATION",
                );
            case "P2025":
                return invalid(
                    "The requested record could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
            case "P2034":
                return invalid(
                    "The schedule changed while saving. Please try again.",
                    "CONFLICT",
                );
        }
    }

    return invalid("The operation could not be completed. Please try again.", "DATABASE_ERROR");
}

async function loadTenant(
    organizationId: string,
): Promise<{ timezone: string; clinicIds: string[] } | null> {
    const [organization, clinics] = await Promise.all([
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { timezone: true, isActive: true },
        }),
        prisma.clinic.findMany({
            where: { organizationId },
            select: { id: true },
        }),
    ]);

    if (!organization || !organization.isActive) return null;

    return {
        timezone: safeTimeZone(organization.timezone),
        clinicIds: clinics.map((clinic) => clinic.id),
    };
}

/**
 * Authenticates the reception session (cookie read + DB verification run in
 * parallel with the tenant lookup) and runs the handler with a tenant context.
 */
async function withSession<T>(
    action: string,
    handler: (ctx: Ctx) => Promise<FrontDeskActionResult<T>>,
): Promise<FrontDeskActionResult<T>> {
    let ctx: Ctx;

    try {
        const cookieSession = await getSession();

        if (!cookieSession?.organizationId) {
            // Redirects to the login page when the session is gone.
            await requirePortalSession(PORTAL);

            return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
        }

        const [session, tenant]: [PortalSession, Awaited<ReturnType<typeof loadTenant>>] =
            await Promise.all([
                requirePortalSession(PORTAL),
                loadTenant(cookieSession.organizationId),
            ]);

        if (!tenant || session.organizationId !== cookieSession.organizationId) {
            return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
        }

        ctx = {
            organizationId: session.organizationId,
            userId: actorIdOf(session, cookieSession),
            timezone: tenant.timezone,
            clinicIds: tenant.clinicIds,
        };
    } catch (error) {
        if (isNextRedirect(error)) throw error;

        console.error(`[${action}] authorization failed`, error);

        return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
    }

    try {
        return await handler(ctx);
    } catch (error) {
        if (isNextRedirect(error)) throw error;

        return failure<T>(action, error);
    }
}

async function writeAudit(
    ctx: Ctx,
    input: {
        actionType: AuditActionType;
        targetTable: string;
        recordId: string;
        clinicId?: string | null;
        metadata?: Prisma.InputJsonObject;
    },
): Promise<void> {
    if (!ctx.userId) return;

    try {
        await prisma.auditLog.create({
            data: {
                organizationId: ctx.organizationId,
                clinicId: input.clinicId ?? null,
                userId: ctx.userId,
                actionType: input.actionType,
                targetTable: input.targetTable,
                recordId: input.recordId,
                metadata: input.metadata,
            },
        });
    } catch (error) {
        console.error("[front-desk audit]", error);
    }
}

function revalidateFrontDesk(): void {
    try {
        revalidatePath(FRONT_DESK_PATH);
    } catch {
        // Revalidation is best-effort; the client always re-reads through server actions.
    }
}

async function withSerializableRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run();
        } catch (error) {
            if (
                attempt < 3 &&
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2034"
            ) {
                continue;
            }

            throw error;
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Time-zone helpers                                                          */
/* -------------------------------------------------------------------------- */

function safeTimeZone(value: string | null | undefined): string {
    const candidate = value && value.trim() ? value.trim() : DEFAULT_TIMEZONE;

    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate });

        return candidate;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

function zonedParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(date);

    const read = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((part) => part.type === type)?.value ?? 0);

    return {
        year: read("year"),
        month: read("month"),
        day: read("day"),
        hour: read("hour") % 24,
        minute: read("minute"),
        second: read("second"),
    };
}

function tzOffsetMs(date: Date, timeZone: string): number {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` (minutes after local midnight) to a UTC instant. */
function wallTimeToUtc(
    year: number,
    month: number,
    day: number,
    minutes: number,
    timeZone: string,
): Date {
    const guess = Date.UTC(year, month - 1, day, 0, minutes);
    const firstOffset = tzOffsetMs(new Date(guess), timeZone);
    let result = guess - firstOffset;
    const secondOffset = tzOffsetMs(new Date(result), timeZone);

    if (secondOffset !== firstOffset) result = guess - secondOffset;

    return new Date(result);
}

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

function zonedDateString(date: Date, timeZone: string): string {
    const p = zonedParts(date, timeZone);

    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function parseDateString(value: string): { y: number; m: number; d: number } | null {
    if (!DATE_PATTERN.test(value)) return null;

    const [yearText, monthText, dayText] = value.split("-");
    const y = Number(yearText);
    const m = Number(monthText);
    const d = Number(dayText);
    const check = new Date(Date.UTC(y, m - 1, d));

    if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== m - 1 ||
        check.getUTCDate() !== d
    ) {
        return null;
    }

    return { y, m, d };
}

function addDaysToDateString(value: string, days: number): string {
    const parsed = parseDateString(value);

    if (!parsed) return value;

    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d + days)).toISOString().slice(0, 10);
}

function dayRange(
    parsed: { y: number; m: number; d: number },
    timeZone: string,
): { start: Date; end: Date } {
    return {
        start: wallTimeToUtc(parsed.y, parsed.m, parsed.d, 0, timeZone),
        end: wallTimeToUtc(parsed.y, parsed.m, parsed.d + 1, 0, timeZone),
    };
}

/* -------------------------------------------------------------------------- */
/* Snapshot (KPIs + live queue + NPHIES feed)                                 */
/* -------------------------------------------------------------------------- */

function maskNationalId(value: string): string {
    const id = value.trim();

    return id.length >= 8 ? `${id.slice(0, 4)}****${id.slice(-2)}` : id;
}

function currentNphiesMode(): FrontDeskNphiesMode {
    try {
        return resolveNphiesMode();
    } catch {
        return "SIMULATOR";
    }
}

interface LatestNphiesTx {
    transactionType: NphiesTransactionType;
    status: NphiesTransactionStatus;
    referenceNumber: string;
    createdAt: Date;
    /** Eligibility "complete" response whose policy is not active. */
    policyInactive: boolean;
}

function coverageStateFor(hasProvider: boolean, latest: LatestNphiesTx | undefined): CoverageState {
    if (!hasProvider) return "CASH";
    if (!latest) return "NOT_VERIFIED";

    switch (latest.status) {
        case "COMPLETE":
            return latest.policyInactive ? "INELIGIBLE" : "ELIGIBLE";
        case "QUEUED":
            return "PRE_AUTH_PENDING";
        case "PARTIAL":
            return "PARTIAL";
        case "ERROR":
            return "INELIGIBLE";
        default:
            return "NOT_VERIFIED";
    }
}

function isJsonObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCopayPercentage(payload: Prisma.JsonValue): number | null {
    if (!isJsonObject(payload)) return null;

    const portal = payload["portalResult"];

    if (!isJsonObject(portal)) return null;

    const value = portal["copayPercentage"];

    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPolicyInactive(payload: Prisma.JsonValue): boolean {
    if (!isJsonObject(payload)) return false;

    const portal = payload["portalResult"];

    if (!isJsonObject(portal)) return false;

    return portal["policyStatus"] === "not-active";
}

async function buildSnapshot(ctx: Ctx): Promise<FrontDeskSnapshot> {
    const now = new Date();
    const today = zonedDateString(now, ctx.timezone);
    const parsedToday = parseDateString(today);

    if (!parsedToday) throw new Error("Unable to resolve today's date.");

    const { start, end } = dayRange(parsedToday, ctx.timezone);

    const appointments = await prisma.appointment.findMany({
        where: {
            organizationId: ctx.organizationId,
            clinicId: { in: ctx.clinicIds },
            scheduledAt: { gte: start, lt: end },
            status: { notIn: INACTIVE_STATUSES },
        },
        orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
        take: QUEUE_CAP,
        select: {
            id: true,
            status: true,
            scheduledAt: true,
            isLocked: true,
            patient: {
                select: {
                    id: true,
                    fileNumber: true,
                    nationalId: true,
                    fullNameEn: true,
                    fullNameAr: true,
                    phone: true,
                    insuranceProviderId: true,
                    insuranceProvider: { select: { nameEn: true, nameAr: true } },
                    insurancePolicy: { select: { nameEn: true, nameAr: true } },
                },
            },
            doctor: {
                select: {
                    fullNameEn: true,
                    fullNameAr: true,
                    specialtyEn: true,
                    specialtyAr: true,
                },
            },
            clinic: { select: { id: true, nameEn: true, nameAr: true } },
            invoices: {
                select: { id: true },
                orderBy: { createdAt: "desc" },
                take: 1,
            },
        },
    });

    const nationalIds = [
        ...new Set(appointments.map((appointment) => appointment.patient.nationalId.trim())),
    ];

    const [transactions, inactiveRows, feedRows] = await Promise.all([
        nationalIds.length > 0
            ? prisma.nphiesTransaction.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    patientNationalId: { in: nationalIds },
                    transactionType: {
                        in: [
                            NphiesTransactionType.ELIGIBILITY,
                            NphiesTransactionType.PRE_AUTHORIZATION,
                        ],
                    },
                    createdAt: { gte: start },
                },
                orderBy: { createdAt: "desc" },
                take: 3000,
                select: {
                    id: true,
                    patientNationalId: true,
                    transactionType: true,
                    status: true,
                    referenceNumber: true,
                    createdAt: true,
                },
            })
            : Promise.resolve([]),
        // Ids only: eligibility responses (stored by lib/nphies) whose policy is not active.
        nationalIds.length > 0
            ? prisma.nphiesTransaction.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    patientNationalId: { in: nationalIds },
                    transactionType: NphiesTransactionType.ELIGIBILITY,
                    createdAt: { gte: start },
                    responsePayload: {
                        path: ["portalResult", "policyStatus"],
                        equals: "not-active",
                    },
                },
                take: 3000,
                select: { id: true },
            })
            : Promise.resolve([]),
        prisma.nphiesTransaction.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            take: FEED_LIMIT,
            select: {
                id: true,
                transactionType: true,
                status: true,
                referenceNumber: true,
                patientNationalId: true,
                responsePayload: true,
                createdAt: true,
            },
        }),
    ]);

    const inactiveIds = new Set<string>();

    for (const row of inactiveRows) {
        inactiveIds.add(row.id);
    }

    // Rows are ordered newest-first, so the first one seen per patient is the latest.
    const latestByNationalId = new Map<string, LatestNphiesTx>();

    for (const tx of transactions) {
        const key = tx.patientNationalId.trim();

        if (!latestByNationalId.has(key)) {
            latestByNationalId.set(key, {
                transactionType: tx.transactionType,
                status: tx.status,
                referenceNumber: tx.referenceNumber,
                createdAt: tx.createdAt,
                policyInactive: inactiveIds.has(tx.id),
            });
        }
    }

    const feedNationalIds = [...new Set(feedRows.map((row) => row.patientNationalId.trim()))];

    const feedPatients =
        feedNationalIds.length > 0
            ? await prisma.patient.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                    nationalId: { in: feedNationalIds },
                },
                select: { nationalId: true, fullNameEn: true, fullNameAr: true },
            })
            : [];

    const feedPatientByNationalId = new Map(
        feedPatients.map((patient) => [patient.nationalId.trim(), patient] as const),
    );

    const queue: QueueItem[] = appointments.map((appointment, index) => {
        const patient = appointment.patient;
        const nationalId = patient.nationalId.trim();
        const latest = latestByNationalId.get(nationalId);
        const state = coverageStateFor(patient.insuranceProviderId !== null, latest);
        const token = `#A${String(index + 1).padStart(2, "0")}`;
        const payerNameEn = patient.insuranceProvider?.nameEn ?? null;
        const payerNameAr = patient.insuranceProvider?.nameAr ?? null;

        return {
            id: appointment.id,
            token,
            scheduledAt: appointment.scheduledAt.toISOString(),
            status: appointment.status,
            isLocked: appointment.isLocked,
            allowedNext: RECEPTION_TRANSITIONS[appointment.status],
            patientId: patient.id,
            patientNameEn: patient.fullNameEn,
            patientNameAr: patient.fullNameAr,
            nationalIdMasked: maskNationalId(nationalId),
            fileNumber: patient.fileNumber,
            doctorNameEn: appointment.doctor.fullNameEn,
            doctorNameAr: appointment.doctor.fullNameAr,
            specialtyEn: appointment.doctor.specialtyEn,
            specialtyAr: appointment.doctor.specialtyAr,
            clinicId: appointment.clinic.id,
            clinicNameEn: appointment.clinic.nameEn,
            clinicNameAr: appointment.clinic.nameAr,
            coverage: {
                state,
                payerNameEn,
                payerNameAr,
                policyName: patient.insurancePolicy?.nameEn ?? null,
                referenceNumber: latest?.referenceNumber ?? null,
                checkedAt: latest ? latest.createdAt.toISOString() : null,
            },
            invoiceId: appointment.invoices[0]?.id ?? null,
            searchText: [
                patient.fullNameEn,
                patient.fullNameAr,
                nationalId,
                patient.fileNumber,
                patient.phone ?? "",
                appointment.doctor.fullNameEn,
                appointment.doctor.fullNameAr,
                appointment.clinic.nameEn,
                appointment.clinic.nameAr,
                payerNameEn ?? "",
                payerNameAr ?? "",
                token,
            ]
                .join(" ")
                .toLowerCase(),
        };
    });

    const kpis: FrontDeskKpis = {
        totalToday: queue.length,
        completed: queue.filter((item) => item.status === "COMPLETED").length,
        upcoming: queue.filter((item) => item.status === "SCHEDULED" || item.status === "CONFIRMED")
            .length,
        waiting: queue.filter((item) => item.status === "WAITING").length,
        nphiesEligible: queue.filter((item) => item.coverage.state === "ELIGIBLE").length,
        nphiesAuthPending: queue.filter((item) => item.coverage.state === "PRE_AUTH_PENDING").length,
        pendingBilling: queue.filter((item) => item.status === "COMPLETED" && item.invoiceId === null)
            .length,
    };

    const feed: NphiesFeedItem[] = feedRows.map((row) => {
        const patient = feedPatientByNationalId.get(row.patientNationalId.trim());

        return {
            id: row.id,
            transactionType: row.transactionType,
            status: row.status,
            referenceNumber: row.referenceNumber,
            patientNameEn: patient?.fullNameEn ?? null,
            patientNameAr: patient?.fullNameAr ?? null,
            copayPercentage: readCopayPercentage(row.responsePayload),
            policyInactive:
                row.transactionType === NphiesTransactionType.ELIGIBILITY &&
                readPolicyInactive(row.responsePayload),
            createdAt: row.createdAt.toISOString(),
        };
    });

    return {
        organizationId: ctx.organizationId,
        timezone: ctx.timezone,
        today,
        generatedAt: now.toISOString(),
        nphiesMode: currentNphiesMode(),
        kpis,
        queue,
        feed,
    };
}

export async function getFrontDeskSnapshotAction(): Promise<
    FrontDeskActionResult<FrontDeskSnapshot>
> {
    return withSession("getFrontDeskSnapshotAction", async (ctx) => ({
        success: true,
        data: await buildSnapshot(ctx),
    }));
}

/* -------------------------------------------------------------------------- */
/* Booking reference data (clinics, doctors, patients, slots)                 */
/* -------------------------------------------------------------------------- */

export async function getBookingOptionsAction(): Promise<
    FrontDeskActionResult<BookingOptionsData>
> {
    return withSession("getBookingOptionsAction", async (ctx) => {
        const clinics = await prisma.clinic.findMany({
            where: { organizationId: ctx.organizationId, isActive: true },
            select: { id: true, nameEn: true, nameAr: true },
            orderBy: { nameEn: "asc" },
        });

        const activeClinicIds = clinics.map((clinic) => clinic.id);

        const doctorRows =
            activeClinicIds.length === 0
                ? []
                : await prisma.doctor.findMany({
                    where: {
                        organizationId: ctx.organizationId,
                        clinicId: { in: activeClinicIds },
                        isActive: true,
                    },
                    select: {
                        id: true,
                        clinicId: true,
                        fullNameEn: true,
                        fullNameAr: true,
                        specialtyEn: true,
                        specialtyAr: true,
                        presence: true,
                        _count: { select: { shifts: { where: { isActive: true } } } },
                    },
                    orderBy: [{ fullNameEn: "asc" }, { id: "asc" }],
                });

        const doctors: BookingDoctorOption[] = [];

        for (const doctor of doctorRows) {
            if (doctor.clinicId === null) continue;

            doctors.push({
                id: doctor.id,
                clinicId: doctor.clinicId,
                fullNameEn: doctor.fullNameEn,
                fullNameAr: doctor.fullNameAr,
                specialtyEn: doctor.specialtyEn,
                specialtyAr: doctor.specialtyAr,
                presence: doctor.presence,
                hasActiveShifts: doctor._count.shifts > 0,
            });
        }

        return { success: true, data: { clinics, doctors } };
    });
}

export async function searchPatientsAction(
    query: string,
): Promise<FrontDeskActionResult<PatientSearchRow[]>> {
    return withSession("searchPatientsAction", async (ctx) => {
        const term = cleanText(query).slice(0, 80);

        if (term.length < 2) return { success: true, data: [] };

        const rows = await prisma.patient.findMany({
            where: {
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                OR: [
                    { fullNameEn: { contains: term, mode: "insensitive" } },
                    { fullNameAr: { contains: term, mode: "insensitive" } },
                    { fileNumber: { contains: term, mode: "insensitive" } },
                    { nationalId: { contains: term } },
                    { phone: { contains: term } },
                ],
            },
            orderBy: [{ fullNameEn: "asc" }, { id: "asc" }],
            take: PATIENT_SEARCH_LIMIT,
            select: {
                id: true,
                fileNumber: true,
                nationalId: true,
                fullNameEn: true,
                fullNameAr: true,
                phone: true,
                insuranceProvider: { select: { nameEn: true, nameAr: true } },
            },
        });

        return {
            success: true,
            data: rows.map((row) => ({
                id: row.id,
                fileNumber: row.fileNumber,
                nationalIdMasked: maskNationalId(row.nationalId),
                fullNameEn: row.fullNameEn,
                fullNameAr: row.fullNameAr,
                phone: row.phone,
                payerNameEn: row.insuranceProvider?.nameEn ?? null,
                payerNameAr: row.insuranceProvider?.nameAr ?? null,
            })),
        };
    });
}

export async function getAvailableSlotsAction(input: {
    doctorId: string;
    date: string;
}): Promise<FrontDeskActionResult<AvailableSlotsData>> {
    return withSession("getAvailableSlotsAction", async (ctx) => {
        const doctorId = cleanText(input?.doctorId);
        const date = cleanText(input?.date);

        if (!validUuid(doctorId)) return invalid("Select a valid doctor.", "INVALID_DOCTOR");

        const parsed = parseDateString(date);

        if (!parsed) return invalid("Select a valid date.", "INVALID_DATE");

        const today = zonedDateString(new Date(), ctx.timezone);

        if (date < today || date > addDaysToDateString(today, MAX_BOOKING_DAYS_AHEAD)) {
            return invalid("The selected date is outside the booking window.", "INVALID_DATE");
        }

        const doctor = await prisma.doctor.findFirst({
            where: {
                id: doctorId,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                isActive: true,
            },
            select: { id: true, clinicId: true },
        });

        if (!doctor || !doctor.clinicId) {
            return invalid("The selected doctor is not available.", "DOCTOR_NOT_AVAILABLE");
        }

        const weekday = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).getUTCDay();
        const { start, end } = dayRange(parsed, ctx.timezone);

        const [shifts, booked] = await Promise.all([
            prisma.shift.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    clinicId: doctor.clinicId,
                    doctorId: doctor.id,
                    isActive: true,
                    daysOfWeek: { has: weekday },
                    service: { is: { isActive: true } },
                },
                select: {
                    id: true,
                    serviceId: true,
                    startMinute: true,
                    endMinute: true,
                    slotDurationMinutes: true,
                    service: { select: { nameEn: true, nameAr: true } },
                },
            }),
            prisma.appointment.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                    doctorId: doctor.id,
                    scheduledAt: { gte: start, lt: end },
                    status: { notIn: INACTIVE_STATUSES },
                },
                select: { scheduledAt: true },
            }),
        ]);

        const bookedMs = booked.map((appointment) => appointment.scheduledAt.getTime());
        const nowMs = Date.now();
        const slots: SlotOption[] = [];

        for (const shift of shifts) {
            const duration = shift.slotDurationMinutes;

            if (!Number.isInteger(duration) || duration <= 0) continue;

            for (
                let minute = shift.startMinute;
                minute + duration <= shift.endMinute;
                minute += duration
            ) {
                const instant = wallTimeToUtc(parsed.y, parsed.m, parsed.d, minute, ctx.timezone);
                const startMs = instant.getTime();

                if (startMs <= nowMs) continue;

                const taken = bookedMs.some(
                    (value) => value >= startMs && value < startMs + duration * 60_000,
                );

                if (taken) continue;

                slots.push({
                    shiftId: shift.id,
                    serviceId: shift.serviceId,
                    serviceNameEn: shift.service.nameEn,
                    serviceNameAr: shift.service.nameAr,
                    startMinute: minute,
                    startIso: instant.toISOString(),
                    durationMinutes: duration,
                });
            }
        }

        slots.sort(
            (a, b) =>
                a.startIso.localeCompare(b.startIso) || a.shiftId.localeCompare(b.shiftId),
        );

        return { success: true, data: { date, slots } };
    });
}

/* -------------------------------------------------------------------------- */
/* Mutations: appointments                                                    */
/* -------------------------------------------------------------------------- */

export async function createAppointmentAction(
    input: CreateAppointmentInput,
): Promise<FrontDeskActionResult<AppointmentMutationData>> {
    return withSession("createAppointmentAction", async (ctx) => {
        const patientId = cleanText(input?.patientId);
        const doctorId = cleanText(input?.doctorId);
        const shiftId = cleanText(input?.shiftId);
        const date = cleanText(input?.date);
        const startMinute = Number(input?.startMinute);
        const reason = cleanText(input?.reason);

        if (!validUuid(patientId)) return invalid("Select a patient.", "INVALID_PATIENT");
        if (!validUuid(doctorId)) return invalid("Select a valid doctor.", "INVALID_DOCTOR");
        if (!validUuid(shiftId)) return invalid("Select a time slot.", "INVALID_SLOT");
        if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 1440) {
            return invalid("Select a time slot.", "INVALID_SLOT");
        }
        if (reason.length > 500) {
            return invalid("The reason for visit is too long.", "INVALID_REASON");
        }

        const parsed = parseDateString(date);

        if (!parsed) return invalid("Select a valid date.", "INVALID_DATE");

        const today = zonedDateString(new Date(), ctx.timezone);

        if (date < today || date > addDaysToDateString(today, MAX_BOOKING_DAYS_AHEAD)) {
            return invalid("The selected date is outside the booking window.", "INVALID_DATE");
        }

        const shift = await prisma.shift.findFirst({
            where: {
                id: shiftId,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                doctorId,
                isActive: true,
                service: { is: { isActive: true } },
            },
            select: {
                id: true,
                clinicId: true,
                daysOfWeek: true,
                startMinute: true,
                endMinute: true,
                slotDurationMinutes: true,
            },
        });

        if (!shift) return invalid("The selected slot is no longer available.", "SLOT_UNAVAILABLE");

        const weekday = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).getUTCDay();
        const duration = shift.slotDurationMinutes;

        const onGrid =
            duration > 0 &&
            startMinute >= shift.startMinute &&
            startMinute + duration <= shift.endMinute &&
            (startMinute - shift.startMinute) % duration === 0;

        if (!shift.daysOfWeek.includes(weekday) || !onGrid) {
            return invalid("The selected slot is no longer available.", "SLOT_UNAVAILABLE");
        }

        const scheduledAt = wallTimeToUtc(parsed.y, parsed.m, parsed.d, startMinute, ctx.timezone);

        if (scheduledAt.getTime() <= Date.now()) {
            return invalid("The selected slot is in the past.", "SLOT_IN_PAST");
        }

        const slotEnd = new Date(scheduledAt.getTime() + duration * 60_000);

        const created = await withSerializableRetry(() =>
            prisma.$transaction(
                async (tx) => {
                    const [patient, doctor, clinic] = await Promise.all([
                        tx.patient.findFirst({
                            where: {
                                id: patientId,
                                organizationId: ctx.organizationId,
                                clinicId: { in: ctx.clinicIds },
                            },
                            select: { id: true },
                        }),
                        tx.doctor.findFirst({
                            where: {
                                id: doctorId,
                                organizationId: ctx.organizationId,
                                clinicId: shift.clinicId,
                                isActive: true,
                            },
                            select: { id: true },
                        }),
                        tx.clinic.findFirst({
                            where: {
                                id: shift.clinicId,
                                organizationId: ctx.organizationId,
                                isActive: true,
                            },
                            select: { id: true },
                        }),
                    ]);

                    if (!patient) throw new ActionFailure("The selected patient was not found.", "PATIENT_NOT_FOUND");
                    if (!doctor) throw new ActionFailure("The selected doctor is not available.", "DOCTOR_NOT_AVAILABLE");
                    if (!clinic) throw new ActionFailure("The selected clinic is inactive.", "CLINIC_NOT_AVAILABLE");

                    const [doctorBusy, patientBusy] = await Promise.all([
                        tx.appointment.count({
                            where: {
                                organizationId: ctx.organizationId,
                                clinicId: { in: ctx.clinicIds },
                                doctorId: doctor.id,
                                scheduledAt: { gte: scheduledAt, lt: slotEnd },
                                status: { notIn: INACTIVE_STATUSES },
                            },
                        }),
                        tx.appointment.count({
                            where: {
                                organizationId: ctx.organizationId,
                                clinicId: { in: ctx.clinicIds },
                                patientId: patient.id,
                                scheduledAt: { gte: scheduledAt, lt: slotEnd },
                                status: { notIn: INACTIVE_STATUSES },
                            },
                        }),
                    ]);

                    if (doctorBusy > 0) {
                        throw new ActionFailure("This slot was just taken. Pick another time.", "SLOT_TAKEN");
                    }

                    if (patientBusy > 0) {
                        throw new ActionFailure(
                            "This patient already has an appointment at this time.",
                            "PATIENT_BUSY",
                        );
                    }

                    return tx.appointment.create({
                        data: {
                            organizationId: ctx.organizationId,
                            clinicId: clinic.id,
                            doctorId: doctor.id,
                            patientId: patient.id,
                            createdByUserId: ctx.userId,
                            status: AppointmentStatus.SCHEDULED,
                            scheduledAt,
                            chiefComplaint: reason || null,
                        },
                        select: { id: true, status: true, scheduledAt: true, clinicId: true },
                    });
                },
                {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            ),
        );

        await writeAudit(ctx, {
            actionType: AuditActionType.CREATE,
            targetTable: "appointments",
            recordId: created.id,
            clinicId: created.clinicId,
            metadata: { source: "front-desk-quick-appointment", scheduledAt: created.scheduledAt.toISOString() },
        });

        revalidateFrontDesk();

        return {
            success: true,
            data: {
                id: created.id,
                status: created.status,
                scheduledAt: created.scheduledAt.toISOString(),
            },
        };
    });
}

export async function createWalkInAction(
    input: CreateWalkInInput,
): Promise<FrontDeskActionResult<AppointmentMutationData>> {
    return withSession("createWalkInAction", async (ctx) => {
        const patientId = cleanText(input?.patientId);
        const doctorId = cleanText(input?.doctorId);
        const reason = cleanText(input?.reason);

        if (!validUuid(patientId)) return invalid("Select a patient.", "INVALID_PATIENT");
        if (!validUuid(doctorId)) return invalid("Select a valid doctor.", "INVALID_DOCTOR");
        if (reason.length > 500) return invalid("The reason for visit is too long.", "INVALID_REASON");

        const [patient, doctor] = await Promise.all([
            prisma.patient.findFirst({
                where: {
                    id: patientId,
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                },
                select: { id: true },
            }),
            prisma.doctor.findFirst({
                where: {
                    id: doctorId,
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                    isActive: true,
                },
                select: { id: true, clinicId: true, presence: true },
            }),
        ]);

        if (!patient) return invalid("The selected patient was not found.", "PATIENT_NOT_FOUND");

        if (!doctor || !doctor.clinicId) {
            return invalid("The selected doctor is not available.", "DOCTOR_NOT_AVAILABLE");
        }

        if (doctor.presence === "OFF_DUTY") {
            return invalid("The selected doctor is off duty.", "DOCTOR_OFF_DUTY");
        }

        const clinic = await prisma.clinic.findFirst({
            where: { id: doctor.clinicId, organizationId: ctx.organizationId, isActive: true },
            select: { id: true },
        });

        if (!clinic) return invalid("The doctor's clinic is inactive.", "CLINIC_NOT_AVAILABLE");

        const now = new Date();
        const parsedToday = parseDateString(zonedDateString(now, ctx.timezone));

        if (!parsedToday) throw new Error("Unable to resolve today's date.");

        const { start, end } = dayRange(parsedToday, ctx.timezone);

        const existing = await prisma.appointment.findFirst({
            where: {
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                patientId: patient.id,
                doctorId: doctor.id,
                scheduledAt: { gte: start, lt: end },
                status: { in: ACTIVE_VISIT_STATUSES },
            },
            select: { id: true },
        });

        if (existing) {
            return invalid(
                "This patient already has an active visit with this doctor today. Check them in from the queue instead.",
                "DUPLICATE_VISIT",
            );
        }

        const created = await prisma.appointment.create({
            data: {
                organizationId: ctx.organizationId,
                clinicId: clinic.id,
                doctorId: doctor.id,
                patientId: patient.id,
                createdByUserId: ctx.userId,
                status: AppointmentStatus.WAITING,
                scheduledAt: now,
                chiefComplaint: reason || null,
            },
            select: { id: true, status: true, scheduledAt: true },
        });

        await writeAudit(ctx, {
            actionType: AuditActionType.CREATE,
            targetTable: "appointments",
            recordId: created.id,
            clinicId: clinic.id,
            metadata: { source: "front-desk-walk-in" },
        });

        revalidateFrontDesk();

        return {
            success: true,
            data: {
                id: created.id,
                status: created.status,
                scheduledAt: created.scheduledAt.toISOString(),
            },
        };
    });
}

export async function updateAppointmentStatusAction(
    input: UpdateAppointmentStatusInput,
): Promise<FrontDeskActionResult<AppointmentMutationData>> {
    return withSession("updateAppointmentStatusAction", async (ctx) => {
        const appointmentId = cleanText(input?.appointmentId);
        const next = input?.status;

        if (!validUuid(appointmentId)) {
            return invalid("The selected appointment is invalid.", "INVALID_APPOINTMENT");
        }

        if (!(Object.values(AppointmentStatus) as string[]).includes(next)) {
            return invalid("The requested status is invalid.", "INVALID_STATUS");
        }

        const current = await prisma.appointment.findFirst({
            where: {
                id: appointmentId,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
            },
            select: { id: true, clinicId: true, status: true, isLocked: true, scheduledAt: true },
        });

        if (!current) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        if (current.isLocked) {
            return invalid("This appointment is locked and cannot be changed.", "LOCKED");
        }

        if (!RECEPTION_TRANSITIONS[current.status].includes(next)) {
            return invalid(
                "This status change is not allowed for the current visit state.",
                "INVALID_TRANSITION",
            );
        }

        const now = new Date();

        // Optimistic concurrency: only update if nobody changed the status meanwhile.
        const result = await prisma.appointment.updateMany({
            where: {
                id: current.id,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                status: current.status,
                isLocked: false,
            },
            data: {
                status: next,
                ...(next === AppointmentStatus.IN_PROGRESS ? { startedAt: now } : {}),
            },
        });

        if (result.count === 0) {
            return invalid(
                "This visit was just updated by someone else. The queue has been refreshed.",
                "CONFLICT",
            );
        }

        await writeAudit(ctx, {
            actionType: AuditActionType.UPDATE,
            targetTable: "appointments",
            recordId: current.id,
            clinicId: current.clinicId,
            metadata: { from: current.status, to: next, source: "front-desk" },
        });

        revalidateFrontDesk();

        return {
            success: true,
            data: { id: current.id, status: next, scheduledAt: current.scheduledAt.toISOString() },
        };
    });
}

export async function checkInAppointmentAction(
    appointmentId: string,
): Promise<FrontDeskActionResult<AppointmentMutationData>> {
    return updateAppointmentStatusAction({ appointmentId, status: AppointmentStatus.WAITING });
}

/* -------------------------------------------------------------------------- */
/* NPHIES eligibility (unified service: @/lib/nphies)                         */
/* -------------------------------------------------------------------------- */

const eligibilityPatientSelect = {
    id: true,
    nationalId: true,
    fullNameEn: true,
    fullNameAr: true,
    insuranceProviderId: true,
    insuranceMemberId: true,
    insuranceProvider: {
        select: { nameEn: true, nameAr: true, nphiesPayerId: true, isActive: true },
    },
    insurancePolicy: {
        select: {
            nameEn: true,
            nameAr: true,
            policyNumber: true,
        },
    },
} satisfies Prisma.PatientSelect;

type EligibilityPatient = Prisma.PatientGetPayload<{ select: typeof eligibilityPatientSelect }>;

interface CoverageEvaluation {
    coverage: CoverageState;
    code: EligibilityMessageCode;
}

function identityTypeOf(nationalId: string): PortalIdentityType {
    return nationalId.startsWith("2") ? "IQAMA" : "NATIONAL_ID";
}

/** Maps the normalized `nphies.checkEligibility` response onto the Front Desk coverage state. */
function evaluateResponse(
    response: NphiesServiceResponse<EligibilityResult>,
): CoverageEvaluation {
    const result = response.result;

    if (!response.success || result === null) {
        return { coverage: "INELIGIBLE", code: "NPHIES_ERROR" };
    }

    switch (result.outcome) {
        case "queued":
            return { coverage: "PRE_AUTH_PENDING", code: "POLICY_PENDING" };
        case "partial":
            return { coverage: "PARTIAL", code: "PARTIAL_COVERAGE" };
        case "error":
            return { coverage: "INELIGIBLE", code: "NPHIES_ERROR" };
        case "complete":
            return result.policyStatus === "active"
                ? { coverage: "ELIGIBLE", code: "ELIGIBLE" }
                : { coverage: "INELIGIBLE", code: "POLICY_INACTIVE" };
    }
}

async function executeEligibility(
    ctx: Ctx,
    patient: EligibilityPatient,
    clinicId: string | null,
): Promise<EligibilityResultData> {
    const provider = patient.insuranceProvider;

    if (!patient.insuranceProviderId || !provider) {
        throw new ActionFailure(
            "This is a cash patient. There is no insurance coverage to verify.",
            "NO_COVERAGE",
        );
    }

    if (!provider.isActive) {
        throw new ActionFailure("The insurance company is inactive.", "PROVIDER_INACTIVE");
    }

    const memberId = patient.insuranceMemberId?.trim() ?? "";

    if (memberId === "") {
        throw new ActionFailure("The insurance member ID is missing.", "MISSING_MEMBER_ID");
    }

    const nationalId = patient.nationalId.trim();
    const today = zonedDateString(new Date(), ctx.timezone);
    const policyNumber = patient.insurancePolicy?.policyNumber;

    const request: EligibilityCheckRequest = {
        organizationId: ctx.organizationId,
        patient: {
            nationalId,
            identityType: identityTypeOf(nationalId),
            fullNameEn: patient.fullNameEn,
            fullNameAr: patient.fullNameAr,
            insuranceMemberId: memberId,
            ...(policyNumber ? { insurancePolicyNumber: policyNumber } : {}),
        },
        payer: {
            ...(provider.nphiesPayerId ? { nphiesPayerId: provider.nphiesPayerId } : {}),
            nameEn: provider.nameEn,
            nameAr: provider.nameAr,
        },
        serviceDate: today,
    };

    // Builds the FHIR bundle, dispatches through the NPHIES_MODE adapter (simulator / production)
    // and writes the `nphies_transactions` audit row that feeds the live NPHIES feed.
    const response = await nphies.checkEligibility(request);
    const evaluation = evaluateResponse(response);
    const result = response.result;

    const copay: EligibilityCopay | null =
        result !== null && result.copayPercentage !== null
            ? {
                type: "PERCENTAGE",
                value: result.copayPercentage,
                cap: result.consultationCopayCap,
            }
            : null;

    if (response.transactionId !== null) {
        await writeAudit(ctx, {
            actionType: AuditActionType.CREATE,
            targetTable: "nphies_transactions",
            recordId: response.transactionId,
            clinicId,
            metadata: {
                type: "ELIGIBILITY",
                status: response.status,
                mode: response.mode,
                referenceNumber: response.referenceNumber,
            },
        });
    }

    revalidateFrontDesk();

    return {
        patientId: patient.id,
        patientNameEn: patient.fullNameEn,
        patientNameAr: patient.fullNameAr,
        status: response.status,
        coverage: evaluation.coverage,
        messageCode: evaluation.code,
        messageEn: result?.statusMessageEn ?? response.error?.messageEn ?? null,
        messageAr: result?.statusMessageAr ?? response.error?.messageAr ?? null,
        cashFallbackRequired: result?.cashFallbackRequired ?? false,
        referenceNumber: response.referenceNumber,
        payerNameEn: result?.payerNameEn ?? provider.nameEn,
        payerNameAr: result?.payerNameAr ?? provider.nameAr,
        policyName: result?.planName ?? patient.insurancePolicy?.nameEn ?? null,
        copay,
        latencyMs: response.latencyMs,
        mode: response.mode,
        checkedAt: new Date().toISOString(),
    };
}

/** "Verify NPHIES" from a queue row. */
export async function verifyAppointmentNphiesAction(
    appointmentId: string,
): Promise<FrontDeskActionResult<EligibilityResultData>> {
    return withSession("verifyAppointmentNphiesAction", async (ctx) => {
        const id = cleanText(appointmentId);

        if (!validUuid(id)) return invalid("The selected appointment is invalid.", "INVALID_APPOINTMENT");

        const appointment = await prisma.appointment.findFirst({
            where: {
                id,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
            },
            select: {
                clinicId: true,
                patient: { select: eligibilityPatientSelect },
            },
        });

        if (!appointment) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const data = await executeEligibility(ctx, appointment.patient, appointment.clinicId);

        return { success: true, data };
    });
}

/** "Instant NPHIES Eligibility Check" by National ID / Iqama. */
export async function checkEligibilityByNationalIdAction(
    nationalIdInput: string,
): Promise<FrontDeskActionResult<EligibilityResultData>> {
    return withSession("checkEligibilityByNationalIdAction", async (ctx) => {
        const nationalId = cleanText(nationalIdInput);

        if (!NATIONAL_ID_PATTERN.test(nationalId)) {
            return invalid(
                "Enter a valid 10-digit Saudi national ID or Iqama number.",
                "INVALID_NATIONAL_ID",
            );
        }

        const patient = await prisma.patient.findFirst({
            where: {
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                nationalId,
            },
            select: { ...eligibilityPatientSelect, clinicId: true },
        });

        if (!patient) {
            return invalid(
                "No registered patient was found with this ID. Register the patient first.",
                "PATIENT_NOT_FOUND",
            );
        }

        const data = await executeEligibility(ctx, patient, patient.clinicId);

        return { success: true, data };
    });
}