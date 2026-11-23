// ============================================================================
// app/(reception)/reception/patients/actions.ts
// Reception Portal — Patients Directory & NPHIES Profiles: server actions & queries.
//
// Schema: NO CHANGES required.
//  - NPHIES status is derived (never stored) from the latest ELIGIBILITY row in
//    `nphies_transactions` (+ policy expiry fallback), so it is always consistent with the audit log.
//  - Nationality is derived from the identity type (NATIONAL_ID => Saudi, 0% VAT medical exemption;
//    IQAMA => resident, 15% VAT). The VAT rate itself is decided on the server only.
//  - `Patient.clinicId` is required by the schema; new patients are registered under the session's
//    active clinic (when it belongs to the tenant) or else the organization's oldest active clinic
//    (patients are organization-wide in practice).
//
// Tenant guard:
//  - The Prisma tenant guard (`assertTenantFilter`) requires `clinicId` in the `where` of EVERY
//    Patient read / update. Every Patient query in this file therefore carries
//    `clinicId: { in: ctx.clinicIds }` (all clinics of the tenant) or the exact clinic of the
//    already-loaded patient record, in addition to `organizationId`.
//
// Directory loading:
//  - `getPatientsDirectoryAction()` returns the whole directory (capped at DIRECTORY_MAX_ROWS) in ONE
//    round-trip. Search, coverage / NPHIES filters, sorting and pagination run in memory on the client.
//    The client only re-reads after a real mutation (create / edit / verify / book visit).
//
// Conventions (same as the Front Desk module):
//  - requirePortalSession("reception") + getSession(); every query is scoped by organizationId
//    AND clinicId IN (tenant clinics).
//  - NPHIES calls go exclusively through `nphies.checkEligibility` from "@/lib/nphies"
//    (NPHIES_MODE selects SIMULATOR / PRODUCTION and the service persists the audit row).
// ============================================================================
"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, AuditActionType, Prisma } from "@prisma/client";
import type {
    DoctorPresence,
    Gender,
    IdentityType,
    NphiesTransactionStatus,
    NphiesTransactionType,
    PolicyCopayType,
    ZatcaInvoiceType,
    ZatcaResponseStatus,
} from "@prisma/client";
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
    type PortalPatient,
} from "@/lib/nphies";

/* -------------------------------------------------------------------------- */
/* Constants (module-private: "use server" files may only export async fns)  */
/* -------------------------------------------------------------------------- */

const PORTAL = "reception" as const;
const PATIENTS_PATH = "/reception/patients";
const DEFAULT_TIMEZONE = "Asia/Riyadh";
const DIRECTORY_MAX_ROWS = 5000;
const MAX_BOOKING_DAYS_AHEAD = 60;
const RECENT_VERIFICATION_MS = 30 * 60 * 1000;
const PROFILE_LIST_LIMIT = 30;

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NAME_EN_PATTERN = /^[A-Za-z][A-Za-z\s'.-]{1,99}$/;
const NAME_AR_PATTERN = /^[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\s'.-]{1,99}$/;

const COVERAGE_FILTERS = ["ALL", "INSURED", "CASH"] as const;
const NPHIES_FILTERS = ["ALL", "ELIGIBLE", "PENDING", "EXPIRED", "NO_COVERAGE"] as const;
const SORT_KEYS = ["created", "nationalId", "insurance"] as const;
const SORT_DIRS = ["asc", "desc"] as const;

const INACTIVE_STATUSES: AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type PatientFormField =
    | "fullNameEn"
    | "fullNameAr"
    | "identityType"
    | "nationalId"
    | "dateOfBirth"
    | "gender"
    | "phone"
    | "payerId"
    | "policyId"
    | "memberId";

export interface PatientsActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    field?: PatientFormField;
}

export type NphiesPatientState = "ELIGIBLE" | "PENDING" | "EXPIRED" | "NO_COVERAGE";
export type PatientCoverageFilter = (typeof COVERAGE_FILTERS)[number];
export type PatientNphiesFilter = (typeof NPHIES_FILTERS)[number];
export type PatientSortKey = (typeof SORT_KEYS)[number];
export type PatientSortDir = (typeof SORT_DIRS)[number];
export type PatientResidency = "SAUDI" | "RESIDENT";
export type EligibilityState = "ELIGIBLE" | "PENDING" | "EXPIRED" | "ERROR";

export interface PatientCopay {
    kind: "PERCENT" | "FIXED";
    value: number;
    /** Maximum patient share per consultation (SAR), when defined. */
    cap: number | null;
}

export interface PatientRow {
    id: string;
    fileNumber: string;
    fullNameEn: string;
    fullNameAr: string;
    nationalIdMasked: string;
    /**
     * Full ID number used ONLY for in-memory search / sorting on the client (never rendered).
     * Receptionists can already search and edit by full ID, so this adds no new access.
     */
    nationalIdSearch: string;
    identityType: IdentityType;
    residency: PatientResidency;
    vatRate: number;
    phone: string | null;
    ageYears: number | null;
    gender: Gender | null;
    insured: boolean;
    payerId: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyNameEn: string | null;
    policyNameAr: string | null;
    policyExpiry: string | null;
    nphiesState: NphiesPatientState;
    copay: PatientCopay | null;
    lastVerifiedAt: string | null;
    lastReference: string | null;
    /** ISO timestamp of registration (default directory sort). */
    createdAt: string;
}

export interface PatientDirectoryStats {
    total: number;
    insured: number;
    cash: number;
    insuredPercent: number;
    cashPercent: number;
}

export interface PatientDirectoryData {
    /** The whole directory (newest first), capped at DIRECTORY_MAX_ROWS. */
    rows: PatientRow[];
    /** True when the tenant has more patients than were returned in `rows`. */
    truncated: boolean;
    /** Database-wide statistics (authoritative when `truncated` is true). */
    stats: PatientDirectoryStats;
    nphiesMode: NphiesMode;
    timezone: string;
}

export interface PolicyOption {
    id: string;
    nameEn: string;
    nameAr: string | null;
    policyNumber: string;
    expired: boolean;
    expiryDate: string | null;
    copayType: PolicyCopayType;
    copayValue: number;
    maxPatientShare: number | null;
}

export interface PayerOption {
    id: string;
    nameEn: string;
    nameAr: string;
    policies: PolicyOption[];
}

export interface PatientFormOptions {
    payers: PayerOption[];
    today: string;
}

export interface PatientFormInput {
    id?: string;
    fullNameEn: string;
    fullNameAr: string;
    identityType: IdentityType;
    nationalId: string;
    dateOfBirth: string;
    gender: Gender | "";
    phone: string;
    insured: boolean;
    payerId: string;
    policyId: string;
    memberId: string;
    /** Reference of an eligibility check just performed in the modal (skips the automatic re-check). */
    eligibilityReference?: string | null;
}

export interface PatientFormValues {
    id: string;
    fullNameEn: string;
    fullNameAr: string;
    identityType: IdentityType;
    nationalId: string;
    dateOfBirth: string;
    gender: Gender | "";
    phone: string;
    insured: boolean;
    payerId: string;
    policyId: string;
    memberId: string;
}

export interface DraftEligibilityInput {
    identityType: IdentityType;
    nationalId: string;
    fullNameEn: string;
    fullNameAr: string;
    dateOfBirth: string;
    gender: Gender | "";
    phone: string;
    payerId: string;
    policyId: string;
    memberId: string;
}

export interface EligibilityCheckData {
    state: EligibilityState;
    active: boolean;
    messageEn: string | null;
    messageAr: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    planName: string | null;
    copay: PatientCopay | null;
    coverageLimit: number | null;
    benefitEnd: string | null;
    cashFallbackRequired: boolean;
    referenceNumber: string;
    mode: NphiesMode;
    latencyMs: number;
    checkedAt: string;
}

export interface VerifyPatientData {
    row: PatientRow;
    eligibility: EligibilityCheckData;
}

export interface SavePatientData {
    row: PatientRow;
}

export interface ProfileVisit {
    id: string;
    scheduledAt: string;
    status: AppointmentStatus;
    isUpcoming: boolean;
    doctorNameEn: string;
    doctorNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    clinicNameEn: string;
    clinicNameAr: string;
}

export type ProfileZatcaStatus = ZatcaResponseStatus | "NOT_SUBMITTED";

export interface ProfileInvoice {
    id: string;
    reference: string;
    issuedAt: string;
    subTotal: number;
    vatRate: number;
    vatAmount: number;
    grandTotal: number;
    vatExempt: boolean;
    zatcaStatus: ProfileZatcaStatus;
    invoiceType: ZatcaInvoiceType | null;
    isInsurance: boolean;
    payerName: string | null;
}

export interface ProfileNphiesEntry {
    id: string;
    transactionType: NphiesTransactionType;
    status: NphiesTransactionStatus;
    referenceNumber: string;
    createdAt: string;
    mode: string;
    latencyMs: number;
    policyActive: boolean | null;
    copayPercentage: number | null;
    preAuthRef: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    messageEn: string | null;
    messageAr: string | null;
}

export interface PatientProfileData {
    row: PatientRow;
    dateOfBirth: string | null;
    memberIdMasked: string | null;
    registeredAt: string;
    timezone: string;
    visits: ProfileVisit[];
    invoices: ProfileInvoice[];
    nphiesLog: ProfileNphiesEntry[];
}

export interface VisitClinicOption {
    id: string;
    nameEn: string;
    nameAr: string;
}

export interface VisitDoctorOption {
    id: string;
    clinicId: string;
    fullNameEn: string;
    fullNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    presence: DoctorPresence;
    hasActiveShifts: boolean;
}

export interface VisitBookingOptions {
    clinics: VisitClinicOption[];
    doctors: VisitDoctorOption[];
    today: string;
    maxDate: string;
    timezone: string;
}

export interface VisitSlot {
    shiftId: string;
    serviceId: string;
    serviceNameEn: string;
    serviceNameAr: string;
    startMinute: number;
    startIso: string;
    durationMinutes: number;
}

export interface VisitSlotsData {
    date: string;
    timezone: string;
    slots: VisitSlot[];
}

export interface BookVisitInput {
    patientId: string;
    doctorId: string;
    shiftId: string;
    date: string;
    startMinute: number;
    reason?: string;
}

export interface BookedVisitData {
    id: string;
    status: AppointmentStatus;
    scheduledAt: string;
}

/* -------------------------------------------------------------------------- */
/* Infrastructure helpers                                                     */
/* -------------------------------------------------------------------------- */

class ActionFailure extends Error {
    readonly code: string;
    readonly field: PatientFormField | undefined;

    constructor(message: string, code: string, field?: PatientFormField) {
        super(message);
        this.name = "ActionFailure";
        this.code = code;
        this.field = field;
    }
}

interface Ctx {
    organizationId: string;
    userId: string | null;
    timezone: string;
    /** Every clinic of the tenant: the clinic scope used in every Patient `where` (tenant guard). */
    clinicIds: string[];
    /** The session's active clinic when it belongs to the tenant (preferred registration clinic). */
    activeClinicId: string | null;
}

type PortalSession = Awaited<ReturnType<typeof requirePortalSession>>;

function invalid<T>(error: string, code = "INVALID_INPUT", field?: PatientFormField): PatientsActionResult<T> {
    return { success: false, error, code, ...(field !== undefined ? { field } : {}) };
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

/** Resolves the session's active clinic, accepting it only when it belongs to the tenant. */
function clinicIdOf(clinicIds: readonly string[], ...sources: unknown[]): string | null {
    for (const source of sources) {
        const candidate = source as { activeClinicId?: unknown; clinicId?: unknown } | null;

        for (const value of [candidate?.activeClinicId, candidate?.clinicId]) {
            if (typeof value === "string" && validUuid(value) && clinicIds.includes(value)) return value;
        }
    }

    return null;
}

function uniqueTargetIncludes(error: Prisma.PrismaClientKnownRequestError, needle: string): boolean {
    const target = error.meta?.["target"];
    const haystack = Array.isArray(target) ? target.join(",") : typeof target === "string" ? target : "";

    return haystack.toLowerCase().includes(needle.toLowerCase());
}

function failure<T>(action: string, error: unknown): PatientsActionResult<T> {
    if (error instanceof ActionFailure) {
        return invalid(error.message, error.code, error.field);
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
                if (uniqueTargetIncludes(error, "national_id") || uniqueTargetIncludes(error, "nationalId")) {
                    return invalid(
                        "A patient with this ID number is already registered.",
                        "DUPLICATE_NATIONAL_ID",
                        "nationalId",
                    );
                }

                return invalid("This record already exists.", "DUPLICATE_RECORD");
            case "P2003":
                return invalid(
                    "A selected patient, doctor, payer or clinic is no longer available.",
                    "INVALID_RELATION",
                );
            case "P2025":
                return invalid(
                    "The requested record could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
            case "P2034":
                return invalid("The data changed while saving. Please try again.", "CONFLICT");
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

async function withSession<T>(
    action: string,
    handler: (ctx: Ctx) => Promise<PatientsActionResult<T>>,
): Promise<PatientsActionResult<T>> {
    let ctx: Ctx;

    try {
        const cookieSession = await getSession();

        if (!cookieSession?.organizationId) {
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
            activeClinicId: clinicIdOf(tenant.clinicIds, session, cookieSession),
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
        console.error("[patients audit]", error);
    }
}

function revalidatePatients(): void {
    try {
        revalidatePath(PATIENTS_PATH);
    } catch {
        // Best-effort: the client always re-reads through server actions.
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
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function num(value: Prisma.Decimal | null | undefined): number {
    return value === null || value === undefined ? 0 : Number(value.toString());
}

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function maskNationalId(value: string): string {
    const id = value.trim();

    return id.length >= 8 ? `${id.slice(0, 4)}****${id.slice(-2)}` : id;
}

function maskMemberId(value: string | null): string | null {
    if (value === null || value.trim() === "") return null;

    const id = value.trim();

    return id.length <= 4 ? id : `${"*".repeat(Math.max(0, id.length - 4))}${id.slice(-4)}`;
}

function toLatinDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (char) => String(char.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (char) => String(char.charCodeAt(0) - 0x06f0));
}

/** Normalizes a Saudi mobile number to +9665XXXXXXXX, or returns null when invalid. */
function normalizeSaudiMobile(raw: string): string | null {
    let digits = toLatinDigits(raw).replace(/[\s\-().+]/g, "");

    if (!/^\d+$/.test(digits)) return null;

    if (digits.startsWith("00966")) digits = digits.slice(5);
    else if (digits.startsWith("966")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);

    return /^5\d{8}$/.test(digits) ? `+966${digits}` : null;
}

function ageYears(dob: Date | null, today: string): number | null {
    if (dob === null) return null;

    const parsed = parseDateString(today);

    if (!parsed) return null;

    let age = parsed.y - dob.getUTCFullYear();
    const birthMonth = dob.getUTCMonth() + 1;

    if (parsed.m < birthMonth || (parsed.m === birthMonth && parsed.d < dob.getUTCDate())) age -= 1;

    return age >= 0 ? age : null;
}

function currentNphiesMode(): NphiesMode {
    try {
        return resolveNphiesMode();
    } catch {
        return "SIMULATOR";
    }
}

function identityTypeOf(nationalId: string): PortalIdentityType {
    return nationalId.startsWith("2") ? "IQAMA" : "NATIONAL_ID";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
    const value = record?.[key];

    return typeof value === "string" && value !== "" ? value : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
    const value = record?.[key];

    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function portalResultOf(payload: Prisma.JsonValue): Record<string, unknown> | null {
    if (!isRecord(payload)) return null;

    const portal = payload["portalResult"];

    return isRecord(portal) ? portal : null;
}

function payloadErrorOf(payload: Prisma.JsonValue): Record<string, unknown> | null {
    if (!isRecord(payload)) return null;

    const error = payload["error"];

    return isRecord(error) ? error : null;
}

function asTxStatus(value: string): NphiesTransactionStatus {
    return value === "COMPLETE" || value === "QUEUED" || value === "PARTIAL" ? value : "ERROR";
}

function parseNumeric(value: string | null): number | null {
    if (value === null) return null;

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

/* -------------------------------------------------------------------------- */
/* Row building (directory)                                                   */
/* -------------------------------------------------------------------------- */

const patientRowSelect = {
    id: true,
    fileNumber: true,
    nationalId: true,
    identityType: true,
    fullNameEn: true,
    fullNameAr: true,
    dateOfBirth: true,
    gender: true,
    phone: true,
    insuranceProviderId: true,
    insurancePolicyId: true,
    copayPercentage: true,
    copayFixedCap: true,
    createdAt: true,
    insuranceProvider: { select: { id: true, nameEn: true, nameAr: true } },
    insurancePolicy: {
        select: {
            id: true,
            nameEn: true,
            nameAr: true,
            policyNumber: true,
            copayType: true,
            copayValue: true,
            maxPatientShare: true,
            expiryDate: true,
            isActive: true,
        },
    },
} satisfies Prisma.PatientSelect;

type PatientRowRecord = Prisma.PatientGetPayload<{ select: typeof patientRowSelect }>;

interface LatestEligibility {
    status: NphiesTransactionStatus;
    createdAt: Date;
    referenceNumber: string;
    policyStatus: string | null;
    copay: number | null;
    copayCap: number | null;
}

interface LatestEligibilityRow {
    national_id: string;
    status: string;
    created_at: Date;
    reference_number: string;
    policy_status: string | null;
    copay: string | null;
    copay_cap: string | null;
}

/** Latest ELIGIBILITY audit row per national ID (one indexed DISTINCT ON query). */
async function loadLatestEligibility(
    organizationId: string,
    nationalIds: string[],
): Promise<Map<string, LatestEligibility>> {
    const unique = [...new Set(nationalIds.map((id) => id.trim()))];
    const map = new Map<string, LatestEligibility>();

    if (unique.length === 0) return map;

    const rows = await prisma.$queryRaw<LatestEligibilityRow[]>(Prisma.sql`
        SELECT DISTINCT ON (t.patient_national_id)
            t.patient_national_id AS national_id,
            t.status::text AS status,
            t.created_at AS created_at,
            t.reference_number AS reference_number,
            t.response_payload #>> '{portalResult,policyStatus}' AS policy_status,
            t.response_payload #>> '{portalResult,copayPercentage}' AS copay,
            t.response_payload #>> '{portalResult,consultationCopayCap}' AS copay_cap
        FROM nphies_transactions t
        WHERE t.organization_id = ${organizationId}::uuid
          AND t.transaction_type = 'ELIGIBILITY'
          AND t.patient_national_id IN (${Prisma.join(unique)})
        ORDER BY t.patient_national_id, t.created_at DESC
    `);

    for (const row of rows) {
        map.set(row.national_id.trim(), {
            status: asTxStatus(row.status),
            createdAt: row.created_at,
            referenceNumber: row.reference_number,
            policyStatus: row.policy_status,
            copay: parseNumeric(row.copay),
            copayCap: parseNumeric(row.copay_cap),
        });
    }

    return map;
}

/** NPHIES state derived from the latest ELIGIBILITY row (+ policy expiry fallback). */
function deriveNphiesState(
    insured: boolean,
    latest: LatestEligibility | undefined,
    policy: PatientRowRecord["insurancePolicy"],
    today: string,
): NphiesPatientState {
    if (!insured) return "NO_COVERAGE";

    if (latest) {
        if (latest.status === "COMPLETE") {
            return latest.policyStatus === "not-active" ? "EXPIRED" : "ELIGIBLE";
        }

        return "PENDING";
    }

    if (
        policy &&
        (!policy.isActive || (policy.expiryDate !== null && ymd(policy.expiryDate) < today))
    ) {
        return "EXPIRED";
    }

    return "PENDING";
}

function resolveCopay(record: PatientRowRecord): PatientCopay | null {
    if (record.copayPercentage !== null) {
        return {
            kind: "PERCENT",
            value: num(record.copayPercentage),
            cap: record.copayFixedCap !== null ? num(record.copayFixedCap) : null,
        };
    }

    const policy = record.insurancePolicy;

    if (policy) {
        if (policy.copayType === "PERCENTAGE") {
            return {
                kind: "PERCENT",
                value: num(policy.copayValue),
                cap: policy.maxPatientShare !== null ? num(policy.maxPatientShare) : null,
            };
        }

        return { kind: "FIXED", value: num(policy.copayValue), cap: null };
    }

    return null;
}

async function buildRows(ctx: Ctx, records: PatientRowRecord[]): Promise<PatientRow[]> {
    const today = zonedDateString(new Date(), ctx.timezone);
    const latestMap = await loadLatestEligibility(
        ctx.organizationId,
        records.filter((record) => record.insuranceProviderId !== null).map((record) => record.nationalId),
    );

    return records.map((record): PatientRow => {
        const insured = record.insuranceProviderId !== null;
        const nationalId = record.nationalId.trim();
        const latest = insured ? latestMap.get(nationalId) : undefined;
        const state = deriveNphiesState(insured, latest, record.insurancePolicy, today);
        const residency: PatientResidency = record.identityType === "NATIONAL_ID" ? "SAUDI" : "RESIDENT";

        return {
            id: record.id,
            fileNumber: record.fileNumber,
            fullNameEn: record.fullNameEn,
            fullNameAr: record.fullNameAr,
            nationalIdMasked: maskNationalId(nationalId),
            nationalIdSearch: nationalId,
            identityType: record.identityType,
            residency,
            vatRate: residency === "SAUDI" ? 0 : 15,
            phone: record.phone,
            ageYears: ageYears(record.dateOfBirth, today),
            gender: record.gender,
            insured,
            payerId: record.insuranceProvider?.id ?? null,
            payerNameEn: record.insuranceProvider?.nameEn ?? null,
            payerNameAr: record.insuranceProvider?.nameAr ?? null,
            policyNameEn: record.insurancePolicy?.nameEn ?? null,
            policyNameAr: record.insurancePolicy?.nameAr ?? null,
            policyExpiry: record.insurancePolicy?.expiryDate ? ymd(record.insurancePolicy.expiryDate) : null,
            nphiesState: state,
            copay: insured ? resolveCopay(record) : null,
            lastVerifiedAt: latest ? latest.createdAt.toISOString() : null,
            lastReference: latest ? latest.referenceNumber : null,
            createdAt: record.createdAt.toISOString(),
        };
    });
}

async function loadRow(ctx: Ctx, patientId: string): Promise<PatientRow | null> {
    const record = await prisma.patient.findFirst({
        where: {
            id: patientId,
            organizationId: ctx.organizationId,
            clinicId: { in: ctx.clinicIds },
        },
        select: patientRowSelect,
    });

    if (!record) return null;

    const rows = await buildRows(ctx, [record]);

    return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Directory + options                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Loads the whole directory ONCE (newest first). Search, filters, sorting and pagination are done
 * in memory on the client, so typing or changing a dropdown never triggers a server round-trip.
 */
export async function getPatientsDirectoryAction(): Promise<PatientsActionResult<PatientDirectoryData>> {
    return withSession("getPatientsDirectoryAction", async (ctx) => {
        const base: Prisma.PatientWhereInput = {
            organizationId: ctx.organizationId,
            clinicId: { in: ctx.clinicIds },
        };

        const [totalPatients, insuredPatients, records] = await Promise.all([
            prisma.patient.count({ where: base }),
            prisma.patient.count({ where: { ...base, insuranceProviderId: { not: null } } }),
            prisma.patient.findMany({
                where: base,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: DIRECTORY_MAX_ROWS + 1,
                select: patientRowSelect,
            }),
        ]);

        const truncated = records.length > DIRECTORY_MAX_ROWS;
        const rows = await buildRows(ctx, truncated ? records.slice(0, DIRECTORY_MAX_ROWS) : records);
        const cashPatients = totalPatients - insuredPatients;
        const insuredPercent = totalPatients > 0 ? Math.round((insuredPatients / totalPatients) * 100) : 0;

        return {
            success: true,
            data: {
                rows,
                truncated,
                stats: {
                    total: totalPatients,
                    insured: insuredPatients,
                    cash: cashPatients,
                    insuredPercent,
                    cashPercent: totalPatients > 0 ? 100 - insuredPercent : 0,
                },
                nphiesMode: currentNphiesMode(),
                timezone: ctx.timezone,
            },
        };
    });
}

export async function getPatientFormOptionsAction(): Promise<PatientsActionResult<PatientFormOptions>> {
    return withSession("getPatientFormOptionsAction", async (ctx) => {
        const today = zonedDateString(new Date(), ctx.timezone);

        const providers = await prisma.insuranceProvider.findMany({
            where: { organizationId: ctx.organizationId, isActive: true },
            orderBy: [{ nameEn: "asc" }, { id: "asc" }],
            select: {
                id: true,
                nameEn: true,
                nameAr: true,
                policies: {
                    where: { isActive: true },
                    orderBy: [{ nameEn: "asc" }, { id: "asc" }],
                    select: {
                        id: true,
                        nameEn: true,
                        nameAr: true,
                        policyNumber: true,
                        copayType: true,
                        copayValue: true,
                        maxPatientShare: true,
                        expiryDate: true,
                    },
                },
            },
        });

        const payers: PayerOption[] = providers.map((provider) => ({
            id: provider.id,
            nameEn: provider.nameEn,
            nameAr: provider.nameAr,
            policies: provider.policies.map((policy) => ({
                id: policy.id,
                nameEn: policy.nameEn,
                nameAr: policy.nameAr,
                policyNumber: policy.policyNumber,
                expired: policy.expiryDate !== null && ymd(policy.expiryDate) < today,
                expiryDate: policy.expiryDate ? ymd(policy.expiryDate) : null,
                copayType: policy.copayType,
                copayValue: num(policy.copayValue),
                maxPatientShare: policy.maxPatientShare !== null ? num(policy.maxPatientShare) : null,
            })),
        }));

        return { success: true, data: { payers, today } };
    });
}

export async function getPatientForEditAction(
    patientId: string,
): Promise<PatientsActionResult<PatientFormValues>> {
    return withSession("getPatientForEditAction", async (ctx) => {
        const id = cleanText(patientId);

        if (!validUuid(id)) return invalid("The selected patient is invalid.", "INVALID_PATIENT");

        const patient = await prisma.patient.findFirst({
            where: { id, organizationId: ctx.organizationId, clinicId: { in: ctx.clinicIds } },
            select: {
                id: true,
                clinicId: true,
                fullNameEn: true,
                fullNameAr: true,
                identityType: true,
                nationalId: true,
                dateOfBirth: true,
                gender: true,
                phone: true,
                insuranceProviderId: true,
                insurancePolicyId: true,
                insuranceMemberId: true,
            },
        });

        if (!patient) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        await writeAudit(ctx, {
            actionType: AuditActionType.READ,
            targetTable: "patients",
            recordId: patient.id,
            clinicId: patient.clinicId,
            metadata: { source: "patients-directory-edit" },
        });

        return {
            success: true,
            data: {
                id: patient.id,
                fullNameEn: patient.fullNameEn,
                fullNameAr: patient.fullNameAr,
                identityType: patient.identityType,
                nationalId: patient.nationalId.trim(),
                dateOfBirth: patient.dateOfBirth ? ymd(patient.dateOfBirth) : "",
                gender: patient.gender ?? "",
                phone: patient.phone ?? "",
                insured: patient.insuranceProviderId !== null,
                payerId: patient.insuranceProviderId ?? "",
                policyId: patient.insurancePolicyId ?? "",
                memberId: patient.insuranceMemberId ?? "",
            },
        };
    });
}

/* -------------------------------------------------------------------------- */
/* NPHIES eligibility (always through @/lib/nphies)                           */
/* -------------------------------------------------------------------------- */

interface EligibilitySubject {
    nationalId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
    dateOfBirth: string | null;
    gender: Gender | null;
    phone: string | null;
    memberId: string;
    policyNumber: string | null;
    provider: { nphiesPayerId: string | null; nameEn: string; nameAr: string };
    fallbackPlanName: string | null;
}

function toEligibilityData(
    response: NphiesServiceResponse<EligibilityResult>,
    subject: EligibilitySubject,
): EligibilityCheckData {
    const result = response.result;
    let state: EligibilityState;

    if (!response.success || result === null) state = "ERROR";
    else if (result.outcome === "complete") state = result.policyStatus === "active" ? "ELIGIBLE" : "EXPIRED";
    else if (result.outcome === "error") state = "ERROR";
    else state = "PENDING";

    const copay: PatientCopay | null =
        result !== null && result.copayPercentage !== null
            ? { kind: "PERCENT", value: result.copayPercentage, cap: result.consultationCopayCap }
            : null;

    return {
        state,
        active: state === "ELIGIBLE",
        messageEn: result?.statusMessageEn ?? response.error?.messageEn ?? null,
        messageAr: result?.statusMessageAr ?? response.error?.messageAr ?? null,
        payerNameEn: result?.payerNameEn ?? subject.provider.nameEn,
        payerNameAr: result?.payerNameAr ?? subject.provider.nameAr,
        planName: result?.planName ?? subject.fallbackPlanName,
        copay,
        coverageLimit: result?.coverageLimit ?? null,
        benefitEnd: result?.benefitEnd ?? null,
        cashFallbackRequired: result?.cashFallbackRequired ?? state !== "ELIGIBLE",
        referenceNumber: response.referenceNumber,
        mode: response.mode,
        latencyMs: response.latencyMs,
        checkedAt: new Date().toISOString(),
    };
}

async function runEligibility(
    ctx: Ctx,
    subject: EligibilitySubject,
    clinicId: string | null,
): Promise<EligibilityCheckData> {
    const patient: PortalPatient = {
        nationalId: subject.nationalId,
        identityType: identityTypeOf(subject.nationalId),
        ...(subject.fullNameEn ? { fullNameEn: subject.fullNameEn } : {}),
        ...(subject.fullNameAr ? { fullNameAr: subject.fullNameAr } : {}),
        ...(subject.dateOfBirth ? { dateOfBirth: subject.dateOfBirth } : {}),
        ...(subject.gender ? { gender: subject.gender === "MALE" ? ("male" as const) : ("female" as const) } : {}),
        ...(subject.phone ? { phone: subject.phone } : {}),
        insuranceMemberId: subject.memberId,
        ...(subject.policyNumber ? { insurancePolicyNumber: subject.policyNumber } : {}),
    };

    const request: EligibilityCheckRequest = {
        organizationId: ctx.organizationId,
        patient,
        payer: {
            ...(subject.provider.nphiesPayerId ? { nphiesPayerId: subject.provider.nphiesPayerId } : {}),
            nameEn: subject.provider.nameEn,
            nameAr: subject.provider.nameAr,
        },
        serviceDate: zonedDateString(new Date(), ctx.timezone),
    };

    // Builds the FHIR bundle, dispatches it through the NPHIES_MODE adapter and persists the
    // `nphies_transactions` audit row. Nothing is duplicated here.
    const response = await nphies.checkEligibility(request);
    const data = toEligibilityData(response, subject);

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
                source: "patients-directory",
            },
        });
    }

    return data;
}

async function applyVerifiedCopay(
    ctx: Ctx,
    patientId: string,
    eligibility: EligibilityCheckData,
): Promise<void> {
    if (eligibility.state !== "ELIGIBLE" || eligibility.copay === null) return;

    await prisma.patient.updateMany({
        where: { id: patientId, organizationId: ctx.organizationId, clinicId: { in: ctx.clinicIds } },
        data: {
            copayPercentage: new Prisma.Decimal(eligibility.copay.value),
            copayFixedCap: eligibility.copay.cap !== null ? new Prisma.Decimal(eligibility.copay.cap) : null,
        },
    });
}

const verifyPatientSelect = {
    id: true,
    clinicId: true,
    nationalId: true,
    fullNameEn: true,
    fullNameAr: true,
    dateOfBirth: true,
    gender: true,
    phone: true,
    insuranceProviderId: true,
    insuranceMemberId: true,
    insuranceProvider: { select: { nphiesPayerId: true, nameEn: true, nameAr: true, isActive: true } },
    insurancePolicy: { select: { policyNumber: true, nameEn: true } },
} satisfies Prisma.PatientSelect;

/** "Verify NPHIES" row action (insured patients only). */
export async function verifyPatientNphiesAction(
    patientId: string,
): Promise<PatientsActionResult<VerifyPatientData>> {
    return withSession("verifyPatientNphiesAction", async (ctx) => {
        const id = cleanText(patientId);

        if (!validUuid(id)) return invalid("The selected patient is invalid.", "INVALID_PATIENT");

        const patient = await prisma.patient.findFirst({
            where: { id, organizationId: ctx.organizationId, clinicId: { in: ctx.clinicIds } },
            select: verifyPatientSelect,
        });

        if (!patient) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        const provider = patient.insuranceProvider;

        if (!patient.insuranceProviderId || !provider) {
            return invalid("This is a cash patient. There is no insurance coverage to verify.", "NO_COVERAGE");
        }

        if (!provider.isActive) return invalid("The insurance company is inactive.", "PROVIDER_INACTIVE");

        const memberId = patient.insuranceMemberId?.trim() ?? "";

        if (memberId === "") return invalid("The insurance member ID is missing.", "MISSING_MEMBER_ID");

        const eligibility = await runEligibility(
            ctx,
            {
                nationalId: patient.nationalId.trim(),
                fullNameEn: patient.fullNameEn,
                fullNameAr: patient.fullNameAr,
                dateOfBirth: patient.dateOfBirth ? ymd(patient.dateOfBirth) : null,
                gender: patient.gender,
                phone: patient.phone,
                memberId,
                policyNumber: patient.insurancePolicy?.policyNumber ?? null,
                provider: {
                    nphiesPayerId: provider.nphiesPayerId,
                    nameEn: provider.nameEn,
                    nameAr: provider.nameAr,
                },
                fallbackPlanName: patient.insurancePolicy?.nameEn ?? null,
            },
            patient.clinicId,
        );

        await applyVerifiedCopay(ctx, patient.id, eligibility);

        const row = await loadRow(ctx, patient.id);

        if (!row) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        revalidatePatients();

        return { success: true, data: { row, eligibility } };
    });
}

/** "Check NPHIES Eligibility" inside the Register / Edit modal (works before the patient is saved). */
export async function checkDraftEligibilityAction(
    input: DraftEligibilityInput,
): Promise<PatientsActionResult<EligibilityCheckData>> {
    return withSession("checkDraftEligibilityAction", async (ctx) => {
        const nationalId = toLatinDigits(cleanText(input?.nationalId));
        const identityType = input?.identityType;
        const payerId = cleanText(input?.payerId);
        const policyId = cleanText(input?.policyId);
        const memberId = cleanText(input?.memberId);

        if (!NATIONAL_ID_PATTERN.test(nationalId)) {
            return invalid(
                "Enter a valid 10-digit National ID / Iqama number.",
                "INVALID_NATIONAL_ID",
                "nationalId",
            );
        }

        assertIdentityMatches(identityType, nationalId);

        if (!validUuid(payerId)) return invalid("Select an insurance payer.", "INVALID_PAYER", "payerId");
        if (memberId.length < 3 || memberId.length > 40) {
            return invalid("Enter a valid member / card ID.", "MISSING_MEMBER_ID", "memberId");
        }

        const provider = await prisma.insuranceProvider.findFirst({
            where: { id: payerId, organizationId: ctx.organizationId, isActive: true },
            select: { nphiesPayerId: true, nameEn: true, nameAr: true },
        });

        if (!provider) return invalid("The selected insurance payer is not available.", "PROVIDER_INACTIVE", "payerId");

        const policy = validUuid(policyId)
            ? await prisma.insurancePolicy.findFirst({
                where: { id: policyId, providerId: payerId, organizationId: ctx.organizationId },
                select: { policyNumber: true, nameEn: true },
            })
            : null;

        const dateOfBirth = cleanText(input?.dateOfBirth);
        const phone = normalizeSaudiMobile(cleanText(input?.phone));

        const eligibility = await runEligibility(
            ctx,
            {
                nationalId,
                fullNameEn: cleanText(input?.fullNameEn) || null,
                fullNameAr: cleanText(input?.fullNameAr) || null,
                dateOfBirth: parseDateString(dateOfBirth) ? dateOfBirth : null,
                gender: input?.gender === "MALE" || input?.gender === "FEMALE" ? input.gender : null,
                phone,
                memberId,
                policyNumber: policy?.policyNumber ?? null,
                provider,
                fallbackPlanName: policy?.nameEn ?? null,
            },
            null,
        );

        return { success: true, data: eligibility };
    });
}

/* -------------------------------------------------------------------------- */
/* Create / update patient                                                    */
/* -------------------------------------------------------------------------- */

interface ValidatedPatient {
    fullNameEn: string;
    fullNameAr: string;
    identityType: IdentityType;
    nationalId: string;
    dateOfBirthIso: string;
    gender: Gender;
    phone: string;
    insured: boolean;
    payerId: string | null;
    policyId: string | null;
    memberId: string | null;
}

function assertIdentityMatches(identityType: IdentityType | undefined, nationalId: string): void {
    if (identityType !== "NATIONAL_ID" && identityType !== "IQAMA") {
        throw new ActionFailure("Select an ID type.", "INVALID_ID_TYPE", "identityType");
    }

    if (identityType === "NATIONAL_ID" && !nationalId.startsWith("1")) {
        throw new ActionFailure("A Saudi National ID must start with 1.", "ID_TYPE_MISMATCH", "nationalId");
    }

    if (identityType === "IQAMA" && !nationalId.startsWith("2")) {
        throw new ActionFailure("An Iqama number must start with 2.", "ID_TYPE_MISMATCH", "nationalId");
    }
}

function validatePatientInput(input: PatientFormInput, today: string): ValidatedPatient {
    const fullNameEn = cleanText(input?.fullNameEn).replace(/\s+/g, " ");
    const fullNameAr = cleanText(input?.fullNameAr).replace(/\s+/g, " ");
    const nationalId = toLatinDigits(cleanText(input?.nationalId));
    const dateOfBirthIso = cleanText(input?.dateOfBirth);
    const phone = normalizeSaudiMobile(cleanText(input?.phone));
    const insured = input?.insured === true;

    if (!NAME_EN_PATTERN.test(fullNameEn)) {
        throw new ActionFailure("Enter the full name in English letters.", "INVALID_NAME_EN", "fullNameEn");
    }

    if (!NAME_AR_PATTERN.test(fullNameAr)) {
        throw new ActionFailure("Enter the full name in Arabic letters.", "INVALID_NAME_AR", "fullNameAr");
    }

    if (!NATIONAL_ID_PATTERN.test(nationalId)) {
        throw new ActionFailure(
            "Enter a valid 10-digit National ID / Iqama number.",
            "INVALID_NATIONAL_ID",
            "nationalId",
        );
    }

    assertIdentityMatches(input?.identityType, nationalId);

    if (!parseDateString(dateOfBirthIso) || dateOfBirthIso > today || dateOfBirthIso < "1900-01-01") {
        throw new ActionFailure("Enter a valid date of birth.", "INVALID_DOB", "dateOfBirth");
    }

    if (input?.gender !== "MALE" && input?.gender !== "FEMALE") {
        throw new ActionFailure("Select a gender.", "INVALID_GENDER", "gender");
    }

    if (phone === null) {
        throw new ActionFailure("Enter a valid Saudi mobile number (05XXXXXXXX).", "INVALID_PHONE", "phone");
    }

    let payerId: string | null = null;
    let policyId: string | null = null;
    let memberId: string | null = null;

    if (insured) {
        payerId = cleanText(input.payerId);
        policyId = cleanText(input.policyId) || null;
        memberId = cleanText(input.memberId);

        if (!validUuid(payerId)) {
            throw new ActionFailure("Select an insurance payer.", "INVALID_PAYER", "payerId");
        }

        if (policyId !== null && !validUuid(policyId)) {
            throw new ActionFailure("Select a valid policy plan.", "INVALID_POLICY", "policyId");
        }

        if (memberId.length < 3 || memberId.length > 40) {
            throw new ActionFailure("Enter a valid member / card ID.", "MISSING_MEMBER_ID", "memberId");
        }
    }

    return {
        fullNameEn,
        fullNameAr,
        identityType: input.identityType,
        nationalId,
        dateOfBirthIso,
        gender: input.gender,
        phone,
        insured,
        payerId,
        policyId,
        memberId,
    };
}

interface ResolvedInsurance {
    provider: { id: string; nphiesPayerId: string | null; nameEn: string; nameAr: string };
    policy: {
        id: string;
        nameEn: string;
        policyNumber: string;
        copayType: PolicyCopayType;
        copayValue: Prisma.Decimal;
        maxPatientShare: Prisma.Decimal | null;
    } | null;
}

async function resolveInsurance(
    ctx: Ctx,
    values: ValidatedPatient,
    existingPolicyId: string | null,
    today: string,
): Promise<ResolvedInsurance | null> {
    if (!values.insured || values.payerId === null) return null;

    const provider = await prisma.insuranceProvider.findFirst({
        where: { id: values.payerId, organizationId: ctx.organizationId, isActive: true },
        select: {
            id: true,
            nphiesPayerId: true,
            nameEn: true,
            nameAr: true,
            _count: { select: { policies: { where: { isActive: true } } } },
        },
    });

    if (!provider) {
        throw new ActionFailure("The selected insurance payer is not available.", "PROVIDER_INACTIVE", "payerId");
    }

    if (values.policyId === null) {
        if (provider._count.policies > 0) {
            throw new ActionFailure("Select a policy plan.", "INVALID_POLICY", "policyId");
        }

        return {
            provider: {
                id: provider.id,
                nphiesPayerId: provider.nphiesPayerId,
                nameEn: provider.nameEn,
                nameAr: provider.nameAr,
            },
            policy: null,
        };
    }

    const policy = await prisma.insurancePolicy.findFirst({
        where: { id: values.policyId, providerId: provider.id, organizationId: ctx.organizationId },
        select: {
            id: true,
            nameEn: true,
            policyNumber: true,
            copayType: true,
            copayValue: true,
            maxPatientShare: true,
            expiryDate: true,
            isActive: true,
        },
    });

    if (!policy) {
        throw new ActionFailure("The selected policy does not belong to this payer.", "INVALID_POLICY", "policyId");
    }

    const keepingCurrent = existingPolicyId !== null && existingPolicyId === policy.id;
    const expired = policy.expiryDate !== null && ymd(policy.expiryDate) < today;

    if (!keepingCurrent && (!policy.isActive || expired)) {
        throw new ActionFailure(
            "The selected policy is expired or inactive. Choose an active policy.",
            "POLICY_EXPIRED",
            "policyId",
        );
    }

    return {
        provider: {
            id: provider.id,
            nphiesPayerId: provider.nphiesPayerId,
            nameEn: provider.nameEn,
            nameAr: provider.nameAr,
        },
        policy: {
            id: policy.id,
            nameEn: policy.nameEn,
            policyNumber: policy.policyNumber,
            copayType: policy.copayType,
            copayValue: policy.copayValue,
            maxPatientShare: policy.maxPatientShare,
        },
    };
}

function seedCopayFromPolicy(
    policy: ResolvedInsurance["policy"],
): { copayPercentage: Prisma.Decimal | null; copayFixedCap: Prisma.Decimal | null } {
    if (policy !== null && policy.copayType === "PERCENTAGE") {
        return { copayPercentage: policy.copayValue, copayFixedCap: policy.maxPatientShare };
    }

    return { copayPercentage: null, copayFixedCap: null };
}

/**
 * Clinic a new patient is registered under: the session's active clinic when it belongs to the
 * tenant and is active, otherwise the organization's oldest active clinic.
 */
async function registrationClinicId(ctx: Ctx): Promise<string> {
    if (ctx.activeClinicId !== null) {
        const active = await prisma.clinic.findFirst({
            where: { id: ctx.activeClinicId, organizationId: ctx.organizationId, isActive: true },
            select: { id: true },
        });

        if (active) return active.id;
    }

    const clinic = await prisma.clinic.findFirst({
        where: { organizationId: ctx.organizationId, isActive: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
    });

    if (!clinic) {
        throw new ActionFailure("No active clinic is configured for this center.", "NO_CLINIC");
    }

    return clinic.id;
}

async function nextFileNumber(organizationId: string): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ max: bigint | null }>>(Prisma.sql`
        SELECT MAX(NULLIF(regexp_replace(file_number, '[^0-9]', '', 'g'), '')::bigint) AS max
        FROM patients
        WHERE organization_id = ${organizationId}::uuid
    `);
    const current = rows[0]?.max;

    return `MRN-${current === null || current === undefined ? 1001 : Number(current) + 1}`;
}

/**
 * After a save that touched the insurance identity, re-check eligibility so the table status and
 * co-pay always reflect NPHIES. A check performed seconds earlier in the modal is reused.
 */
async function syncEligibilityAfterSave(
    ctx: Ctx,
    patientId: string,
    clinicId: string,
    values: ValidatedPatient,
    insurance: ResolvedInsurance,
    reference: string | null,
): Promise<void> {
    try {
        if (reference !== null && reference !== "") {
            const tx = await prisma.nphiesTransaction.findFirst({
                where: {
                    organizationId: ctx.organizationId,
                    referenceNumber: reference,
                    transactionType: "ELIGIBILITY",
                    patientNationalId: values.nationalId,
                    createdAt: { gte: new Date(Date.now() - RECENT_VERIFICATION_MS) },
                },
                orderBy: { createdAt: "desc" },
                select: { responsePayload: true },
            });

            if (tx) {
                const portal = portalResultOf(tx.responsePayload);
                const copay = readNumber(portal, "copayPercentage");

                if (portal !== null && readString(portal, "policyStatus") === "active" && copay !== null) {
                    const cap = readNumber(portal, "consultationCopayCap");

                    await prisma.patient.updateMany({
                        where: { id: patientId, organizationId: ctx.organizationId, clinicId },
                        data: {
                            copayPercentage: new Prisma.Decimal(copay),
                            copayFixedCap: cap !== null ? new Prisma.Decimal(cap) : null,
                        },
                    });
                }

                return;
            }
        }

        const eligibility = await runEligibility(
            ctx,
            {
                nationalId: values.nationalId,
                fullNameEn: values.fullNameEn,
                fullNameAr: values.fullNameAr,
                dateOfBirth: values.dateOfBirthIso,
                gender: values.gender,
                phone: values.phone,
                memberId: values.memberId ?? "",
                policyNumber: insurance.policy?.policyNumber ?? null,
                provider: insurance.provider,
                fallbackPlanName: insurance.policy?.nameEn ?? null,
            },
            clinicId,
        );

        await applyVerifiedCopay(ctx, patientId, eligibility);
    } catch (error) {
        // The patient is already saved; a failed background check must never fail the save.
        console.error("[syncEligibilityAfterSave]", error);
    }
}

export async function createPatientAction(
    input: PatientFormInput,
): Promise<PatientsActionResult<SavePatientData>> {
    return withSession("createPatientAction", async (ctx) => {
        const today = zonedDateString(new Date(), ctx.timezone);
        const values = validatePatientInput(input, today);

        // Resolve the registration clinic first: every Patient query below is clinic-scoped.
        const clinicId = await registrationClinicId(ctx);

        // The ID number is unique per organization, so the duplicate check spans every tenant clinic
        // (and satisfies the tenant guard's clinicId requirement).
        const duplicate = await prisma.patient.findFirst({
            where: {
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                nationalId: values.nationalId,
            },
            select: { id: true },
        });

        if (duplicate) {
            return invalid("A patient with this ID number is already registered.", "DUPLICATE_NATIONAL_ID", "nationalId");
        }

        const insurance = await resolveInsurance(ctx, values, null, today);
        const seed = seedCopayFromPolicy(insurance?.policy ?? null);

        let createdId: string | null = null;

        for (let attempt = 1; createdId === null; attempt++) {
            const fileNumber = await nextFileNumber(ctx.organizationId);

            try {
                const created = await prisma.patient.create({
                    data: {
                        organizationId: ctx.organizationId,
                        clinicId,
                        fileNumber,
                        nationalId: values.nationalId,
                        identityType: values.identityType,
                        fullNameEn: values.fullNameEn,
                        fullNameAr: values.fullNameAr,
                        dateOfBirth: new Date(`${values.dateOfBirthIso}T00:00:00.000Z`),
                        gender: values.gender,
                        phone: values.phone,
                        insuranceProviderId: insurance?.provider.id ?? null,
                        insurancePolicyId: insurance?.policy?.id ?? null,
                        insuranceMemberId: values.memberId,
                        copayPercentage: seed.copayPercentage,
                        copayFixedCap: seed.copayFixedCap,
                    },
                    select: { id: true },
                });

                createdId = created.id;
            } catch (error) {
                if (
                    attempt < 4 &&
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2002" &&
                    (uniqueTargetIncludes(error, "file_number") || uniqueTargetIncludes(error, "fileNumber"))
                ) {
                    continue;
                }

                throw error;
            }
        }

        await writeAudit(ctx, {
            actionType: AuditActionType.CREATE,
            targetTable: "patients",
            recordId: createdId,
            clinicId,
            metadata: { source: "patients-directory", insured: values.insured },
        });

        if (insurance !== null) {
            await syncEligibilityAfterSave(
                ctx,
                createdId,
                clinicId,
                values,
                insurance,
                cleanText(input?.eligibilityReference) || null,
            );
        }

        const row = await loadRow(ctx, createdId);

        if (!row) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        revalidatePatients();

        return { success: true, data: { row } };
    });
}

export async function updatePatientAction(
    input: PatientFormInput,
): Promise<PatientsActionResult<SavePatientData>> {
    return withSession("updatePatientAction", async (ctx) => {
        const id = cleanText(input?.id);

        if (!validUuid(id)) return invalid("The selected patient is invalid.", "INVALID_PATIENT");

        const today = zonedDateString(new Date(), ctx.timezone);
        const values = validatePatientInput(input, today);

        const existing = await prisma.patient.findFirst({
            where: { id, organizationId: ctx.organizationId, clinicId: { in: ctx.clinicIds } },
            select: {
                id: true,
                clinicId: true,
                nationalId: true,
                insuranceProviderId: true,
                insurancePolicyId: true,
                insuranceMemberId: true,
            },
        });

        if (!existing) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        const duplicate = await prisma.patient.findFirst({
            where: {
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
                nationalId: values.nationalId,
                NOT: { id: existing.id },
            },
            select: { id: true },
        });

        if (duplicate) {
            return invalid("A patient with this ID number is already registered.", "DUPLICATE_NATIONAL_ID", "nationalId");
        }

        const insurance = await resolveInsurance(ctx, values, existing.insurancePolicyId, today);

        const insuranceChanged =
            insurance !== null &&
            (insurance.provider.id !== existing.insuranceProviderId ||
                (insurance.policy?.id ?? null) !== existing.insurancePolicyId ||
                values.memberId !== (existing.insuranceMemberId ?? null) ||
                values.nationalId !== existing.nationalId.trim());

        const seed = insuranceChanged ? seedCopayFromPolicy(insurance?.policy ?? null) : null;

        // updateMany (not update): the where carries organizationId AND the patient's exact clinicId,
        // which satisfies the tenant guard on every Prisma version.
        const updated = await prisma.patient.updateMany({
            where: { id: existing.id, organizationId: ctx.organizationId, clinicId: existing.clinicId },
            data: {
                nationalId: values.nationalId,
                identityType: values.identityType,
                fullNameEn: values.fullNameEn,
                fullNameAr: values.fullNameAr,
                dateOfBirth: new Date(`${values.dateOfBirthIso}T00:00:00.000Z`),
                gender: values.gender,
                phone: values.phone,
                insuranceProviderId: insurance?.provider.id ?? null,
                insurancePolicyId: insurance?.policy?.id ?? null,
                insuranceMemberId: values.memberId,
                ...(insurance === null
                    ? { copayPercentage: null, copayFixedCap: null, insuranceApprovalCode: null }
                    : seed !== null
                        ? { copayPercentage: seed.copayPercentage, copayFixedCap: seed.copayFixedCap }
                        : {}),
            },
        });

        if (updated.count === 0) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        await writeAudit(ctx, {
            actionType: AuditActionType.UPDATE,
            targetTable: "patients",
            recordId: existing.id,
            clinicId: existing.clinicId,
            metadata: { source: "patients-directory", insured: values.insured, insuranceChanged },
        });

        if (insurance !== null && insuranceChanged) {
            await syncEligibilityAfterSave(
                ctx,
                existing.id,
                existing.clinicId,
                values,
                insurance,
                cleanText(input?.eligibilityReference) || null,
            );
        }

        const row = await loadRow(ctx, existing.id);

        if (!row) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        revalidatePatients();

        return { success: true, data: { row } };
    });
}

/* -------------------------------------------------------------------------- */
/* Patient profile (administrative / operational history — non-clinical)      */
/* -------------------------------------------------------------------------- */

export async function getPatientProfileAction(
    patientId: string,
): Promise<PatientsActionResult<PatientProfileData>> {
    return withSession("getPatientProfileAction", async (ctx) => {
        const id = cleanText(patientId);

        if (!validUuid(id)) return invalid("The selected patient is invalid.", "INVALID_PATIENT");

        const patient = await prisma.patient.findFirst({
            where: { id, organizationId: ctx.organizationId, clinicId: { in: ctx.clinicIds } },
            select: {
                ...patientRowSelect,
                clinicId: true,
                insuranceMemberId: true,
            },
        });

        if (!patient) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        const nationalId = patient.nationalId.trim();
        const now = new Date();

        const [rows, appointments, invoices, transactions] = await Promise.all([
            buildRows(ctx, [patient]),
            prisma.appointment.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                    patientId: patient.id,
                },
                orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
                take: PROFILE_LIST_LIMIT,
                // Strictly administrative fields: no complaint / diagnosis / prescriptions.
                select: {
                    id: true,
                    scheduledAt: true,
                    status: true,
                    doctor: {
                        select: { fullNameEn: true, fullNameAr: true, specialtyEn: true, specialtyAr: true },
                    },
                    clinic: { select: { nameEn: true, nameAr: true } },
                },
            }),
            prisma.invoice.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    clinicId: { in: ctx.clinicIds },
                    patientId: patient.id,
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: PROFILE_LIST_LIMIT,
                select: {
                    id: true,
                    invoiceCounter: true,
                    createdAt: true,
                    subTotal: true,
                    vatRate: true,
                    vatAmount: true,
                    grandTotal: true,
                    vatExempt: true,
                    zatcaTransmissions: {
                        orderBy: { submittedAt: "desc" },
                        take: 1,
                        select: {
                            status: true,
                            invoiceRef: true,
                            invoiceType: true,
                            isInsurance: true,
                            payerName: true,
                        },
                    },
                },
            }),
            prisma.nphiesTransaction.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    patientNationalId: nationalId,
                    transactionType: { in: ["ELIGIBILITY", "PRE_AUTHORIZATION"] },
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: PROFILE_LIST_LIMIT,
                select: {
                    id: true,
                    transactionType: true,
                    status: true,
                    referenceNumber: true,
                    createdAt: true,
                    mode: true,
                    latencyMs: true,
                    responsePayload: true,
                },
            }),
        ]);

        const row = rows[0];

        if (!row) {
            return invalid("The requested record could not be found. Refresh and try again.", "RECORD_NOT_FOUND");
        }

        const visits: ProfileVisit[] = appointments.map((appointment) => ({
            id: appointment.id,
            scheduledAt: appointment.scheduledAt.toISOString(),
            status: appointment.status,
            isUpcoming:
                appointment.scheduledAt.getTime() >= now.getTime() &&
                !INACTIVE_STATUSES.includes(appointment.status) &&
                appointment.status !== "COMPLETED",
            doctorNameEn: appointment.doctor.fullNameEn,
            doctorNameAr: appointment.doctor.fullNameAr,
            specialtyEn: appointment.doctor.specialtyEn,
            specialtyAr: appointment.doctor.specialtyAr,
            clinicNameEn: appointment.clinic.nameEn,
            clinicNameAr: appointment.clinic.nameAr,
        }));

        const invoiceRows: ProfileInvoice[] = invoices.map((invoice) => {
            const transmission = invoice.zatcaTransmissions[0];

            return {
                id: invoice.id,
                reference: transmission?.invoiceRef ?? `INV-${invoice.invoiceCounter}`,
                issuedAt: invoice.createdAt.toISOString(),
                subTotal: num(invoice.subTotal),
                vatRate: num(invoice.vatRate),
                vatAmount: num(invoice.vatAmount),
                grandTotal: num(invoice.grandTotal),
                vatExempt: invoice.vatExempt,
                zatcaStatus: transmission?.status ?? "NOT_SUBMITTED",
                invoiceType: transmission?.invoiceType ?? null,
                isInsurance: transmission?.isInsurance ?? false,
                payerName: transmission?.payerName ?? null,
            };
        });

        const nphiesLog: ProfileNphiesEntry[] = transactions.map((tx) => {
            const portal = portalResultOf(tx.responsePayload);
            const error = payloadErrorOf(tx.responsePayload);
            const policyStatus = readString(portal, "policyStatus");

            return {
                id: tx.id,
                transactionType: tx.transactionType,
                status: tx.status,
                referenceNumber: tx.referenceNumber,
                createdAt: tx.createdAt.toISOString(),
                mode: tx.mode,
                latencyMs: tx.latencyMs,
                policyActive: policyStatus === null ? null : policyStatus === "active",
                copayPercentage: readNumber(portal, "copayPercentage"),
                preAuthRef: readString(portal, "preAuthRef"),
                payerNameEn: readString(portal, "payerNameEn"),
                payerNameAr: readString(portal, "payerNameAr"),
                messageEn:
                    readString(portal, "statusMessageEn") ??
                    readString(portal, "reasonMessageEn") ??
                    readString(error, "messageEn"),
                messageAr:
                    readString(portal, "statusMessageAr") ??
                    readString(portal, "reasonMessageAr") ??
                    readString(error, "messageAr"),
            };
        });

        await writeAudit(ctx, {
            actionType: AuditActionType.READ,
            targetTable: "patients",
            recordId: patient.id,
            clinicId: patient.clinicId,
            metadata: { source: "patients-directory-profile" },
        });

        return {
            success: true,
            data: {
                row,
                dateOfBirth: patient.dateOfBirth ? ymd(patient.dateOfBirth) : null,
                memberIdMasked: maskMemberId(patient.insuranceMemberId),
                registeredAt: patient.createdAt.toISOString(),
                timezone: ctx.timezone,
                visits,
                invoices: invoiceRows,
                nphiesLog,
            },
        };
    });
}

/* -------------------------------------------------------------------------- */
/* Book Visit (pre-filled patient): options, slots, create                    */
/* -------------------------------------------------------------------------- */

export async function getVisitBookingOptionsAction(): Promise<PatientsActionResult<VisitBookingOptions>> {
    return withSession("getVisitBookingOptionsAction", async (ctx) => {
        const clinics = await prisma.clinic.findMany({
            where: { organizationId: ctx.organizationId, isActive: true },
            select: { id: true, nameEn: true, nameAr: true },
            orderBy: [{ nameEn: "asc" }, { id: "asc" }],
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

        const doctors: VisitDoctorOption[] = [];

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

        const today = zonedDateString(new Date(), ctx.timezone);

        return {
            success: true,
            data: {
                clinics,
                doctors,
                today,
                maxDate: addDaysToDateString(today, MAX_BOOKING_DAYS_AHEAD),
                timezone: ctx.timezone,
            },
        };
    });
}

export async function getVisitSlotsAction(input: {
    doctorId: string;
    date: string;
}): Promise<PatientsActionResult<VisitSlotsData>> {
    return withSession("getVisitSlotsAction", async (ctx) => {
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
        const slots: VisitSlot[] = [];

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
            (a, b) => a.startIso.localeCompare(b.startIso) || a.shiftId.localeCompare(b.shiftId),
        );

        return { success: true, data: { date, timezone: ctx.timezone, slots } };
    });
}

export async function bookPatientVisitAction(
    input: BookVisitInput,
): Promise<PatientsActionResult<BookedVisitData>> {
    return withSession("bookPatientVisitAction", async (ctx) => {
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
        if (reason.length > 500) return invalid("The reason for visit is too long.", "INVALID_REASON");

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
                            where: { id: shift.clinicId, organizationId: ctx.organizationId, isActive: true },
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
            metadata: { source: "patients-directory-book-visit", scheduledAt: created.scheduledAt.toISOString() },
        });

        revalidatePatients();

        try {
            revalidatePath("/reception");
        } catch {
            // best-effort
        }

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