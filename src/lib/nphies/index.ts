// src/lib/nphies/index.ts
/**
 * Mjdital NPHIES service facade (HL7 FHIR R4) — Adapter / Strategy pattern.
 *
 * `NPHIES_MODE` selects the adapter at call time ("SIMULATOR" default | "PRODUCTION").
 * Reception / Doctor Portal code is identical in both modes.
 *
 * Every call:
 *   1. loads the tenant's facility profile (CenterSettings.nphiesFacilityId, names),
 *   2. builds the FHIR Bundle (fhir-builder.ts),
 *   3. dispatches through the active adapter and measures `latencyMs`,
 *   4. normalizes the FHIR response into a portal-friendly result,
 *   5. persists an audit row in `nphies_transactions` (scoped by organization_id).
 *
 * @example Reception Portal — eligibility check (Server Action)
 * ```ts
 * "use server";
 * import { nphies } from "@/lib/nphies";
 *
 * export async function checkPatientEligibility(patientId: string) {
 *   const session = await requireSession(["RECEPTIONIST", "ADMIN"]);
 *   const patient = await getPatient(session.organizationId, patientId);
 *   const res = await nphies.checkEligibility({
 *     organizationId: session.organizationId,
 *     patient: {
 *       nationalId: patient.nationalId,
 *       identityType: patient.identityType,
 *       fullNameEn: patient.fullNameEn,
 *       fullNameAr: patient.fullNameAr,
 *       insuranceMemberId: patient.insuranceMemberId ?? undefined,
 *     },
 *     payer: { nphiesPayerId: patient.insuranceProvider?.nphiesPayerId ?? undefined },
 *   });
 *   if (!res.success) return { error: res.error?.messageAr };
 *   if (res.result?.cashFallbackRequired) return { alert: "Policy inactive — collect cash payment" };
 *   return { payer: res.result?.payerNameAr, copay: res.result?.copayPercentage };
 * }
 * ```
 *
 * @example Doctor Portal — pre-authorization, then poll when queued
 * ```ts
 * const pre = await nphies.requestPreAuthorization({
 *   organizationId,
 *   patient: { nationalId: "1000000002", identityType: "NATIONAL_ID" },
 *   practitioner: { fullNameEn: "Dr. Sara Alharbi", scfhsLicenseNumber: "SCFHS-100234" },
 *   diagnoses: [{ icd10AmCode: "R10.4", description: "Abdominal pain" }],
 *   items: [
 *     { code: "56001-00", nameEn: "MRI Abdomen", category: "radiology", modality: "MRI",
 *       quantity: 1, unitPrice: 900 },
 *   ],
 * });
 * if (pre.result?.outcome === "queued") {
 *   // later (e.g. every ~3 s from a client poll or a job):
 *   const polled = await nphies.pollStatus({ organizationId, referenceNumber: pre.referenceNumber });
 *   // polled.result?.outcome === "complete" && polled.result.preAuthRef → attach to the order
 * }
 * ```
 *
 * @example Doctor Portal — e-Prescription (SFDA code)
 * ```ts
 * const rx = await nphies.submitEPrescription({
 *   organizationId,
 *   patient: { nationalId: "1000000003", identityType: "NATIONAL_ID" },
 *   practitioner: { fullNameEn: "Dr. Sara Alharbi", scfhsLicenseNumber: "SCFHS-100234" },
 *   diagnoses: [{ icd10AmCode: "J06.9" }],
 *   medications: [
 *     { sfdaCode: "1234567", nameEn: "Amoxicillin 500mg", dosageText: "1 capsule 3x daily",
 *       quantity: 21, daysSupply: 7, unitPrice: 1.5 },
 *   ],
 * });
 * // rx.result?.totalPatientShare → show co-pay at the pharmacy step
 * ```
 *
 * @example Billing — claim submission (after pre-auth)
 * ```ts
 * const claim = await nphies.submitClaim({
 *   organizationId, patient, practitioner, diagnoses, items,
 *   preAuthRef: pre.result?.preAuthRef ?? undefined,
 * });
 * // claim.result?.payableAmount / rejectedAmount / justification
 * ```
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

import {
    NPHIES_SYSTEMS,
    MJDITAL_EXTENSIONS,
    buildClaimSubmissionBundle,
    buildEPrescriptionBundle,
    buildEligibilityRequestBundle,
    buildIssue,
    buildOperationOutcomeBundle,
    buildPreAuthorizationBundle,
    buildStatusCheckBundle,
    findOrganizationByType,
    findResource,
    findResources,
    isFhirBundle,
    roundMoney,
} from "./fhir-builder";
import { NphiesProductionAdapter, NphiesProductionError } from "./production";
import { NphiesSimulatorAdapter } from "./simulator";
import type {
    BuiltRequest,
    ClaimSubmissionRequest,
    ClaimSubmissionResult,
    EPrescriptionRequest,
    EPrescriptionResult,
    EligibilityCheckRequest,
    EligibilityResult,
    FhirBundle,
    FhirClaim,
    FhirClaimResponse,
    FhirAdjudication,
    NphiesAdapter,
    NphiesAuditLogInput,
    NphiesDispatchContext,
    NphiesFacilityContext,
    NphiesMode,
    NphiesOriginalTransactionSnapshot,
    NphiesOutcome,
    NphiesPortalError,
    NphiesPortalIssue,
    NphiesPortalRequest,
    NphiesPortalResult,
    NphiesRecordStatus,
    NphiesServiceResponse,
    NphiesStoredRequestPayload,
    NphiesStoredResponsePayload,
    NphiesTransactionType,
    PollRequest,
    PollResult,
    PortalItemAdjudication,
    PortalLineOutcome,
    PortalMoneyTotals,
    PreAuthorizationRequest,
    PreAuthorizationResult,
} from "./types";

export * from "./types";
export { NphiesSimulatorAdapter } from "./simulator";
export { NphiesProductionAdapter, NphiesProductionError } from "./production";

/* ========================================================================== */
/* Configuration                                                              */
/* ========================================================================== */

export class NphiesConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NphiesConfigurationError";
    }
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
const POLLABLE_TYPES: NphiesTransactionType[] = ["PRE_AUTHORIZATION", "CLAIM", "E_PRESCRIPTION"];

export function resolveNphiesMode(raw: string | undefined = process.env["NPHIES_MODE"]): NphiesMode {
    const value = (raw ?? "SIMULATOR").trim().toUpperCase();
    if (value === "SIMULATOR" || value === "PRODUCTION") {
        return value;
    }
    throw new NphiesConfigurationError(
        `Invalid NPHIES_MODE "${raw ?? ""}". Expected "SIMULATOR" or "PRODUCTION".`,
    );
}

function parseEnvInt(name: string): number | undefined {
    const raw = process.env[name];
    if (raw === undefined) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const adapterCache = new Map<NphiesMode, NphiesAdapter>();

export function getNphiesAdapter(mode: NphiesMode = resolveNphiesMode()): NphiesAdapter {
    const cached = adapterCache.get(mode);
    if (cached !== undefined) {
        return cached;
    }
    const latencyMs = parseEnvInt("NPHIES_SIMULATOR_LATENCY_MS");
    const queueDelayMs = parseEnvInt("NPHIES_SIMULATOR_QUEUE_DELAY_MS");
    const adapter: NphiesAdapter =
        mode === "PRODUCTION"
            ? new NphiesProductionAdapter()
            : new NphiesSimulatorAdapter({
                ...(latencyMs !== undefined ? { latencyMs } : {}),
                ...(queueDelayMs !== undefined ? { queueDelayMs } : {}),
            });
    adapterCache.set(mode, adapter);
    return adapter;
}

/* ========================================================================== */
/* Normalization helpers                                                      */
/* ========================================================================== */

const EMPTY_TOTALS: PortalMoneyTotals = {
    submitted: 0,
    approved: 0,
    rejected: 0,
    patientShare: 0,
    insurerShare: 0,
};

function toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredBundle(payload: Prisma.JsonValue): FhirBundle | null {
    if (!isRecord(payload)) {
        return null;
    }
    const candidate = payload["fhirBundle"];
    return isFhirBundle(candidate) ? candidate : null;
}

function adjAmount(adjudication: FhirAdjudication[], code: string): number {
    const match = adjudication.find((a) => a.category.coding?.some((c) => c.code === code));
    return match?.amount?.value ?? 0;
}

interface NormalizedAdjudication {
    outcome: NphiesOutcome;
    preAuthRef: string | null;
    items: PortalItemAdjudication[];
    totals: PortalMoneyTotals;
    reasonCode: string | null;
    reasonMessageEn: string | null;
    reasonMessageAr: string | null;
}

function normalizeClaimAdjudication(
    requestBundle: FhirBundle,
    claimResponse: FhirClaimResponse,
): NormalizedAdjudication {
    const claim: FhirClaim | undefined = findResource(requestBundle, "Claim");

    const items: PortalItemAdjudication[] = (claimResponse.item ?? []).map((item) => {
        const requestItem = claim?.item?.find((i) => i.sequence === item.itemSequence);
        const firstCoding = requestItem?.productOrService.coding?.[0];
        const code = firstCoding?.code ?? "";
        const description =
            firstCoding?.display ?? requestItem?.productOrService.text ?? (code !== "" ? code : "—");

        const outcomeCode = item.extension
            ?.find((e) => e.url === MJDITAL_EXTENSIONS.adjudicationOutcome)
            ?.valueCodeableConcept?.coding?.[0]?.code;
        const reasonEntry = item.adjudication.find((a) => a.reason !== undefined);
        const reasonCoding = reasonEntry?.reason?.coding?.[0];

        let outcome: PortalLineOutcome;
        if (outcomeCode === "approved" || outcomeCode === "rejected" || outcomeCode === "queued") {
            outcome = outcomeCode;
        } else {
            outcome = reasonEntry !== undefined ? "rejected" : "approved";
        }

        const submitted = adjAmount(item.adjudication, "submitted");
        const patientShare = adjAmount(item.adjudication, "copay");
        const insurerShare = adjAmount(item.adjudication, "benefit");
        return {
            sequence: item.itemSequence,
            code,
            description,
            outcome,
            submittedAmount: submitted,
            approvedAmount: outcome === "approved" ? roundMoney(patientShare + insurerShare) : 0,
            patientShare: outcome === "approved" ? patientShare : 0,
            insurerShare: outcome === "approved" ? insurerShare : 0,
            reasonCode: reasonCoding?.code ?? null,
            reasonMessageEn: reasonCoding?.display ?? null,
            reasonMessageAr: reasonEntry?.reason?.text ?? null,
        };
    });

    const sum = (pick: (i: PortalItemAdjudication) => number): number =>
        roundMoney(items.reduce((acc, i) => acc + pick(i), 0));

    const totals: PortalMoneyTotals = {
        submitted: sum((i) => i.submittedAmount),
        approved: sum((i) => i.approvedAmount),
        rejected: sum((i) => (i.outcome === "rejected" ? i.submittedAmount : 0)),
        patientShare: sum((i) => i.patientShare),
        insurerShare: sum((i) => i.insurerShare),
    };

    const primary =
        items.find((i) => i.outcome === "rejected") ?? items.find((i) => i.outcome === "queued");

    return {
        outcome: claimResponse.outcome,
        preAuthRef: claimResponse.preAuthRef ?? null,
        items,
        totals,
        reasonCode: primary?.reasonCode ?? null,
        reasonMessageEn: primary?.reasonMessageEn ?? null,
        reasonMessageAr: primary?.reasonMessageAr ?? null,
    };
}

function requireClaimResponse(responseBundle: FhirBundle): FhirClaimResponse {
    const claimResponse = findResource(responseBundle, "ClaimResponse");
    if (claimResponse === undefined) {
        throw new Error("Response bundle does not contain a ClaimResponse");
    }
    return claimResponse;
}

export function normalizeEligibility(responseBundle: FhirBundle): EligibilityResult {
    const response = findResource(responseBundle, "CoverageEligibilityResponse");
    if (response === undefined) {
        throw new Error("Response bundle does not contain a CoverageEligibilityResponse");
    }
    const coverage = findResource(responseBundle, "Coverage");
    const insurerOrg =
        findOrganizationByType(responseBundle, "ins") ?? findResources(responseBundle, "Organization")[0];
    const insurance = response.insurance?.[0];
    const active = insurance?.inforce === true;
    const items = insurance?.item ?? [];
    const benefits = items.flatMap((i) => i.benefit ?? []);
    const benefitCode = (code: string) =>
        benefits.find((b) => b.type.coding?.some((c) => c.code === code));

    const planClassEntry = (code: string) =>
        coverage?.class?.find((c) => c.type.coding?.some((t) => t.code === code));

    const copayPercent = benefitCode("copay-percent")?.allowedUnsignedInt;
    const cap = benefitCode("copay-maximum")?.allowedMoney?.value;
    const limit = benefitCode("benefit")?.allowedMoney?.value;

    return {
        outcome: response.outcome,
        policyStatus: active ? "active" : "not-active",
        cashFallbackRequired: !active,
        statusMessageEn: response.disposition ?? (active ? "Policy Active" : "Policy Inactive / Expired"),
        statusMessageAr: active ? "الوثيقة فعالة" : "الوثيقة غير فعالة / منتهية الصلاحية",
        payerNphiesId: insurerOrg?.identifier?.[0]?.value ?? null,
        payerNameEn: insurerOrg?.name ?? null,
        payerNameAr: insurerOrg?.alias?.[0] ?? null,
        planName: planClassEntry("plan")?.name ?? null,
        planClass: planClassEntry("class")?.value ?? null,
        copayPercentage: copayPercent ?? null,
        consultationCopayCap: cap ?? null,
        coverageLimit: limit ?? null,
        currency: "SAR",
        benefitStart: insurance?.benefitPeriod?.start ?? null,
        benefitEnd: insurance?.benefitPeriod?.end ?? null,
        excludedServices: items.filter((i) => i.excluded === true).map((i) => i.name ?? "Unknown"),
    };
}

export function normalizePreAuthorization(
    requestBundle: FhirBundle,
    responseBundle: FhirBundle,
): PreAuthorizationResult {
    const n = normalizeClaimAdjudication(requestBundle, requireClaimResponse(responseBundle));
    return {
        outcome: n.outcome,
        preAuthRef: n.preAuthRef,
        items: n.items,
        totals: n.totals,
        reasonCode: n.reasonCode,
        reasonMessageEn: n.reasonMessageEn,
        reasonMessageAr: n.reasonMessageAr,
        pollAfterMs: n.outcome === "queued" ? DEFAULT_POLL_INTERVAL_MS : null,
    };
}

export function normalizeClaimSubmission(
    requestBundle: FhirBundle,
    responseBundle: FhirBundle,
    claimReference: string,
): ClaimSubmissionResult {
    const n = normalizeClaimAdjudication(requestBundle, requireClaimResponse(responseBundle));
    const rejected = n.items.filter((i) => i.outcome === "rejected");
    const justification =
        rejected.length > 0
            ? rejected
                .map((i) => `Item ${i.sequence} (${i.description}): ${i.reasonMessageEn ?? "Rejected"}`)
                .join("; ")
            : null;
    const justificationAr =
        rejected.length > 0
            ? rejected
                .map((i) => `البند ${i.sequence} (${i.description}): ${i.reasonMessageAr ?? "مرفوض"}`)
                .join("؛ ")
            : null;
    return {
        outcome: n.outcome,
        claimReference,
        items: n.items,
        totals: n.totals,
        payableAmount: n.totals.insurerShare,
        rejectedAmount: n.totals.rejected,
        patientShare: n.totals.patientShare,
        justification,
        justificationAr,
        missingPreAuthSequences: rejected
            .filter((i) => i.reasonCode === "PREAUTH-REQUIRED")
            .map((i) => i.sequence),
    };
}

export function normalizeEPrescription(
    requestBundle: FhirBundle,
    responseBundle: FhirBundle,
): EPrescriptionResult {
    const n = normalizeClaimAdjudication(requestBundle, requireClaimResponse(responseBundle));
    return {
        outcome: n.outcome,
        approvalRef: n.preAuthRef,
        items: n.items,
        totals: n.totals,
        totalPatientShare: n.totals.patientShare,
        totalInsurerShare: n.totals.insurerShare,
        reasonCode: n.reasonCode,
        reasonMessageEn: n.reasonMessageEn,
        reasonMessageAr: n.reasonMessageAr,
        pollAfterMs: n.outcome === "queued" ? DEFAULT_POLL_INTERVAL_MS : null,
    };
}

export function normalizePoll(
    originalRequestBundle: FhirBundle,
    responseBundle: FhirBundle,
    original: { referenceNumber: string; transactionType: NphiesTransactionType; elapsedMs: number },
): PollResult {
    const task = findResource(responseBundle, "Task");
    const claimResponse = requireClaimResponse(responseBundle);
    const n = normalizeClaimAdjudication(originalRequestBundle, claimResponse);
    const retryAfter = task?.extension?.find((e) => e.url === MJDITAL_EXTENSIONS.retryAfterMs)?.valueInteger;
    return {
        outcome: n.outcome,
        originalReferenceNumber: original.referenceNumber,
        originalTransactionType: original.transactionType,
        preAuthRef: n.preAuthRef,
        elapsedMs: original.elapsedMs,
        pollAfterMs: n.outcome === "queued" ? (retryAfter ?? DEFAULT_POLL_INTERVAL_MS) : null,
        items: n.items,
        totals: n.totals,
        reasonCode: n.reasonCode,
        reasonMessageEn: n.reasonMessageEn,
        reasonMessageAr: n.reasonMessageAr,
    };
}

/* ----------------------------- Error mapping ----------------------------- */

function extractPortalError(bundle: FhirBundle): NphiesPortalError | null {
    const outcome = findResource(bundle, "OperationOutcome");
    const header = findResource(bundle, "MessageHeader");
    const allIssues = outcome?.issue ?? [];
    const errorIssues = allIssues.filter((i) => i.severity === "error" || i.severity === "fatal");
    const headerFailed = header?.response !== undefined && header.response.code !== "ok";
    if (errorIssues.length === 0 && !headerFailed) {
        return null;
    }
    const first = errorIssues[0];
    const issues: NphiesPortalIssue[] = allIssues.map((i) => ({
        severity: i.severity,
        code: i.details?.coding?.[0]?.code ?? i.code,
        ...(i.diagnostics !== undefined ? { diagnostics: i.diagnostics } : {}),
        ...(i.expression !== undefined ? { expression: i.expression } : {}),
    }));
    return {
        code: first?.details?.coding?.[0]?.code ?? "NPHIES_MESSAGE_ERROR",
        messageEn:
            first?.details?.coding?.[0]?.display ?? first?.diagnostics ?? "NPHIES rejected the message",
        messageAr: first?.details?.text ?? "رفضت منصة نفيس الرسالة",
        issues,
    };
}

function toTransportError(error: unknown): NphiesPortalError {
    if (error instanceof NphiesProductionError) {
        return {
            code: error.code,
            messageEn: error.message,
            messageAr:
                error.code === "NPHIES_TIMEOUT"
                    ? "انتهت مهلة الاتصال بمنصة نفيس"
                    : "تعذّر الاتصال بمنصة نفيس",
            issues: [
                {
                    severity: "error",
                    code: error.code,
                    diagnostics: error.message,
                },
            ],
        };
    }
    const message = error instanceof Error ? error.message : "Unknown NPHIES transport error";
    return {
        code: "NPHIES_TRANSPORT_ERROR",
        messageEn: message,
        messageAr: "تعذّر الاتصال بمنصة نفيس",
        issues: [{ severity: "error", code: "NPHIES_TRANSPORT_ERROR", diagnostics: message }],
    };
}

function statusFromOutcome(outcome: NphiesOutcome): NphiesRecordStatus {
    switch (outcome) {
        case "complete":
            return "COMPLETE";
        case "queued":
            return "QUEUED";
        case "partial":
            return "PARTIAL";
        case "error":
            return "ERROR";
    }
}

function notFoundResponse<TResult extends NphiesPortalResult>(
    referenceNumber: string,
    code: string,
    messageEn: string,
    messageAr: string,
    mode: NphiesMode,
): NphiesServiceResponse<TResult> {
    return {
        success: false,
        transactionId: null,
        referenceNumber,
        transactionType: "POLL",
        status: "ERROR",
        mode,
        latencyMs: 0,
        result: null,
        error: {
            code,
            messageEn,
            messageAr,
            issues: [{ severity: "error", code, diagnostics: messageEn }],
        },
        requestBundle: null,
        responseBundle: null,
    };
}

/* ========================================================================== */
/* Service                                                                    */
/* ========================================================================== */

interface ExecuteParams<TResult extends NphiesPortalResult> {
    organizationId: string;
    transactionType: NphiesTransactionType;
    portalRequest: NphiesPortalRequest;
    patientNationalId: string;
    build: (facility: NphiesFacilityContext, now: Date) => BuiltRequest;
    normalize: (requestBundle: FhirBundle, responseBundle: FhirBundle, built: BuiltRequest) => TResult;
    originalTransaction?: NphiesOriginalTransactionSnapshot;
}

export interface NphiesServiceOptions {
    adapter?: NphiesAdapter;
    db?: typeof prisma;
}

export class NphiesService {
    private readonly adapterOverride: NphiesAdapter | undefined;
    private readonly db: typeof prisma;

    constructor(options: NphiesServiceOptions = {}) {
        this.adapterOverride = options.adapter;
        this.db = options.db ?? prisma;
    }

    /** 1. Eligibility Check — Reception Portal. */
    checkEligibility(
        request: EligibilityCheckRequest,
    ): Promise<NphiesServiceResponse<EligibilityResult>> {
        return this.execute<EligibilityResult>({
            organizationId: request.organizationId,
            transactionType: "ELIGIBILITY",
            portalRequest: request,
            patientNationalId: request.patient.nationalId,
            build: (facility, now) => buildEligibilityRequestBundle(request, facility, now),
            normalize: (_req, res) => normalizeEligibility(res),
        });
    }

    /** 2. Pre-Authorization — Doctor Portal (labs, radiology, procedures). */
    requestPreAuthorization(
        request: PreAuthorizationRequest,
    ): Promise<NphiesServiceResponse<PreAuthorizationResult>> {
        return this.execute<PreAuthorizationResult>({
            organizationId: request.organizationId,
            transactionType: "PRE_AUTHORIZATION",
            portalRequest: request,
            patientNationalId: request.patient.nationalId,
            build: (facility, now) => buildPreAuthorizationBundle(request, facility, now),
            normalize: (req, res) => normalizePreAuthorization(req, res),
        });
    }

    /** 3. Claim Submission — post-visit billing. */
    submitClaim(
        request: ClaimSubmissionRequest,
    ): Promise<NphiesServiceResponse<ClaimSubmissionResult>> {
        return this.execute<ClaimSubmissionResult>({
            organizationId: request.organizationId,
            transactionType: "CLAIM",
            portalRequest: request,
            patientNationalId: request.patient.nationalId,
            build: (facility, now) => buildClaimSubmissionBundle(request, facility, now),
            normalize: (req, res, built) => normalizeClaimSubmission(req, res, built.referenceNumber),
        });
    }

    /** 4. e-Prescription — Doctor Portal (validated by SFDA drug code). */
    submitEPrescription(
        request: EPrescriptionRequest,
    ): Promise<NphiesServiceResponse<EPrescriptionResult>> {
        return this.execute<EPrescriptionResult>({
            organizationId: request.organizationId,
            transactionType: "E_PRESCRIPTION",
            portalRequest: request,
            patientNationalId: request.patient.nationalId,
            build: (facility, now) => buildEPrescriptionBundle(request, facility, now),
            normalize: (req, res) => normalizeEPrescription(req, res),
        });
    }

    /** 5. Poll / Status Check — resolves `queued` requests (Task). */
    async pollStatus(request: PollRequest): Promise<NphiesServiceResponse<PollResult>> {
        const mode = this.adapterOverride?.mode ?? resolveNphiesMode();
        const original = await this.loadOriginalTransaction(request.organizationId, request.referenceNumber);

        if (original === null) {
            return notFoundResponse<PollResult>(
                request.referenceNumber,
                "NPHIES_TRANSACTION_NOT_FOUND",
                "No pre-authorization, claim or e-prescription found for this reference",
                "لا توجد معاملة بهذا الرقم المرجعي",
                mode,
            );
        }

        const snapshot = original.snapshot;
        const response = await this.execute<PollResult>({
            organizationId: request.organizationId,
            transactionType: "POLL",
            portalRequest: request,
            patientNationalId: original.patientNationalId,
            originalTransaction: snapshot,
            build: (facility, now) =>
                buildStatusCheckBundle(
                    {
                        originalReferenceNumber: snapshot.referenceNumber,
                        originalRequestBundle: snapshot.requestBundle,
                    },
                    facility,
                    now,
                ),
            normalize: (_req, res) => {
                const created = Date.parse(snapshot.createdAt);
                const elapsedMs = Number.isNaN(created) ? 0 : Math.max(0, Date.now() - created);
                return normalizePoll(snapshot.requestBundle, res, {
                    referenceNumber: snapshot.referenceNumber,
                    transactionType: snapshot.transactionType,
                    elapsedMs,
                });
            },
        });

        // Reflect the resolved state on the original audit row (status only; payloads stay immutable).
        if (response.result !== null && response.result.outcome !== "queued") {
            try {
                await this.db.nphiesTransaction.updateMany({
                    where: { id: original.id, organizationId: request.organizationId },
                    data: { status: statusFromOutcome(response.result.outcome) },
                });
            } catch (error) {
                console.error("[nphies] failed to update original transaction status", error);
            }
        }
        return response;
    }

    /* ------------------------------ internals ------------------------------ */

    private async execute<TResult extends NphiesPortalResult>(
        params: ExecuteParams<TResult>,
    ): Promise<NphiesServiceResponse<TResult>> {
        const adapter = this.adapterOverride ?? getNphiesAdapter();
        const facility = await this.loadFacility(params.organizationId, adapter.mode);
        const now = new Date();
        const built = params.build(facility, now);

        const context: NphiesDispatchContext = {
            organizationId: params.organizationId,
            transactionType: params.transactionType,
            referenceNumber: built.referenceNumber,
            facility,
            ...(params.originalTransaction !== undefined
                ? { originalTransaction: params.originalTransaction }
                : {}),
        };

        const started = performance.now();
        let responseBundle: FhirBundle;
        let portalError: NphiesPortalError | null = null;
        try {
            responseBundle = await adapter.send(built.bundle, context);
        } catch (error) {
            portalError = toTransportError(error);
            const requestHeader = findResource(built.bundle, "MessageHeader");
            responseBundle = buildOperationOutcomeBundle(
                [
                    buildIssue({
                        severity: "error",
                        code: "transient",
                        errorCode: portalError.code,
                        messageEn: portalError.messageEn,
                        messageAr: portalError.messageAr,
                    }),
                ],
                {
                    ...(requestHeader !== undefined ? { requestHeader } : {}),
                    responseCode: "transient-error",
                },
            );
        }
        const latencyMs = Math.round(performance.now() - started);
        // ---------------------------------------------------------------------------
        // CONTINUATION of src/lib/nphies/index.ts
        // Paste this block directly after the line:
        //     const latencyMs = Math.round(performance.now() - started);
        // inside `private async execute(...)`.
        // Housekeeping: delete the unused `NPHIES_SYSTEMS` name from the
        // "./fhir-builder" import list at the top of index.ts (the rest is used).
        // ---------------------------------------------------------------------------

        if (portalError === null) {
            portalError = extractPortalError(responseBundle);
        }

        let result: TResult | null = null;
        if (portalError === null) {
            try {
                result = params.normalize(built.bundle, responseBundle, built);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to parse NPHIES response";
                portalError = {
                    code: "NPHIES_RESPONSE_PARSE_ERROR",
                    messageEn: message,
                    messageAr: "تعذّر قراءة استجابة منصة نفيس",
                    issues: [
                        { severity: "error", code: "NPHIES_RESPONSE_PARSE_ERROR", diagnostics: message },
                    ],
                };
            }
        }

        const status: NphiesRecordStatus =
            result !== null ? statusFromOutcome(result.outcome) : "ERROR";

        const storedRequest: NphiesStoredRequestPayload = {
            portalRequest: params.portalRequest,
            fhirBundle: built.bundle,
        };
        const storedResponse: NphiesStoredResponsePayload = {
            portalResult: result,
            error: portalError,
            fhirBundle: responseBundle,
        };

        const transactionId = await this.persistAudit({
            organizationId: params.organizationId,
            transactionType: params.transactionType,
            referenceNumber: built.referenceNumber,
            patientNationalId: params.patientNationalId,
            request: storedRequest,
            response: storedResponse,
            status,
            mode: adapter.mode,
            latencyMs,
        });

        return {
            success: portalError === null,
            transactionId,
            referenceNumber: built.referenceNumber,
            transactionType: params.transactionType,
            status,
            mode: adapter.mode,
            latencyMs,
            result,
            error: portalError,
            requestBundle: built.bundle,
            responseBundle,
        };
    }

    /** Loads the tenant's facility profile (multi-tenant: always keyed by organizationId). */
    private async loadFacility(
        organizationId: string,
        mode: NphiesMode,
    ): Promise<NphiesFacilityContext> {
        const org = await this.db.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                nameAr: true,
                nameEn: true,
                city: true,
                isActive: true,
                centerSettings: {
                    select: {
                        nphiesFacilityId: true,
                        mohLicenseNumber: true,
                        facilityType: true,
                        tradeNameAr: true,
                        tradeNameEn: true,
                    },
                },
            },
        });

        if (org === null) {
            throw new NphiesConfigurationError(`Organization ${organizationId} was not found`);
        }
        if (!org.isActive) {
            throw new NphiesConfigurationError(`Organization ${organizationId} is not active`);
        }

        const settings = org.centerSettings;
        const configuredId = settings?.nphiesFacilityId?.trim();
        const hasConfiguredId = configuredId !== undefined && configuredId !== "";

        if (!hasConfiguredId && mode === "PRODUCTION") {
            throw new NphiesConfigurationError(
                "CenterSettings.nphiesFacilityId (NPHIES facility license ID) must be configured before using PRODUCTION mode",
            );
        }

        return {
            organizationId: org.id,
            nameAr: settings?.tradeNameAr ?? org.nameAr,
            nameEn: settings?.tradeNameEn ?? org.nameEn,
            nphiesFacilityId: hasConfiguredId ? configuredId : `SIM-${org.id.slice(0, 8).toUpperCase()}`,
            mohLicenseNumber: settings?.mohLicenseNumber ?? null,
            facilityType: settings?.facilityType ?? null,
            city: org.city,
        };
    }

    /** Finds the most recent pollable transaction (pre-auth / claim / e-prescription) for a reference. */
    private async loadOriginalTransaction(
        organizationId: string,
        referenceNumber: string,
    ): Promise<{
        id: string;
        patientNationalId: string;
        snapshot: NphiesOriginalTransactionSnapshot;
    } | null> {
        const row = await this.db.nphiesTransaction.findFirst({
            where: {
                organizationId,
                referenceNumber,
                transactionType: { in: POLLABLE_TYPES },
            },
            orderBy: { createdAt: "desc" },
        });
        if (row === null) {
            return null;
        }

        const requestBundle = readStoredBundle(row.requestPayload);
        const responseBundle = readStoredBundle(row.responsePayload);
        if (requestBundle === null || responseBundle === null) {
            return null;
        }

        return {
            id: row.id,
            patientNationalId: row.patientNationalId,
            snapshot: {
                referenceNumber: row.referenceNumber,
                transactionType: row.transactionType,
                createdAt: row.createdAt.toISOString(),
                requestBundle,
                responseBundle,
            },
        };
    }

    /**
     * Persists the audit record. An audit-write failure is logged but never blocks the
     * clinical / reception workflow (the NPHIES result is still returned to the caller).
     */
    private async persistAudit(input: NphiesAuditLogInput): Promise<string | null> {
        try {
            const row = await this.db.nphiesTransaction.create({
                data: {
                    organizationId: input.organizationId,
                    transactionType: input.transactionType,
                    referenceNumber: input.referenceNumber,
                    patientNationalId: input.patientNationalId.slice(0, 20),
                    requestPayload: toJson(input.request),
                    responsePayload: toJson(input.response),
                    status: input.status,
                    mode: input.mode,
                    latencyMs: input.latencyMs,
                },
                select: { id: true },
            });
            return row.id;
        } catch (error) {
            console.error("[nphies] failed to persist nphies_transactions audit record", error);
            return null;
        }
    }
}

/* ========================================================================== */
/* Singleton + convenience exports                                            */
/* ========================================================================== */

/** Default service instance — mode is resolved from `process.env.NPHIES_MODE` on every call. */
export const nphies = new NphiesService();

export const checkEligibility = (
    request: EligibilityCheckRequest,
): Promise<NphiesServiceResponse<EligibilityResult>> => nphies.checkEligibility(request);

export const requestPreAuthorization = (
    request: PreAuthorizationRequest,
): Promise<NphiesServiceResponse<PreAuthorizationResult>> =>
    nphies.requestPreAuthorization(request);

export const submitClaim = (
    request: ClaimSubmissionRequest,
): Promise<NphiesServiceResponse<ClaimSubmissionResult>> => nphies.submitClaim(request);

export const submitEPrescription = (
    request: EPrescriptionRequest,
): Promise<NphiesServiceResponse<EPrescriptionResult>> => nphies.submitEPrescription(request);

export const pollStatus = (request: PollRequest): Promise<NphiesServiceResponse<PollResult>> =>
    nphies.pollStatus(request);