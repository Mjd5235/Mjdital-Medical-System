// ============================================================================
// app/(reception)/reception/dashboard/actions.ts
// Front Desk / Today: server actions & queries (Mjdital Reception Portal)
//
// Assumptions:
//  - requirePortalSession("reception"): change the portal key if your guard names it differently.
//  - Every query is scoped by organizationId AND by `clinicId IN (tenant clinics)`, which keeps
//    the tenant middleware used on Doctor / Appointment / Patient happy.
//  - Invoice operations never rely on `clinicId: { in }`: the tenant guard in src/lib/db/prisma.ts
//    (assertTenantFilter) demands a clinicId on every Invoice operation, so the invoice counter is
//    aggregated with ONE scalar clinicId per clinic (see maxInvoiceCounter), invoice creation
//    carries the visit's clinicId, and invoices are otherwise only reached through relations
//    (appointment.invoices / zatcaTransmission.invoice), never through a top-level Invoice query.
//  - NPHIES: eligibility checks go through the unified service in `@/lib/nphies`
//    (`nphies.checkEligibility`). `NPHIES_MODE` ("SIMULATOR" | "PRODUCTION") selects the adapter.
//  - ZATCA: `@/lib/zatca/zatca-service` (ZATCA_ENV = "SIMULATION" | "PRODUCTION") builds, signs
//    and reports the Phase 2 Simplified Tax Invoice.
//
// Appointment & payment lifecycle (Saudi clinic standard):
//   1. BOOKING   -> `SCHEDULED`, zero payment (createAppointmentAction / createWalkInAction).
//   2. CHECK-IN  -> getCheckInQuoteAction: doctor fee + NPHIES / contract coverage + ZATCA VAT.
//   3. SETTLE    -> settleCheckInPaymentAction, 5 ZATCA steps:
//                   (1) pre-flight certificate check (no CSID -> abort, visit stays SCHEDULED)
//                   (2) invoice data + UBL 2.1 XML (UUID / ICV / PIH scoped to the tenant)
//                   (3) SHA-256 + ECDSA signature + Phase 2 TLV QR
//                   (4) reporting API call (Simplified Tax Invoice, B2C)
//                   (5) persistence + ZATCA transmission log + pending NPHIES claim, and ONLY THEN
//                       the appointment moves `SCHEDULED/CONFIRMED -> WAITING`.
//                   The ICV/PIH slot is reserved in a short serializable transaction, the HTTP call
//                   happens outside any transaction, and the result is finalized afterwards, so a
//                   slow gateway never holds a database transaction open.
//   4. WAITING   -> visible in the live queue and the doctor's queue.
//   `WAITING` can never be reached without a reported invoice: updateAppointmentStatusAction and
//   checkInAppointmentAction both refuse `-> WAITING` when the visit has no settled invoice.
//
// Persistence notes (schema.prisma has no QR / payment-method / status columns on Invoice):
//   - zatca_transmissions.invoiceHash / status / httpStatus / zatcaRequestId hold the ZATCA outcome.
//   - zatca_transmissions.messages holds, for a reported invoice, the receipt snapshot + the signed
//     XML (base64) + ZATCA messages; for rejected / pending rows it holds the ZATCA message array
//     the Admin "ZATCA Transmission Log" understands.
//   - Pre-flight failures (Compliance / mock CSID, missing certificate) are written as REJECTED rows
//     (see logPreflightRejection) so they show up in the Admin ZATCA Transmission Log too.
//
// ZATCA invoice identity rules applied at settlement:
//   - Seller VAT (BT-31) is the VAT number embedded in the authentication certificate
//     (`withCertificateVat`), otherwise ZATCA answers `certificate-permissions`.
//   - Buyer identification (BT-46): Saudi citizens (0%, VATEX-SA-HEA) carry their national ID with
//     scheme NAT (BR-KSA-49); residents (15%, category S) carry their Iqama with scheme IQA.
// ============================================================================
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
    AppointmentStatus,
    AuditActionType,
    NphiesTransactionStatus,
    NphiesTransactionType,
    Prisma,
    ZatcaResponseStatus,
} from "@prisma/client";
import type { DoctorPresence, DoctorProfessionalRank } from "@prisma/client";
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
import { ZatcaFlowError } from "@/lib/zatca/crypto";
import {
    ZATCA_GENESIS_PIH,
    buildSignedSimplifiedInvoice,
    checkReportingCredential,
    inspectZatcaReadiness,
    loadSigningMaterial,
    reportSimplifiedInvoice,
    resolveZatcaEnvironment,
    withCertificateVat,
    type ZatcaBuyerIdentification,
    type ZatcaEnvironmentName,
    type ZatcaSellerProfile,
} from "@/lib/zatca/zatca-service"

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

/** ZATCA standard VAT rate applied to the patient's payable share of non-Saudi patients. */
const VAT_RATE_STANDARD = 15;

/** A PENDING settlement younger than this blocks a second concurrent settlement of the same visit. */
const SETTLEMENT_LOCK_MS = 90_000;

const PAYMENT_METHODS = ["CASH", "MADA"] as const;

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VAT_NUMBER_PATTERN = /^3\d{13}3$/;

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
/** Visits that are awaiting arrival: the only ones the payment gate can settle. */
const AWAITING_CHECK_IN_STATUSES: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

/**
 * A "settled" invoice is one that counts as payment for the visit: either a legacy invoice with no
 * ZATCA transmission at all (billed from the billing page) or one whose transmission was reported.
 * Reserved-but-unreported invoices (rejected / gateway unavailable) never unlock the waiting room.
 */
const SETTLED_INVOICE_FILTER = {
    OR: [
        { zatcaTransmissions: { none: {} } },
        {
            zatcaTransmissions: {
                some: {
                    status: {
                        in: [ZatcaResponseStatus.REPORTED, ZatcaResponseStatus.CLEARED],
                    },
                },
            },
        },
    ],
} satisfies Prisma.InvoiceWhereInput;

/** Consultation line item by doctor rank (code + bilingual description for the tax invoice). */
const CONSULTATION_ITEMS: Record<
    DoctorProfessionalRank,
    { code: string; ar: string; en: string }
> = {
    CONSULTANT: { code: "CONS-01", ar: "كشفية استشاري", en: "Consultant Consultation" },
    SPECIALIST: { code: "CONS-02", ar: "كشفية أخصائي", en: "Specialist Consultation" },
    RESIDENT: { code: "CONS-03", ar: "كشفية طبيب مقيم", en: "Resident Consultation" },
    GENERAL_PRACTITIONER: {
        code: "CONS-04",
        ar: "كشفية طبيب عام",
        en: "General Practitioner Consultation",
    },
    REGISTRAR: { code: "CONS-05", ar: "كشفية طبيب مسجّل", en: "Registrar Consultation" },
};

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

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ZatcaStatusValue = "PENDING" | "REPORTED" | "CLEARED" | "REJECTED";

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
    /** Settled invoice of the visit (reported to ZATCA, or a legacy billing-page invoice). */
    invoiceId: string | null;
    /** True when a settled invoice exists for the visit (i.e. the visit was paid at check-in). */
    paid: boolean;
    searchText: string;
}

export interface FrontDeskKpis {
    totalToday: number;
    completed: number;
    upcoming: number;
    waiting: number;
    nphiesEligible: number;
    nphiesAuthPending: number;
    /** Today's visits that still have no settled invoice (payment not collected yet). */
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

/** Automated financial calculation shown when the Check-In & Payment Settlement modal opens. */
export interface CheckInQuote {
    appointmentId: string;
    status: AppointmentStatus;
    scheduledAt: string;
    patientId: string;
    patientNameEn: string;
    patientNameAr: string;
    fileNumber: string;
    nationalIdMasked: string;
    identityType: "NATIONAL_ID" | "IQAMA";
    /** Saudi citizen (National ID): 0% VAT. Everyone else: 15% VAT on the patient share. */
    isSaudi: boolean;
    doctorNameEn: string;
    doctorNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    clinicNameEn: string;
    clinicNameAr: string;
    currency: "SAR";
    /** Step 1: doctor's consultationFee (SAR, before VAT). */
    consultationFee: number;
    /** Step 2: how the fee is split. "CASH" covers uninsured patients and converted insurance. */
    billingMode: "CASH" | "INSURED";
    /** True when the patient has insurance on file but it cannot be honoured (converted to cash). */
    insuranceConverted: boolean;
    conversionCode: EligibilityMessageCode | null;
    conversionMessageEn: string | null;
    conversionMessageAr: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyName: string | null;
    policyNumber: string | null;
    copay: EligibilityCopay | null;
    nphiesReference: string | null;
    nphiesMode: FrontDeskNphiesMode | null;
    insuranceShare: number;
    patientShare: number;
    /** Step 3: 0 (Saudi) or 15 (non-Saudi). */
    vatRate: number;
    vatAmount: number;
    /** Amount due from the patient now = patientShare + vatAmount. */
    totalDue: number;
    /** True when a settled invoice already exists for the visit (nothing left to settle). */
    alreadyInvoiced: boolean;
    /** False when no active, non-expired ZATCA certificate (CSID) exists for ZATCA_ENV. */
    zatcaReady: boolean;
    zatcaEnvironment: ZatcaEnvironmentName;
    generatedAt: string;
}

export interface SettleCheckInInput {
    appointmentId: string;
    paymentMethod: PaymentMethod;
    /** The total the cashier saw; the server rejects the call when the recalculated total differs. */
    expectedTotalDue: number;
}

/** Everything the printable Simplified Tax Invoice needs (also the persisted receipt snapshot). */
export interface SettlementReceipt {
    appointmentId: string;
    status: AppointmentStatus;
    scheduledAt: string;
    invoiceId: string;
    invoiceNumber: string;
    invoiceUuid: string;
    /** ZATCA ICV (KSA-16). */
    invoiceCounter: number;
    issuedAt: string;
    paymentMethod: PaymentMethod;
    currency: "SAR";
    zatcaStatus: ZatcaStatusValue;
    zatcaEnvironment: ZatcaEnvironmentName;
    sellerNameAr: string;
    sellerNameEn: string;
    sellerVatNumber: string;
    sellerCrNumber: string | null;
    sellerLogoUrl: string | null;
    sellerPhone: string | null;
    sellerAddressAr: string;
    sellerAddressEn: string;
    patientNameEn: string;
    patientNameAr: string;
    /** MRN / file number. */
    fileNumber: string;
    nationalIdMasked: string;
    isSaudi: boolean;
    doctorNameEn: string;
    doctorNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    clinicNameEn: string;
    clinicNameAr: string;
    billingMode: "CASH" | "INSURED";
    insuranceConverted: boolean;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyNumber: string | null;
    policyName: string | null;
    copay: EligibilityCopay | null;
    itemCode: string;
    itemNameAr: string;
    itemNameEn: string;
    consultationFee: number;
    insuranceShare: number;
    patientShare: number;
    vatRate: number;
    vatAmount: number;
    totalPaid: number;
    vatExempt: boolean;
    /** ZATCA Phase 2 QR payload: base64 TLV (9 tags). */
    qrPayload: string;
    /** Pending NPHIES claim reference for the insurer share, or null for cash settlements. */
    claimReference: string | null;
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

    if (error instanceof ZatcaFlowError) {
        console.error(`[${action}]`, error);

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

/**
 * Invoice numbering is a per-organization counter (unique [organizationId, invoiceCounter]), so a
 * concurrent settlement can lose the race with a serialization failure (P2034) or a unique
 * violation (P2002). Both are safe to retry because the reservation is one transaction.
 */
async function withInvoiceRetry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await run();
        } catch (error) {
            if (
                attempt < 5 &&
                error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === "P2034" || error.code === "P2002")
            ) {
                continue;
            }

            throw error;
        }
    }
}

function toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Persists a pre-flight failure (certificate / CSID problem detected BEFORE an invoice slot exists)
 * as a REJECTED row of the ZATCA Transmission Log, so Admin > ZATCA Integration shows it.
 * Tenant scoping: the visit must belong to one of the tenant's clinics (clinicId IN ctx.clinicIds),
 * the row carries the organizationId, and the clinic id is added to the message because
 * zatca_transmissions has no clinic column. Never throws: logging must not hide the real error.
 */
async function logPreflightRejection(
    ctx: Ctx,
    input: {
        appointmentId: string;
        environment: ZatcaEnvironmentName;
        code: string;
        message: string;
    },
): Promise<void> {
    try {
        const visit = await prisma.appointment.findFirst({
            where: {
                id: input.appointmentId,
                organizationId: ctx.organizationId,
                clinicId: { in: ctx.clinicIds },
            },
            select: { clinicId: true },
        });

        if (!visit) return;

        const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");

        await prisma.zatcaTransmission.create({
            data: {
                organizationId: ctx.organizationId,
                invoiceRef: `PRE-${compactDate}-${randomUUID().slice(0, 8).toUpperCase()}`,
                invoiceUuid: randomUUID(),
                invoiceType: "SIMPLIFIED_B2C",
                isInsurance: false,
                payerName: null,
                environment: input.environment,
                status: ZatcaResponseStatus.REJECTED,
                httpStatus: null,
                respondedAt: new Date(),
                messages: toJson([
                    {
                        level: "ERROR",
                        type: "PRE_FLIGHT",
                        code: input.code,
                        category: "CSID",
                        message: `${input.message} [clinic ${visit.clinicId}]`,
                    },
                ]),
            },
            select: { id: true },
        });
    } catch (error) {
        console.error("[settleCheckInPaymentAction] could not log the pre-flight rejection", error);
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
                where: SETTLED_INVOICE_FILTER,
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
        const invoiceId = appointment.invoices[0]?.id ?? null;

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
            invoiceId,
            paid: invoiceId !== null,
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
        // Payment is collected at check-in: every visit without a settled invoice is still unpaid.
        pendingBilling: queue.filter((item) => item.invoiceId === null).length,
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

/**
 * Step 1: booking. The slot is reserved as SCHEDULED. No payment, fee or invoice is calculated.
 */
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

                    // Zero payment at booking: the slot is only reserved on the doctor's schedule.
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

/**
 * Walk-in visit. The visit is created as SCHEDULED (unpaid, awaiting check-in) at the current
 * time. It NEVER enters the waiting room here: the caller must continue with the Check-In &
 * Payment Settlement flow (getCheckInQuoteAction -> settleCheckInPaymentAction).
 */
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
                // Strict payment gate: never WAITING before the ZATCA invoice is reported.
                status: AppointmentStatus.SCHEDULED,
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
            metadata: { source: "front-desk-walk-in", awaiting: "check-in-payment" },
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

        // Payment gate: `-> WAITING` is only legal for a visit that already has a settled (reported)
        // ZATCA invoice. The normal path is settleCheckInPaymentAction; this guard blocks every
        // other way of reaching WAITING. The invoice is reached through the appointment relation
        // (no top-level Invoice query, so the tenant guard on Invoice is never involved).
        if (next === AppointmentStatus.WAITING) {
            const settled = await prisma.appointment.count({
                where: {
                    id: current.id,
                    organizationId: ctx.organizationId,
                    clinicId: current.clinicId,
                    invoices: { some: SETTLED_INVOICE_FILTER },
                },
            });

            if (settled === 0) {
                return invalid(
                    "Payment and a ZATCA invoice are required before the patient can enter the waiting room.",
                    "PAYMENT_REQUIRED",
                );
            }
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

/**
 * Kept for backwards compatibility. Check-in is no longer an instant status update: this only
 * succeeds for a visit that already carries a settled invoice (otherwise PAYMENT_REQUIRED). The
 * real check-in is the Check-In & Payment Settlement flow (settleCheckInPaymentAction).
 */
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

/* -------------------------------------------------------------------------- */
/* Check-In & Payment Settlement (fee -> coverage -> VAT -> invoice -> WAITING) */
/* -------------------------------------------------------------------------- */

const settlementPatientSelect = {
    ...eligibilityPatientSelect,
    identityType: true,
    fileNumber: true,
    copayPercentage: true,
    copayFixedCap: true,
    insurancePolicy: {
        select: {
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

type SettlementPatient = Prisma.PatientGetPayload<{ select: typeof settlementPatientSelect }>;

const settlementAppointmentSelect = {
    id: true,
    clinicId: true,
    status: true,
    isLocked: true,
    scheduledAt: true,
    patient: { select: settlementPatientSelect },
    doctor: {
        select: {
            id: true,
            fullNameEn: true,
            fullNameAr: true,
            specialtyEn: true,
            specialtyAr: true,
            professionalRank: true,
            consultationFee: true,
        },
    },
    clinic: { select: { id: true, nameEn: true, nameAr: true } },
    _count: { select: { invoices: { where: SETTLED_INVOICE_FILTER } } },
} satisfies Prisma.AppointmentSelect;

interface CoverageDecision {
    billingMode: "CASH" | "INSURED";
    converted: boolean;
    conversionCode: EligibilityMessageCode | null;
    conversionMessageEn: string | null;
    conversionMessageAr: string | null;
    copay: EligibilityCopay | null;
    eligibility: EligibilityResultData | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    policyName: string | null;
}

interface SettlementAmounts {
    feeC: number;
    insuranceC: number;
    patientC: number;
    vatC: number;
    totalC: number;
    vatRate: number;
}

interface ResolvedSettlement {
    quote: CheckInQuote;
    clinicId: string;
    patientId: string;
    nationalId: string;
    doctorId: string;
    item: { code: string; ar: string; en: string };
    amounts: SettlementAmounts;
    claim: {
        payerNphiesId: string | null;
        payerNameEn: string;
        memberId: string;
        policyNumber: string | null;
        nphiesReference: string | null;
    } | null;
}

/** SAR amounts are handled in integer halalas to avoid floating point drift. */
function toCents(value: Prisma.Decimal | number | string): number {
    return Math.round(Number(value.toString()) * 100);
}

function fromCents(cents: number): number {
    return cents / 100;
}

function centsToDecimal(cents: number): string {
    return (cents / 100).toFixed(2);
}

function patientShareCents(feeC: number, copay: EligibilityCopay): number {
    const raw =
        copay.type === "PERCENTAGE"
            ? Math.round((feeC * Math.min(100, Math.max(0, copay.value))) / 100)
            : toCents(copay.value);

    const capped = copay.cap !== null ? Math.min(raw, toCents(copay.cap)) : raw;

    return Math.max(0, Math.min(feeC, capped));
}

function computeAmounts(
    feeC: number,
    decision: CoverageDecision,
    isSaudi: boolean,
): SettlementAmounts {
    const patientC =
        decision.billingMode === "INSURED" && decision.copay !== null
            ? patientShareCents(feeC, decision.copay)
            : feeC;
    const insuranceC = feeC - patientC;
    // ZATCA: Saudi citizens are exempt (0%); residents/visitors pay 15% on their own share only.
    const vatRate = isSaudi ? 0 : VAT_RATE_STANDARD;
    const vatC = Math.round((patientC * vatRate) / 100);

    return { feeC, insuranceC, patientC, vatC, totalC: patientC + vatC, vatRate };
}

function cashDecision(patient: SettlementPatient): CoverageDecision {
    return {
        billingMode: "CASH",
        converted: false,
        conversionCode: null,
        conversionMessageEn: null,
        conversionMessageAr: null,
        copay: null,
        eligibility: null,
        payerNameEn: patient.insuranceProvider?.nameEn ?? null,
        payerNameAr: patient.insuranceProvider?.nameAr ?? null,
        policyName: null,
    };
}

function convertedDecision(
    patient: SettlementPatient,
    code: EligibilityMessageCode,
    eligibility: EligibilityResultData | null,
): CoverageDecision {
    return {
        billingMode: "CASH",
        converted: true,
        conversionCode: code,
        conversionMessageEn: eligibility?.messageEn ?? null,
        conversionMessageAr: eligibility?.messageAr ?? null,
        copay: null,
        eligibility,
        payerNameEn: patient.insuranceProvider?.nameEn ?? null,
        payerNameAr: patient.insuranceProvider?.nameAr ?? null,
        policyName: eligibility?.policyName ?? patient.insurancePolicy?.nameEn ?? null,
    };
}

/**
 * Copay source priority: the center's active contract/policy (what the center agreed with the
 * payer), then the live NPHIES response, then the copay stored on the patient file.
 */
function resolveCopay(
    patient: SettlementPatient,
    eligibility: EligibilityResultData,
): EligibilityCopay | null {
    const policy = patient.insurancePolicy;

    if (policy) {
        const value = Number(policy.copayValue.toString());

        if (Number.isFinite(value) && value >= 0) {
            return {
                type: policy.copayType,
                value,
                cap: policy.maxPatientShare !== null ? Number(policy.maxPatientShare.toString()) : null,
            };
        }
    }

    if (eligibility.copay) return eligibility.copay;

    if (patient.copayPercentage !== null) {
        return {
            type: "PERCENTAGE",
            value: Number(patient.copayPercentage.toString()),
            cap: patient.copayFixedCap !== null ? Number(patient.copayFixedCap.toString()) : null,
        };
    }

    return null;
}

/**
 * Step 2: insurance & NPHIES coverage evaluation.
 *  - Uninsured -> full cash.
 *  - Insured but rejected / expired / not covered by the center -> converted to full cash.
 *  - Insured, eligible and covered by an active center contract -> co-pay split.
 */
async function decideCoverage(
    ctx: Ctx,
    patient: SettlementPatient,
    clinicId: string,
): Promise<CoverageDecision> {
    const provider = patient.insuranceProvider;

    if (!patient.insuranceProviderId || !provider) return cashDecision(patient);

    if (!provider.isActive) return convertedDecision(patient, "PROVIDER_INACTIVE", null);

    if ((patient.insuranceMemberId?.trim() ?? "") === "") {
        return convertedDecision(patient, "MISSING_MEMBER_ID", null);
    }

    const policy = patient.insurancePolicy;

    if (policy) {
        if (!policy.isActive) return convertedDecision(patient, "POLICY_INACTIVE", null);

        const today = zonedDateString(new Date(), ctx.timezone);

        if (policy.expiryDate && policy.expiryDate.toISOString().slice(0, 10) < today) {
            return convertedDecision(patient, "POLICY_EXPIRED", null);
        }
    }

    const eligibility = await executeEligibility(ctx, patient, clinicId);

    if (eligibility.coverage !== "ELIGIBLE") {
        return convertedDecision(patient, eligibility.messageCode, eligibility);
    }

    const copay = resolveCopay(patient, eligibility);

    if (!copay) return convertedDecision(patient, "POLICY_PENDING", eligibility);

    return {
        billingMode: "INSURED",
        converted: false,
        conversionCode: null,
        conversionMessageEn: null,
        conversionMessageAr: null,
        copay,
        eligibility,
        payerNameEn: eligibility.payerNameEn ?? provider.nameEn,
        payerNameAr: eligibility.payerNameAr ?? provider.nameAr,
        policyName: eligibility.policyName ?? policy?.nameEn ?? null,
    };
}

/**
 * Loads the visit, its patient and doctor, and resolves fee, coverage and VAT (server-side source
 * of truth for the quote and for the settlement).
 */
async function resolveSettlement(ctx: Ctx, appointmentId: string): Promise<ResolvedSettlement> {
    const appointment = await prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            organizationId: ctx.organizationId,
            clinicId: { in: ctx.clinicIds },
        },
        select: settlementAppointmentSelect,
    });

    if (!appointment) {
        throw new ActionFailure(
            "The requested record could not be found. Refresh and try again.",
            "RECORD_NOT_FOUND",
        );
    }

    if (appointment.isLocked) {
        throw new ActionFailure("This appointment is locked and cannot be changed.", "LOCKED");
    }

    if (!AWAITING_CHECK_IN_STATUSES.includes(appointment.status)) {
        throw new ActionFailure(
            "This status change is not allowed for the current visit state.",
            "INVALID_TRANSITION",
        );
    }

    const parsedToday = parseDateString(zonedDateString(new Date(), ctx.timezone));

    if (!parsedToday) throw new Error("Unable to resolve today's date.");

    const { start, end } = dayRange(parsedToday, ctx.timezone);

    if (appointment.scheduledAt < start || appointment.scheduledAt >= end) {
        throw new ActionFailure("Only today's visits can be checked in.", "NOT_TODAY");
    }

    const patient = appointment.patient;

    // Step 1: the doctor's consultation fee, read from the doctor's record.
    const feeC = toCents(appointment.doctor.consultationFee);

    if (feeC <= 0) {
        throw new ActionFailure(
            "This doctor has no consultation fee configured.",
            "FEE_NOT_CONFIGURED",
        );
    }

    const alreadyInvoiced = appointment._count.invoices > 0;
    const isSaudi = patient.identityType === "NATIONAL_ID";

    // Step 2: insurance / NPHIES (skipped when the visit is already invoiced).
    const decision: CoverageDecision = alreadyInvoiced
        ? cashDecision(patient)
        : await decideCoverage(ctx, patient, appointment.clinicId);

    // Step 3: ZATCA VAT on the patient's payable share.
    const amounts = computeAmounts(feeC, decision, isSaudi);
    const nationalId = patient.nationalId.trim();
    const memberId = patient.insuranceMemberId?.trim() ?? "";
    const item = CONSULTATION_ITEMS[appointment.doctor.professionalRank];

    const quote: CheckInQuote = {
        appointmentId: appointment.id,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt.toISOString(),
        patientId: patient.id,
        patientNameEn: patient.fullNameEn,
        patientNameAr: patient.fullNameAr,
        fileNumber: patient.fileNumber,
        nationalIdMasked: maskNationalId(nationalId),
        identityType: patient.identityType,
        isSaudi,
        doctorNameEn: appointment.doctor.fullNameEn,
        doctorNameAr: appointment.doctor.fullNameAr,
        specialtyEn: appointment.doctor.specialtyEn,
        specialtyAr: appointment.doctor.specialtyAr,
        clinicNameEn: appointment.clinic.nameEn,
        clinicNameAr: appointment.clinic.nameAr,
        currency: "SAR",
        consultationFee: fromCents(amounts.feeC),
        billingMode: decision.billingMode,
        insuranceConverted: decision.converted,
        conversionCode: decision.conversionCode,
        conversionMessageEn: decision.conversionMessageEn,
        conversionMessageAr: decision.conversionMessageAr,
        payerNameEn: decision.payerNameEn,
        payerNameAr: decision.payerNameAr,
        policyName: decision.policyName,
        policyNumber:
            decision.billingMode === "INSURED"
                ? (patient.insurancePolicy?.policyNumber ?? null)
                : null,
        copay: decision.billingMode === "INSURED" ? decision.copay : null,
        nphiesReference: decision.eligibility?.referenceNumber ?? null,
        nphiesMode: decision.eligibility?.mode ?? null,
        insuranceShare: fromCents(amounts.insuranceC),
        patientShare: fromCents(amounts.patientC),
        vatRate: amounts.vatRate,
        vatAmount: fromCents(amounts.vatC),
        totalDue: fromCents(amounts.totalC),
        alreadyInvoiced,
        zatcaReady: true,
        zatcaEnvironment: resolveZatcaEnvironment(),
        generatedAt: new Date().toISOString(),
    };

    const claim =
        decision.billingMode === "INSURED" && patient.insuranceProvider
            ? {
                payerNphiesId: patient.insuranceProvider.nphiesPayerId,
                payerNameEn: patient.insuranceProvider.nameEn,
                memberId,
                policyNumber: patient.insurancePolicy?.policyNumber ?? null,
                nphiesReference: decision.eligibility?.referenceNumber ?? null,
            }
            : null;

    return {
        quote,
        clinicId: appointment.clinicId,
        patientId: patient.id,
        nationalId,
        doctorId: appointment.doctor.id,
        item,
        amounts,
        claim,
    };
}

/**
 * Seller profile for the tax invoice: legal names, 15-digit VAT number, CR number, logo, phone and
 * the Saudi national address, all read from Center Settings / the organization (never from the
 * client). Throws ZATCA_PROFILE_MISSING when ZATCA's mandatory seller fields are incomplete.
 */
async function loadSellerProfile(ctx: Ctx): Promise<ZatcaSellerProfile> {
    const [settings, organization] = await Promise.all([
        prisma.centerSettings.findUnique({
            where: { organizationId: ctx.organizationId },
            select: {
                tradeNameAr: true,
                tradeNameEn: true,
                taxRegistrationNumber: true,
                logoUrl: true,
                phone: true,
                streetName: true,
                district: true,
                city: true,
                postalCode: true,
                buildingNumber: true,
                additionalNumber: true,
            },
        }),
        prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { nameAr: true, nameEn: true, vatNumber: true, crNumber: true, city: true },
        }),
    ]);

    if (!organization) {
        throw new ActionFailure("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
    }

    const vatNumber = (settings?.taxRegistrationNumber ?? organization.vatNumber ?? "").trim();
    const streetName = settings?.streetName?.trim() ?? "";
    const district = settings?.district?.trim() ?? "";
    const city = (settings?.city ?? organization.city ?? "").trim();
    const postalCode = settings?.postalCode?.trim() ?? "";
    const buildingNumber = settings?.buildingNumber?.trim() ?? "";
    const additionalNumber = settings?.additionalNumber?.trim() || null;

    if (
        !VAT_NUMBER_PATTERN.test(vatNumber) ||
        streetName === "" ||
        district === "" ||
        city === "" ||
        !/^\d{5}$/.test(postalCode) ||
        !/^\d{4}$/.test(buildingNumber)
    ) {
        throw new ActionFailure(
            "The center's ZATCA tax profile (VAT number and national address) is incomplete. Complete Center Settings first.",
            "ZATCA_PROFILE_MISSING",
        );
    }

    return {
        nameAr: settings?.tradeNameAr?.trim() || organization.nameAr,
        nameEn: settings?.tradeNameEn?.trim() || organization.nameEn,
        vatNumber,
        crNumber: organization.crNumber?.trim() || null,
        logoUrl: settings?.logoUrl?.trim() || null,
        phone: settings?.phone?.trim() || null,
        streetName,
        district,
        city,
        postalCode,
        buildingNumber,
        additionalNumber,
    };
}

/**
 * Buyer identification of the simplified invoice (BT-46): Saudi citizens (VATEX-SA-HEA, 0%) are
 * identified by their national ID with scheme NAT (BR-KSA-49); residents by their Iqama with IQA.
 */
function buyerIdentificationOf(resolved: ResolvedSettlement): ZatcaBuyerIdentification {
    return {
        scheme: resolved.quote.isSaudi ? "NAT" : "IQA",
        value: resolved.nationalId.trim(),
    };
}

function sellerAddress(seller: ZatcaSellerProfile): { ar: string; en: string } {
    const extraEn = seller.additionalNumber ? ` – Additional no. ${seller.additionalNumber}` : "";
    const extraAr = seller.additionalNumber ? ` – الرقم الإضافي ${seller.additionalNumber}` : "";

    return {
        en: `Building ${seller.buildingNumber}, ${seller.streetName}, ${seller.district}, ${seller.city} ${seller.postalCode}${extraEn}`,
        ar: `مبنى ${seller.buildingNumber}، ${seller.streetName}، ${seller.district}، ${seller.city} ${seller.postalCode}${extraAr}`,
    };
}

/** Steps 1-3: fee, coverage and VAT for one awaiting visit (server-side source of truth). */
// (resolveSettlement above is the implementation; this comment block is kept for readability.)

/**
 * Opens the Check-In & Payment Settlement: fetches the doctor's fee, evaluates insurance through
 * `@/lib/nphies` and the center contract (converting to cash when not covered / expired),
 * calculates ZATCA VAT and reports whether a ZATCA certificate (CSID) is active for ZATCA_ENV.
 * Read-only for appointments: the visit stays SCHEDULED.
 */
export async function getCheckInQuoteAction(
    appointmentId: string,
): Promise<FrontDeskActionResult<CheckInQuote>> {
    return withSession("getCheckInQuoteAction", async (ctx) => {
        const id = cleanText(appointmentId);

        if (!validUuid(id)) return invalid("The selected appointment is invalid.", "INVALID_APPOINTMENT");

        const [resolved, readiness] = await Promise.all([
            resolveSettlement(ctx, id),
            inspectZatcaReadiness(ctx.organizationId),
        ]);

        return {
            success: true,
            data: {
                ...resolved.quote,
                zatcaReady: readiness.ready,
                zatcaEnvironment: readiness.environment,
            },
        };
    });
}

/**
 * Structural client accepted by maxInvoiceCounter. `prisma` is the tenant-guarded EXTENDED client, so
 * the interactive-transaction client is `Omit<DynamicClientExtensionThis<...>, ...>`, which is not
 * assignable to the plain `Prisma.TransactionClient`. Only `invoice.aggregate` is needed, and its type
 * is identical on the extended client and on its transaction client.
 */
type InvoiceAggregateClient = { invoice: Pick<typeof prisma.invoice, "aggregate"> };

/**
 * Highest invoice counter of the organization. Invoice.aggregate is guarded by the tenant filter
 * (it must carry a clinicId), and the unique key is [organizationId, invoiceCounter] (org-wide),
 * so the maximum is taken per clinic with a scalar clinicId and combined here.
 */
async function maxInvoiceCounter(tx: InvoiceAggregateClient, ctx: Ctx): Promise<number> {
    const maxima = await Promise.all(
        ctx.clinicIds.map((clinicId) =>
            tx.invoice.aggregate({
                where: { organizationId: ctx.organizationId, clinicId },
                _max: { invoiceCounter: true },
            }),
        ),
    );

    return maxima.reduce((highest, row) => Math.max(highest, row._max.invoiceCounter ?? 0), 0);
}

function buildReceipt(args: {
    resolved: ResolvedSettlement;
    seller: ZatcaSellerProfile;
    invoiceId: string;
    invoiceNumber: string;
    invoiceUuid: string;
    invoiceCounter: number;
    issuedAt: Date;
    method: PaymentMethod;
    environment: ZatcaEnvironmentName;
    status: ZatcaStatusValue;
    qrPayload: string;
    claimReference: string | null;
}): SettlementReceipt {
    const { resolved, seller } = args;
    const quote = resolved.quote;
    const amounts = resolved.amounts;
    const address = sellerAddress(seller);

    return {
        appointmentId: quote.appointmentId,
        status: AppointmentStatus.WAITING,
        scheduledAt: quote.scheduledAt,
        invoiceId: args.invoiceId,
        invoiceNumber: args.invoiceNumber,
        invoiceUuid: args.invoiceUuid,
        invoiceCounter: args.invoiceCounter,
        issuedAt: args.issuedAt.toISOString(),
        paymentMethod: args.method,
        currency: "SAR",
        zatcaStatus: args.status,
        zatcaEnvironment: args.environment,
        sellerNameAr: seller.nameAr,
        sellerNameEn: seller.nameEn,
        sellerVatNumber: seller.vatNumber,
        sellerCrNumber: seller.crNumber,
        sellerLogoUrl: seller.logoUrl,
        sellerPhone: seller.phone,
        sellerAddressAr: address.ar,
        sellerAddressEn: address.en,
        patientNameEn: quote.patientNameEn,
        patientNameAr: quote.patientNameAr,
        fileNumber: quote.fileNumber,
        nationalIdMasked: quote.nationalIdMasked,
        isSaudi: quote.isSaudi,
        doctorNameEn: quote.doctorNameEn,
        doctorNameAr: quote.doctorNameAr,
        specialtyEn: quote.specialtyEn,
        specialtyAr: quote.specialtyAr,
        clinicNameEn: quote.clinicNameEn,
        clinicNameAr: quote.clinicNameAr,
        billingMode: quote.billingMode,
        insuranceConverted: quote.insuranceConverted,
        payerNameEn: quote.payerNameEn,
        payerNameAr: quote.payerNameAr,
        policyNumber: quote.policyNumber,
        policyName: quote.policyName,
        copay: quote.copay,
        itemCode: resolved.item.code,
        itemNameAr: resolved.item.ar,
        itemNameEn: resolved.item.en,
        consultationFee: fromCents(amounts.feeC),
        insuranceShare: fromCents(amounts.insuranceC),
        patientShare: fromCents(amounts.patientC),
        vatRate: amounts.vatRate,
        vatAmount: fromCents(amounts.vatC),
        totalPaid: fromCents(amounts.totalC),
        vatExempt: quote.isSaudi,
        qrPayload: args.qrPayload,
        claimReference: args.claimReference,
    };
}

function readReceiptSnapshot(
    value: Prisma.JsonValue | null,
    status: ZatcaStatusValue,
    environment: ZatcaEnvironmentName,
): SettlementReceipt | null {
    if (!isJsonObject(value ?? undefined)) return null;

    const snapshot = (value as Prisma.JsonObject)["receipt"];

    if (!isJsonObject(snapshot)) return null;

    const required = ["invoiceNumber", "invoiceUuid", "qrPayload", "sellerNameAr", "issuedAt"];

    if (!required.every((key) => typeof snapshot[key] === "string")) return null;

    return {
        ...(snapshot as unknown as SettlementReceipt),
        zatcaStatus: status,
        zatcaEnvironment: environment,
    };
}

/**
 * Steps 1-5 of the ZATCA pipeline plus the strict payment gate. The visit moves to WAITING only
 * after the invoice was REPORTED to ZATCA; any earlier failure leaves it SCHEDULED and unpaid.
 */
export async function settleCheckInPaymentAction(
    input: SettleCheckInInput,
): Promise<FrontDeskActionResult<SettlementReceipt>> {
    return withSession("settleCheckInPaymentAction", async (ctx) => {
        const appointmentId = cleanText(input?.appointmentId);
        const method = input?.paymentMethod;
        const expectedTotal = Number(input?.expectedTotalDue);

        if (!validUuid(appointmentId)) {
            return invalid("The selected appointment is invalid.", "INVALID_APPOINTMENT");
        }

        if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
            return invalid("Select Cash or Mada / POS.", "INVALID_PAYMENT_METHOD");
        }

        // Step 1 - pre-flight: an active, non-expired CSID must exist for ZATCA_ENV. Otherwise
        // abort before any NPHIES call or database write (the visit stays SCHEDULED).
        const environment = resolveZatcaEnvironment();

        // Pre-flight 1: the stored certificate must be a reporting-ready Production CSID.
        // A Compliance / mock CSID would only produce a misleading HTTP 401 from ZATCA. The rejection is
        // written to the ZATCA Transmission Log and the visit is left untouched (still SCHEDULED).
        const credentialCheck = await checkReportingCredential(ctx.organizationId, environment);

        if (!credentialCheck.ok) {
            await logPreflightRejection(ctx, {
                appointmentId,
                environment,
                code: credentialCheck.code,
                message: credentialCheck.message,
            });

            throw new ActionFailure(credentialCheck.message, credentialCheck.code);
        }

        // Pre-flight 2: the credentials must be loadable (missing / expired / undecryptable).
        let material: Awaited<ReturnType<typeof loadSigningMaterial>>;

        try {
            material = await loadSigningMaterial(ctx.organizationId, environment);
        } catch (error) {
            if (error instanceof ZatcaFlowError) {
                await logPreflightRejection(ctx, {
                    appointmentId,
                    environment,
                    code: error.code,
                    message: error.message,
                });
            }

            throw error;
        }

        // ZATCA only accepts the VAT number embedded in the authentication certificate as the seller
        // VAT (`certificate-permissions`): the Center Settings VAT is replaced by the certificate's
        // so the XML, the QR and the printed receipt always agree.
        const seller = withCertificateVat(await loadSellerProfile(ctx), material);
        const resolved = await resolveSettlement(ctx, appointmentId);

        if (resolved.quote.alreadyInvoiced) {
            throw new ActionFailure(
                "This visit already has an invoice. Refresh the queue.",
                "ALREADY_INVOICED",
            );
        }

        if (!Number.isFinite(expectedTotal) || toCents(expectedTotal) !== resolved.amounts.totalC) {
            return invalid(
                "The amount due changed. Review the updated total and confirm again.",
                "PRICE_CHANGED",
            );
        }

        const { amounts } = resolved;
        const vatExempt = resolved.quote.isSaudi;
        const mode = currentNphiesMode();
        const buyerName = resolved.quote.patientNameAr || resolved.quote.patientNameEn;

        // Step 2 + 3 - reserve the tenant-scoped UUID / ICV / PIH, build the UBL 2.1 XML, hash,
        // sign and generate the Phase 2 QR. The invoice exists but is NOT settled yet: the visit
        // is untouched and the transmission is PENDING.
        const reserved = await withInvoiceRetry(() =>
            prisma.$transaction(
                async (tx) => {
                    const current = await tx.appointment.findFirst({
                        where: {
                            id: appointmentId,
                            organizationId: ctx.organizationId,
                            clinicId: { in: ctx.clinicIds },
                        },
                        select: {
                            id: true,
                            clinicId: true,
                            status: true,
                            isLocked: true,
                            _count: { select: { invoices: { where: SETTLED_INVOICE_FILTER } } },
                        },
                    });

                    if (!current) {
                        throw new ActionFailure(
                            "The requested record could not be found. Refresh and try again.",
                            "RECORD_NOT_FOUND",
                        );
                    }

                    if (current.isLocked) {
                        throw new ActionFailure("This appointment is locked and cannot be changed.", "LOCKED");
                    }

                    if (!AWAITING_CHECK_IN_STATUSES.includes(current.status)) {
                        throw new ActionFailure(
                            "This visit was just updated by someone else. The queue has been refreshed.",
                            "CONFLICT",
                        );
                    }

                    if (current._count.invoices > 0) {
                        throw new ActionFailure(
                            "This visit already has an invoice. Refresh the queue.",
                            "ALREADY_INVOICED",
                        );
                    }

                    const inFlight = await tx.zatcaTransmission.count({
                        where: {
                            organizationId: ctx.organizationId,
                            status: ZatcaResponseStatus.PENDING,
                            submittedAt: { gte: new Date(Date.now() - SETTLEMENT_LOCK_MS) },
                            invoice: { appointmentId: current.id },
                        },
                    });

                    if (inFlight > 0) {
                        throw new ActionFailure(
                            "This visit is already being settled. Wait a moment and refresh the queue.",
                            "SETTLEMENT_IN_PROGRESS",
                        );
                    }

                    const [highestCounter, previousTransmission] = await Promise.all([
                        maxInvoiceCounter(tx, ctx),
                        tx.zatcaTransmission.findFirst({
                            where: {
                                organizationId: ctx.organizationId,
                                environment,
                                invoiceHash: { not: null },
                            },
                            orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
                            select: { invoiceHash: true },
                        }),
                    ]);

                    const counter = highestCounter + 1;
                    const previousHash = previousTransmission?.invoiceHash ?? ZATCA_GENESIS_PIH;
                    const invoiceUuid = randomUUID();
                    const issuedAt = new Date();
                    const year = zonedParts(issuedAt, ctx.timezone).year;
                    const invoiceNumber = `INV-${year}-${String(counter).padStart(5, "0")}`;

                    const signed = buildSignedSimplifiedInvoice(
                        {
                            uuid: invoiceUuid,
                            invoiceNumber,
                            icv: counter,
                            pih: previousHash,
                            issuedAt,
                            seller,
                            buyerName,
                            buyerId: buyerIdentificationOf(resolved),
                            paymentMethod: method,
                            itemCode: resolved.item.code,
                            itemNameAr: resolved.item.ar,
                            itemNameEn: resolved.item.en,
                            feeC: amounts.feeC,
                            insuranceC: amounts.insuranceC,
                            patientC: amounts.patientC,
                            vatC: amounts.vatC,
                            vatRate: amounts.vatRate,
                            vatExempt,
                        },
                        material,
                    );

                    // Payment recorded as a ZATCA Simplified Tax Invoice (patient's payable share).
                    // clinicId is always present: the tenant guard requires it on every Invoice op.
                    const invoice = await tx.invoice.create({
                        data: {
                            organizationId: ctx.organizationId,
                            clinicId: resolved.clinicId,
                            patientId: resolved.patientId,
                            appointmentId: current.id,
                            invoiceUuid,
                            invoiceCounter: counter,
                            previousInvoiceHash: previousHash,
                            subTotal: centsToDecimal(amounts.patientC),
                            vatRate: amounts.vatRate.toFixed(2),
                            vatAmount: centsToDecimal(amounts.vatC),
                            grandTotal: centsToDecimal(amounts.totalC),
                            vatExempt,
                        },
                        select: { id: true },
                    });

                    const transmission = await tx.zatcaTransmission.create({
                        data: {
                            organizationId: ctx.organizationId,
                            invoiceId: invoice.id,
                            invoiceRef: invoiceNumber,
                            invoiceUuid,
                            invoiceType: "SIMPLIFIED_B2C",
                            isInsurance: false,
                            payerName: null,
                            environment,
                            status: ZatcaResponseStatus.PENDING,
                            invoiceHash: signed.invoiceHash,
                            messages: [],
                        },
                        select: { id: true },
                    });

                    return {
                        clinicId: current.clinicId,
                        previousStatus: current.status,
                        invoiceId: invoice.id,
                        transmissionId: transmission.id,
                        invoiceUuid,
                        invoiceNumber,
                        counter,
                        issuedAt,
                        signed,
                    };
                },
                {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                    maxWait: 10_000,
                    timeout: 20_000,
                },
            ),
        );

        // Step 4 - report to ZATCA (outside any database transaction).
        const report = await reportSimplifiedInvoice({
            material,
            uuid: reserved.invoiceUuid,
            invoiceHash: reserved.signed.invoiceHash,
            xmlBase64: reserved.signed.xmlBase64,
        });

        if (report.outcome !== "REPORTED") {
            try {
                await prisma.zatcaTransmission.updateMany({
                    where: { id: reserved.transmissionId, organizationId: ctx.organizationId },
                    data: {
                        status:
                            report.outcome === "REJECTED"
                                ? ZatcaResponseStatus.REJECTED
                                : ZatcaResponseStatus.PENDING,
                        httpStatus: report.httpStatus,
                        zatcaRequestId: report.requestId,
                        respondedAt: new Date(),
                        messages: toJson(report.messages),
                    },
                });
            } catch (error) {
                console.error("[settleCheckInPaymentAction] could not log the failed report", error);
            }

            // The visit stays SCHEDULED and unpaid.
            throw new ActionFailure(
                report.reason ?? "ZATCA did not accept the invoice.",
                report.outcome === "REJECTED" ? "ZATCA_REJECTED" : "ZATCA_UNREACHABLE",
            );
        }

        // Step 5 - persistence: transmission log (REPORTED + receipt snapshot), pending NPHIES
        // claim for the insurer share, and only now the move to WAITING.
        let claimReference: string | null = null;

        if (resolved.claim && amounts.insuranceC > 0) {
            const compactDate = reserved.issuedAt.toISOString().slice(0, 10).replace(/-/g, "");

            claimReference = `CLM-${compactDate}-${randomUUID().slice(0, 8).toUpperCase()}`;
        }

        const receipt = buildReceipt({
            resolved,
            seller,
            invoiceId: reserved.invoiceId,
            invoiceNumber: reserved.invoiceNumber,
            invoiceUuid: reserved.invoiceUuid,
            invoiceCounter: reserved.counter,
            issuedAt: reserved.issuedAt,
            method,
            environment,
            status: "REPORTED",
            qrPayload: reserved.signed.qrPayload,
            claimReference,
        });

        try {
            await prisma.zatcaTransmission.updateMany({
                where: { id: reserved.transmissionId, organizationId: ctx.organizationId },
                data: {
                    status: ZatcaResponseStatus.REPORTED,
                    httpStatus: report.httpStatus,
                    zatcaRequestId: report.requestId,
                    respondedAt: new Date(),
                    messages: toJson({
                        receipt,
                        signedXmlBase64: reserved.signed.xmlBase64,
                        invoiceHash: reserved.signed.invoiceHash,
                        mock: report.mock,
                        zatcaMessages: report.messages,
                        paymentMethod: method,
                    }),
                },
            });
        } catch (error) {
            console.error(
                `[settleCheckInPaymentAction] invoice ${reserved.invoiceNumber} was reported to ZATCA but the transmission log could not be updated`,
                error,
            );

            throw error;
        }

        try {
            await withSerializableRetry(() =>
                prisma.$transaction(
                    async (tx) => {
                        if (resolved.claim && claimReference) {
                            await tx.nphiesTransaction.create({
                                data: {
                                    organizationId: ctx.organizationId,
                                    transactionType: NphiesTransactionType.CLAIM,
                                    referenceNumber: claimReference,
                                    patientNationalId: resolved.nationalId,
                                    requestPayload: {
                                        portalRequest: {
                                            kind: "CONSULTATION_CLAIM",
                                            appointmentId,
                                            invoiceId: reserved.invoiceId,
                                            invoiceNumber: reserved.invoiceNumber,
                                            doctorId: resolved.doctorId,
                                            payerNphiesId: resolved.claim.payerNphiesId,
                                            payerNameEn: resolved.claim.payerNameEn,
                                            memberId: resolved.claim.memberId,
                                            policyNumber: resolved.claim.policyNumber,
                                            eligibilityReference: resolved.claim.nphiesReference,
                                            currency: "SAR",
                                            serviceAmount: centsToDecimal(amounts.feeC),
                                            insuranceShare: centsToDecimal(amounts.insuranceC),
                                            patientShare: centsToDecimal(amounts.patientC),
                                        },
                                        fhirBundle: null,
                                    },
                                    responsePayload: {
                                        portalResult: { state: "pending-submission" },
                                        error: null,
                                        fhirBundle: null,
                                    },
                                    status: NphiesTransactionStatus.QUEUED,
                                    mode,
                                    latencyMs: 0,
                                },
                            });
                        }

                        // Only now (invoice reported + payment recorded) does the visit enter the
                        // waiting room.
                        const moved = await tx.appointment.updateMany({
                            where: {
                                id: appointmentId,
                                organizationId: ctx.organizationId,
                                clinicId: { in: ctx.clinicIds },
                                status: { in: AWAITING_CHECK_IN_STATUSES },
                                isLocked: false,
                            },
                            data: { status: AppointmentStatus.WAITING },
                        });

                        if (moved.count === 0) {
                            throw new ActionFailure(
                                "This visit was just updated by someone else. The queue has been refreshed.",
                                "CONFLICT",
                            );
                        }

                        if (ctx.userId) {
                            await tx.auditLog.create({
                                data: {
                                    organizationId: ctx.organizationId,
                                    clinicId: reserved.clinicId,
                                    userId: ctx.userId,
                                    actionType: AuditActionType.CREATE,
                                    targetTable: "invoices",
                                    recordId: reserved.invoiceId,
                                    metadata: {
                                        source: "front-desk-check-in-payment",
                                        appointmentId,
                                        invoiceNumber: reserved.invoiceNumber,
                                        paymentMethod: method,
                                        billingMode: resolved.quote.billingMode,
                                        insuranceConverted: resolved.quote.insuranceConverted,
                                        totalPaid: centsToDecimal(amounts.totalC),
                                        zatcaEnvironment: environment,
                                        claimReference,
                                    },
                                },
                            });

                            await tx.auditLog.create({
                                data: {
                                    organizationId: ctx.organizationId,
                                    clinicId: reserved.clinicId,
                                    userId: ctx.userId,
                                    actionType: AuditActionType.UPDATE,
                                    targetTable: "appointments",
                                    recordId: appointmentId,
                                    metadata: {
                                        from: reserved.previousStatus,
                                        to: AppointmentStatus.WAITING,
                                        source: "front-desk-check-in-payment",
                                    },
                                },
                            });
                        }
                    },
                    {
                        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                        maxWait: 10_000,
                        timeout: 20_000,
                    },
                ),
            );
        } catch (error) {
            console.error(
                `[settleCheckInPaymentAction] invoice ${reserved.invoiceNumber} was reported but the visit could not be moved to WAITING`,
                error,
            );

            throw error;
        }

        revalidateFrontDesk();

        return { success: true, data: receipt };
    });
}

/**
 * Re-opens the printable Simplified Tax Invoice of a settled visit ("View Invoice"). Reads the
 * receipt snapshot saved with the reported ZATCA transmission (the invoice is reached through
 * its transmission, never through a top-level Invoice query).
 */
export async function getInvoiceReceiptAction(
    invoiceId: string,
): Promise<FrontDeskActionResult<SettlementReceipt>> {
    return withSession("getInvoiceReceiptAction", async (ctx) => {
        const id = cleanText(invoiceId);

        if (!validUuid(id)) return invalid("The selected invoice is invalid.", "INVALID_INVOICE");

        const transmission = await prisma.zatcaTransmission.findFirst({
            where: {
                organizationId: ctx.organizationId,
                invoiceId: id,
                status: { in: [ZatcaResponseStatus.REPORTED, ZatcaResponseStatus.CLEARED] },
            },
            orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
            select: {
                status: true,
                environment: true,
                messages: true,
                invoice: { select: { clinicId: true } },
            },
        });

        if (
            !transmission ||
            !transmission.invoice ||
            !ctx.clinicIds.includes(transmission.invoice.clinicId)
        ) {
            return invalid(
                "No ZATCA invoice snapshot is available for this visit.",
                "RECEIPT_UNAVAILABLE",
            );
        }

        const receipt = readReceiptSnapshot(
            transmission.messages,
            transmission.status,
            transmission.environment,
        );

        if (!receipt) {
            return invalid(
                "No ZATCA invoice snapshot is available for this visit.",
                "RECEIPT_UNAVAILABLE",
            );
        }

        return { success: true, data: receipt };
    });
}