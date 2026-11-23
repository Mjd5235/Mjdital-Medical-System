// src/lib/nphies/types.ts
/**
 * Mjdital — Saudi NPHIES / HL7 FHIR R4 type definitions.
 *
 * Sections:
 *  1. Core unions
 *  2. Simplified Reception / Doctor Portal request payloads
 *  3. Simplified portal results (normalized, UI-friendly)
 *  4. Service response envelope + audit-log types
 *  5. HL7 FHIR R4 data types, resources and Bundle
 *  6. Adapter (Strategy) contract
 *
 * Rule: zero `any` in this module.
 */

/* ========================================================================== */
/* 1. Core unions                                                             */
/* ========================================================================== */

export type NphiesMode = "SIMULATOR" | "PRODUCTION";

export type NphiesTransactionType =
    | "ELIGIBILITY"
    | "PRE_AUTHORIZATION"
    | "CLAIM"
    | "E_PRESCRIPTION"
    | "POLL";

/** Mirrors FHIR ClaimResponse.outcome / CoverageEligibilityResponse.outcome. */
export type NphiesOutcome = "complete" | "queued" | "partial" | "error";

/** Mirrors the Prisma enum `NphiesTransactionStatus`. */
export type NphiesRecordStatus = "COMPLETE" | "QUEUED" | "PARTIAL" | "ERROR";

export type PortalIdentityType = "NATIONAL_ID" | "IQAMA";

export type ServiceCategory =
    | "consultation"
    | "laboratory"
    | "radiology"
    | "procedure"
    | "dental"
    | "cosmetic"
    | "pharmacy"
    | "other";

export type ImagingModality = "CT" | "MRI" | "XRAY" | "ULTRASOUND" | "OTHER";

export type NphiesMessageEvent =
    | "eligibility-request"
    | "eligibility-response"
    | "priorauth-request"
    | "priorauth-response"
    | "claim-request"
    | "claim-response"
    | "status-check";

/* ========================================================================== */
/* 2. Simplified portal request payloads                                      */
/* ========================================================================== */

export interface PortalPatient {
    /** 10-digit Saudi National ID (starts with 1) or Iqama number (starts with 2). */
    nationalId: string;
    identityType: PortalIdentityType;
    fullNameAr?: string;
    fullNameEn?: string;
    /** ISO date: YYYY-MM-DD */
    dateOfBirth?: string;
    gender?: "male" | "female";
    phone?: string;
    insuranceMemberId?: string;
    insurancePolicyNumber?: string;
}

export interface PortalPayerHint {
    /** `InsuranceProvider.nphiesPayerId` */
    nphiesPayerId?: string;
    nameEn?: string;
    nameAr?: string;
}

export interface PortalPractitioner {
    fullNameEn: string;
    fullNameAr?: string;
    /** SCFHS license number (`Doctor.scfhsLicenseNumber`). */
    scfhsLicenseNumber: string;
    specialty?: string;
}

export interface PortalDiagnosis {
    /** ICD-10-AM code, e.g. "J06.9". */
    icd10AmCode: string;
    description?: string;
    type?: "principal" | "secondary";
}

export interface PortalServiceItem {
    /** SBS (Saudi Billing System) service code. */
    code: string;
    nameEn?: string;
    nameAr?: string;
    category: ServiceCategory;
    modality?: ImagingModality;
    quantity: number;
    /** Unit price in SAR (ex-VAT). */
    unitPrice: number;
    /** Force "prior approval required" for this line. */
    requiresPreAuth?: boolean;
    /** Pre-authorization reference obtained earlier for this specific line. */
    preAuthRef?: string;
}

export interface PortalMedicationItem {
    /** SFDA drug registration / GTIN code. */
    sfdaCode: string;
    nameEn?: string;
    nameAr?: string;
    dosageText: string;
    quantity: number;
    daysSupply: number;
    /** Unit price in SAR. */
    unitPrice: number;
}

interface NphiesBaseRequest {
    /** Tenant scope — every call is bound to exactly one organization. */
    organizationId: string;
    patient: PortalPatient;
    payer?: PortalPayerHint;
}

/** Reception Portal. */
export interface EligibilityCheckRequest extends NphiesBaseRequest {
    /** ISO date; defaults to today. */
    serviceDate?: string;
}

/** Doctor Portal (labs, radiology, procedures). */
export interface PreAuthorizationRequest extends NphiesBaseRequest {
    practitioner: PortalPractitioner;
    diagnoses: PortalDiagnosis[];
    items: PortalServiceItem[];
}

/** Billing — post-visit. */
export interface ClaimSubmissionRequest extends NphiesBaseRequest {
    practitioner: PortalPractitioner;
    diagnoses: PortalDiagnosis[];
    items: PortalServiceItem[];
    /** Claim-level pre-authorization reference (applies to every line needing prior approval). */
    preAuthRef?: string;
}

/** Doctor Portal — e-Prescription. */
export interface EPrescriptionRequest extends NphiesBaseRequest {
    practitioner: PortalPractitioner;
    diagnoses: PortalDiagnosis[];
    medications: PortalMedicationItem[];
}

/** Poll / Status Check for a previously `queued` transaction. */
export interface PollRequest {
    organizationId: string;
    /** The `referenceNumber` returned by the original pre-authorization / claim / e-prescription call. */
    referenceNumber: string;
}

export type NphiesPortalRequest =
    | EligibilityCheckRequest
    | PreAuthorizationRequest
    | ClaimSubmissionRequest
    | EPrescriptionRequest
    | PollRequest;

/* ========================================================================== */
/* 3. Simplified portal results                                               */
/* ========================================================================== */

export interface EligibilityResult {
    outcome: NphiesOutcome;
    policyStatus: "active" | "not-active";
    /** True when the Reception desk must show the cash-payment fallback alert. */
    cashFallbackRequired: boolean;
    statusMessageEn: string;
    statusMessageAr: string;
    payerNphiesId: string | null;
    payerNameEn: string | null;
    payerNameAr: string | null;
    planName: string | null;
    planClass: string | null;
    /** General co-pay percentage (0–100). */
    copayPercentage: number | null;
    /** Maximum patient share per consultation (SAR), when the plan defines one. */
    consultationCopayCap: number | null;
    /** Annual coverage limit (SAR). */
    coverageLimit: number | null;
    currency: "SAR";
    benefitStart: string | null;
    benefitEnd: string | null;
    excludedServices: string[];
}

export type PortalLineOutcome = "approved" | "rejected" | "queued";

export interface PortalItemAdjudication {
    sequence: number;
    /** SBS code or SFDA code. */
    code: string;
    description: string;
    outcome: PortalLineOutcome;
    submittedAmount: number;
    approvedAmount: number;
    patientShare: number;
    insurerShare: number;
    reasonCode: string | null;
    reasonMessageEn: string | null;
    reasonMessageAr: string | null;
}

export interface PortalMoneyTotals {
    submitted: number;
    /** Gross approved (insurer share + patient share). */
    approved: number;
    rejected: number;
    patientShare: number;
    insurerShare: number;
}

export interface PreAuthorizationResult {
    outcome: NphiesOutcome;
    /** Issued only when the request is `complete` / `partial`. */
    preAuthRef: string | null;
    items: PortalItemAdjudication[];
    totals: PortalMoneyTotals;
    reasonCode: string | null;
    reasonMessageEn: string | null;
    reasonMessageAr: string | null;
    /** When `queued`: suggested delay before calling `pollStatus`. */
    pollAfterMs: number | null;
}

export interface ClaimSubmissionResult {
    outcome: NphiesOutcome;
    claimReference: string;
    items: PortalItemAdjudication[];
    totals: PortalMoneyTotals;
    /** Amount the insurer will pay (SAR). */
    payableAmount: number;
    rejectedAmount: number;
    patientShare: number;
    justification: string | null;
    justificationAr: string | null;
    /** Sequences of lines rejected because a required pre-authorization reference was missing. */
    missingPreAuthSequences: number[];
}

export interface EPrescriptionResult {
    outcome: NphiesOutcome;
    /** Approval reference for the prescription (ClaimResponse.preAuthRef). */
    approvalRef: string | null;
    items: PortalItemAdjudication[];
    totals: PortalMoneyTotals;
    totalPatientShare: number;
    totalInsurerShare: number;
    reasonCode: string | null;
    reasonMessageEn: string | null;
    reasonMessageAr: string | null;
    pollAfterMs: number | null;
}

export interface PollResult {
    outcome: NphiesOutcome;
    originalReferenceNumber: string;
    originalTransactionType: NphiesTransactionType;
    preAuthRef: string | null;
    elapsedMs: number;
    pollAfterMs: number | null;
    items: PortalItemAdjudication[];
    totals: PortalMoneyTotals;
    reasonCode: string | null;
    reasonMessageEn: string | null;
    reasonMessageAr: string | null;
}

export type NphiesPortalResult =
    | EligibilityResult
    | PreAuthorizationResult
    | ClaimSubmissionResult
    | EPrescriptionResult
    | PollResult;

/* ========================================================================== */
/* 4. Service envelope + audit types                                          */
/* ========================================================================== */

export interface NphiesPortalIssue {
    severity: FhirIssueSeverity;
    code: string;
    diagnostics?: string;
    expression?: string[];
}

export interface NphiesPortalError {
    code: string;
    messageEn: string;
    messageAr: string;
    issues: NphiesPortalIssue[];
}

export interface NphiesServiceResponse<TResult extends NphiesPortalResult> {
    /** True when NPHIES (or the simulator) processed the message without a message-level error. */
    success: boolean;
    /** `nphies_transactions.id`; null only if the audit insert itself failed. */
    transactionId: string | null;
    referenceNumber: string;
    transactionType: NphiesTransactionType;
    status: NphiesRecordStatus;
    mode: NphiesMode;
    latencyMs: number;
    result: TResult | null;
    error: NphiesPortalError | null;
    requestBundle: FhirBundle | null;
    responseBundle: FhirBundle | null;
}

export interface NphiesStoredRequestPayload {
    portalRequest: NphiesPortalRequest;
    fhirBundle: FhirBundle;
}

export interface NphiesStoredResponsePayload {
    portalResult: NphiesPortalResult | null;
    error: NphiesPortalError | null;
    fhirBundle: FhirBundle | null;
}

export interface NphiesAuditLogInput {
    organizationId: string;
    transactionType: NphiesTransactionType;
    referenceNumber: string;
    patientNationalId: string;
    request: NphiesStoredRequestPayload;
    response: NphiesStoredResponsePayload;
    status: NphiesRecordStatus;
    mode: NphiesMode;
    latencyMs: number;
}

/* ========================================================================== */
/* 5. HL7 FHIR R4                                                             */
/* ========================================================================== */

export interface FhirCoding {
    system?: string;
    version?: string;
    code?: string;
    display?: string;
}

export interface FhirCodeableConcept {
    coding?: FhirCoding[];
    text?: string;
}

export interface FhirIdentifier {
    use?: "usual" | "official" | "secondary";
    type?: FhirCodeableConcept;
    system?: string;
    value?: string;
}

export interface FhirReference {
    reference?: string;
    type?: string;
    identifier?: FhirIdentifier;
    display?: string;
}

export interface FhirPeriod {
    start?: string;
    end?: string;
}

export interface FhirMoney {
    value: number;
    currency: "SAR";
}

export interface FhirQuantity {
    value: number;
    unit?: string;
    system?: string;
    code?: string;
}

export interface FhirHumanName {
    use?: "official" | "usual" | "nickname";
    text?: string;
    family?: string;
    given?: string[];
}

export interface FhirContactPoint {
    system: "phone" | "email" | "url";
    value: string;
    use?: "home" | "work" | "mobile";
}

export interface FhirMeta {
    profile?: string[];
}

export interface FhirExtension {
    url: string;
    valueString?: string;
    valueCode?: string;
    valueBoolean?: boolean;
    valueInteger?: number;
    valueDateTime?: string;
    valueCoding?: FhirCoding;
    valueCodeableConcept?: FhirCodeableConcept;
    valueMoney?: FhirMoney;
    valueQuantity?: FhirQuantity;
    valueReference?: FhirReference;
}

export type FhirIssueSeverity = "fatal" | "error" | "warning" | "information";

export type FhirIssueType =
    | "invalid"
    | "structure"
    | "required"
    | "value"
    | "not-supported"
    | "not-found"
    | "processing"
    | "business-rule"
    | "transient"
    | "timeout"
    | "security"
    | "exception"
    | "informational";

/* ----------------------------- Resources --------------------------------- */

export interface FhirMessageHeader {
    resourceType: "MessageHeader";
    id: string;
    meta?: FhirMeta;
    extension?: FhirExtension[];
    eventCoding: FhirCoding;
    destination: Array<{
        endpoint: string;
        name?: string;
        receiver?: FhirReference;
    }>;
    sender?: FhirReference;
    source: {
        endpoint: string;
        name?: string;
        software?: string;
    };
    focus: FhirReference[];
    response?: {
        identifier: string;
        code: "ok" | "transient-error" | "fatal-error";
        details?: FhirReference;
    };
}

export interface FhirPatient {
    resourceType: "Patient";
    id: string;
    meta?: FhirMeta;
    identifier: FhirIdentifier[];
    active: boolean;
    name: FhirHumanName[];
    telecom?: FhirContactPoint[];
    gender?: "male" | "female" | "other" | "unknown";
    birthDate?: string;
}

export interface FhirCoverageClass {
    type: FhirCodeableConcept;
    value: string;
    name?: string;
}

export interface FhirCoverage {
    resourceType: "Coverage";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "cancelled" | "draft" | "entered-in-error";
    type?: FhirCodeableConcept;
    subscriber?: FhirReference;
    subscriberId?: string;
    beneficiary: FhirReference;
    relationship?: FhirCodeableConcept;
    period?: FhirPeriod;
    payor: FhirReference[];
    class?: FhirCoverageClass[];
}

export interface FhirOrganization {
    resourceType: "Organization";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    active: boolean;
    type?: FhirCodeableConcept[];
    name: string;
    alias?: string[];
    telecom?: FhirContactPoint[];
    address?: Array<{ text?: string; city?: string; country?: string }>;
}

export interface FhirPractitioner {
    resourceType: "Practitioner";
    id: string;
    meta?: FhirMeta;
    identifier: FhirIdentifier[];
    active: boolean;
    name: FhirHumanName[];
    qualification?: Array<{ code: FhirCodeableConcept }>;
}

export interface FhirCoverageEligibilityRequest {
    resourceType: "CoverageEligibilityRequest";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "cancelled" | "draft" | "entered-in-error";
    priority?: FhirCodeableConcept;
    purpose: Array<"auth-requirements" | "benefits" | "discovery" | "validation">;
    patient: FhirReference;
    servicedDate?: string;
    created: string;
    provider: FhirReference;
    insurer: FhirReference;
    insurance?: Array<{ focal?: boolean; coverage: FhirReference }>;
}

export interface FhirEligibilityBenefit {
    type: FhirCodeableConcept;
    allowedUnsignedInt?: number;
    allowedMoney?: FhirMoney;
    usedMoney?: FhirMoney;
}

export interface FhirEligibilityItem {
    category?: FhirCodeableConcept;
    name?: string;
    excluded?: boolean;
    benefit?: FhirEligibilityBenefit[];
}

export interface FhirEligibilityInsurance {
    coverage: FhirReference;
    inforce?: boolean;
    benefitPeriod?: FhirPeriod;
    item?: FhirEligibilityItem[];
}

export interface FhirCoverageEligibilityResponse {
    resourceType: "CoverageEligibilityResponse";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "cancelled" | "draft" | "entered-in-error";
    purpose: Array<"auth-requirements" | "benefits" | "discovery" | "validation">;
    patient: FhirReference;
    servicedDate?: string;
    created: string;
    requestor?: FhirReference;
    request: FhirReference;
    outcome: NphiesOutcome;
    disposition?: string;
    insurer: FhirReference;
    insurance?: FhirEligibilityInsurance[];
    error?: Array<{ code: FhirCodeableConcept }>;
}

export interface FhirClaimCareTeam {
    sequence: number;
    provider: FhirReference;
    role?: FhirCodeableConcept;
}

export interface FhirClaimDiagnosis {
    sequence: number;
    diagnosisCodeableConcept: FhirCodeableConcept;
    type?: FhirCodeableConcept[];
}

export interface FhirClaimInsurance {
    sequence: number;
    focal: boolean;
    coverage: FhirReference;
    preAuthRef?: string[];
}

export interface FhirClaimItem {
    sequence: number;
    careTeamSequence?: number[];
    diagnosisSequence?: number[];
    category?: FhirCodeableConcept;
    productOrService: FhirCodeableConcept;
    servicedDate?: string;
    quantity?: FhirQuantity;
    unitPrice?: FhirMoney;
    net?: FhirMoney;
    extension?: FhirExtension[];
}

export interface FhirClaim {
    resourceType: "Claim";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "cancelled" | "draft" | "entered-in-error";
    type: FhirCodeableConcept;
    subType?: FhirCodeableConcept;
    use: "claim" | "preauthorization" | "predetermination";
    patient: FhirReference;
    created: string;
    insurer: FhirReference;
    provider: FhirReference;
    priority: FhirCodeableConcept;
    prescription?: FhirReference;
    careTeam?: FhirClaimCareTeam[];
    diagnosis?: FhirClaimDiagnosis[];
    insurance: FhirClaimInsurance[];
    item?: FhirClaimItem[];
    total: FhirMoney;
}

export interface FhirAdjudication {
    category: FhirCodeableConcept;
    reason?: FhirCodeableConcept;
    amount?: FhirMoney;
    value?: number;
}

export interface FhirClaimResponseItem {
    itemSequence: number;
    extension?: FhirExtension[];
    adjudication: FhirAdjudication[];
}

export interface FhirClaimResponse {
    resourceType: "ClaimResponse";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "cancelled" | "draft" | "entered-in-error";
    type: FhirCodeableConcept;
    use: "claim" | "preauthorization" | "predetermination";
    patient: FhirReference;
    created: string;
    insurer: FhirReference;
    requestor?: FhirReference;
    request: FhirReference;
    outcome: NphiesOutcome;
    disposition?: string;
    preAuthRef?: string;
    preAuthPeriod?: FhirPeriod;
    item?: FhirClaimResponseItem[];
    total?: Array<{ category: FhirCodeableConcept; amount: FhirMoney }>;
    payment?: { type?: FhirCodeableConcept; amount: FhirMoney };
    processNote?: Array<{
        number?: number;
        type?: "display" | "print" | "printoper";
        text: string;
        language?: FhirCodeableConcept;
    }>;
    error?: Array<{ itemSequence?: number; code: FhirCodeableConcept }>;
}

export interface FhirMedicationRequest {
    resourceType: "MedicationRequest";
    id: string;
    meta?: FhirMeta;
    identifier?: FhirIdentifier[];
    status: "active" | "on-hold" | "cancelled" | "completed" | "entered-in-error" | "draft";
    intent: "proposal" | "plan" | "order" | "original-order";
    medicationCodeableConcept: FhirCodeableConcept;
    subject: FhirReference;
    authoredOn: string;
    requester: FhirReference;
    dosageInstruction?: Array<{
        sequence?: number;
        text?: string;
        timing?: { repeat?: { duration?: number; durationUnit?: "d" } };
    }>;
    dispenseRequest?: {
        quantity?: FhirQuantity;
        expectedSupplyDuration?: FhirQuantity;
    };
}

export interface FhirTaskParameter {
    type: FhirCodeableConcept;
    valueString?: string;
    valueReference?: FhirReference;
}

export interface FhirTask {
    resourceType: "Task";
    id: string;
    meta?: FhirMeta;
    extension?: FhirExtension[];
    identifier?: FhirIdentifier[];
    status:
    | "requested"
    | "received"
    | "accepted"
    | "in-progress"
    | "completed"
    | "failed"
    | "rejected";
    intent: "order";
    priority?: "routine" | "urgent" | "asap" | "stat";
    code?: FhirCodeableConcept;
    description?: string;
    focus?: FhirReference;
    authoredOn: string;
    lastModified?: string;
    requester?: FhirReference;
    owner?: FhirReference;
    input?: FhirTaskParameter[];
    output?: FhirTaskParameter[];
}

export interface FhirOperationOutcomeIssue {
    severity: FhirIssueSeverity;
    code: FhirIssueType;
    details?: FhirCodeableConcept;
    diagnostics?: string;
    expression?: string[];
}

export interface FhirOperationOutcome {
    resourceType: "OperationOutcome";
    id: string;
    meta?: FhirMeta;
    issue: FhirOperationOutcomeIssue[];
}

export type FhirResource =
    | FhirMessageHeader
    | FhirPatient
    | FhirCoverage
    | FhirOrganization
    | FhirPractitioner
    | FhirCoverageEligibilityRequest
    | FhirCoverageEligibilityResponse
    | FhirClaim
    | FhirClaimResponse
    | FhirMedicationRequest
    | FhirTask
    | FhirOperationOutcome;

export type FhirResourceType = FhirResource["resourceType"];

export type FhirResourceOf<T extends FhirResourceType> = Extract<FhirResource, { resourceType: T }>;

export interface FhirBundleEntry {
    fullUrl: string;
    resource: FhirResource;
}

export interface FhirBundle {
    resourceType: "Bundle";
    id: string;
    meta?: FhirMeta;
    type: "message";
    timestamp: string;
    entry: FhirBundleEntry[];
}

/* ========================================================================== */
/* 6. Adapter (Strategy) contract                                             */
/* ========================================================================== */

export interface NphiesFacilityContext {
    organizationId: string;
    nameAr: string;
    nameEn: string;
    /** `CenterSettings.nphiesFacilityId` — the NPHIES provider license ID (sender). */
    nphiesFacilityId: string;
    mohLicenseNumber: string | null;
    facilityType: string | null;
    city: string;
}

export interface BuiltRequest {
    referenceNumber: string;
    bundle: FhirBundle;
}

export interface NphiesOriginalTransactionSnapshot {
    referenceNumber: string;
    transactionType: NphiesTransactionType;
    /** ISO timestamp of the original transaction (`nphies_transactions.created_at`). */
    createdAt: string;
    requestBundle: FhirBundle;
    responseBundle: FhirBundle;
}

export interface NphiesDispatchContext {
    organizationId: string;
    transactionType: NphiesTransactionType;
    referenceNumber: string;
    facility: NphiesFacilityContext;
    /** Only set for POLL — the simulator uses it to compute elapsed time and re-adjudicate. */
    originalTransaction?: NphiesOriginalTransactionSnapshot;
}

/** Strategy interface implemented by both the Simulator and the Production adapter. */
export interface NphiesAdapter {
    readonly mode: NphiesMode;
    send(bundle: FhirBundle, context: NphiesDispatchContext): Promise<FhirBundle>;
}