// src/lib/nphies/fhir-builder.ts
/**
 * Pure HL7 FHIR R4 Bundle builders for Saudi NPHIES.
 *
 * - Request builders are used identically by the Simulator and Production adapters
 *   (the facade builds the bundle once, then hands it to whichever adapter is active).
 * - Builders never validate business data (e.g. national ID format) on purpose:
 *   validation is the receiver's job (simulator / NPHIES), which returns OperationOutcome.
 * - Only side-effect sources: `crypto.randomUUID()` and the injectable `now` Date.
 */

import { randomUUID } from "node:crypto";
import type {
    BuiltRequest,
    FhirBundle,
    FhirBundleEntry,
    FhirClaim,
    FhirClaimItem,
    FhirCodeableConcept,
    FhirCoding,
    FhirCoverage,
    FhirCoverageEligibilityRequest,
    FhirExtension,
    FhirIssueSeverity,
    FhirIssueType,
    FhirMedicationRequest,
    FhirMessageHeader,
    FhirMoney,
    FhirOperationOutcome,
    FhirOperationOutcomeIssue,
    FhirOrganization,
    FhirPatient,
    FhirPractitioner,
    FhirReference,
    FhirResource,
    FhirResourceOf,
    FhirResourceType,
    FhirTask,
    EligibilityCheckRequest,
    ClaimSubmissionRequest,
    EPrescriptionRequest,
    ImagingModality,
    NphiesFacilityContext,
    NphiesMessageEvent,
    PortalDiagnosis,
    PortalMedicationItem,
    PortalPatient,
    PortalPayerHint,
    PortalPractitioner,
    PortalServiceItem,
    PreAuthorizationRequest,
    ServiceCategory,
} from "./types";

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */

export const FHIR_BASE_URL = "http://mjdital.sa/fhir";
const PROFILE_BASE = "http://nphies.sa/StructureDefinition";

export const NPHIES_SYSTEMS = {
    nationalId: "http://nphies.sa/identifier/nationalid",
    iqama: "http://nphies.sa/identifier/iqama",
    providerLicense: "http://nphies.sa/license/provider-license",
    payerLicense: "http://nphies.sa/license/payer-license",
    practitionerLicense: "http://nphies.sa/license/practitioner-license",
    requestIdentifier: "http://mjdital.sa/identifier/request",
    memberIdentifier: "http://mjdital.sa/identifier/member",
    identifierType: "http://terminology.hl7.org/CodeSystem/v2-0203",
    messageEvents: "http://nphies.sa/terminology/CodeSystem/ksa-message-events",
    organizationType: "http://nphies.sa/terminology/CodeSystem/organization-type",
    claimType: "http://terminology.hl7.org/CodeSystem/claim-type",
    claimSubType: "http://nphies.sa/terminology/CodeSystem/claim-subtype",
    processPriority: "http://terminology.hl7.org/CodeSystem/processpriority",
    careTeamRole: "http://terminology.hl7.org/CodeSystem/claimcareteamrole",
    diagnosisType: "http://terminology.hl7.org/CodeSystem/ex-diagnosistype",
    adjudication: "http://terminology.hl7.org/CodeSystem/adjudication",
    adjudicationReason: "http://nphies.sa/terminology/CodeSystem/adjudication-reason",
    adjudicationOutcome: "http://nphies.sa/terminology/CodeSystem/adjudication-outcome",
    benefitType: "http://terminology.hl7.org/CodeSystem/benefit-type",
    benefitCategory: "http://nphies.sa/terminology/CodeSystem/benefit-category",
    coverageClass: "http://terminology.hl7.org/CodeSystem/coverage-class",
    coverageType: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    subscriberRelationship: "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
    /** SBS — Saudi Billing System service codes. */
    sbs: "http://nphies.sa/terminology/CodeSystem/services",
    /** SFDA drug registration codes. */
    sfdaDrug: "http://nphies.sa/terminology/CodeSystem/medication-codes",
    icd10Am: "http://hl7.org/fhir/sid/icd-10-am",
    taskCode: "http://nphies.sa/terminology/CodeSystem/task-code",
    taskInputType: "http://nphies.sa/terminology/CodeSystem/task-input-type",
    taskOutputType: "http://nphies.sa/terminology/CodeSystem/task-output-type",
    serviceCategory: "http://mjdital.sa/CodeSystem/service-category",
    mjditalErrors: "http://mjdital.sa/CodeSystem/nphies-errors",
    bcp47: "urn:ietf:bcp:47",
} as const;

export const MJDITAL_EXTENSIONS = {
    imagingModality: "http://mjdital.sa/StructureDefinition/imaging-modality",
    requiresPreAuth: "http://mjdital.sa/StructureDefinition/requires-preauth",
    itemPreAuthRef: "http://mjdital.sa/StructureDefinition/item-preauth-ref",
    medicationRequest: "http://mjdital.sa/StructureDefinition/medication-request",
    retryAfterMs: "http://mjdital.sa/StructureDefinition/retry-after-ms",
    adjudicationOutcome: "http://nphies.sa/StructureDefinition/extension-adjudication-outcome",
} as const;

const DISCOVERY_PAYER_ID = "INS-DISCOVERY";

/* ========================================================================== */
/* Small pure helpers                                                         */
/* ========================================================================== */

export function newId(): string {
    return randomUUID();
}

export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function money(value: number): FhirMoney {
    return { value: roundMoney(value), currency: "SAR" };
}

export function coding(system: string, code: string, display?: string): FhirCoding {
    return display === undefined ? { system, code } : { system, code, display };
}

export function concept(
    system: string,
    code: string,
    display?: string,
    text?: string,
): FhirCodeableConcept {
    return text === undefined
        ? { coding: [coding(system, code, display)] }
        : { coding: [coding(system, code, display)], text };
}

export function resourceRef(type: FhirResourceType, id: string, display?: string): FhirReference {
    return display === undefined
        ? { reference: `${type}/${id}`, type }
        : { reference: `${type}/${id}`, type, display };
}

export function toEntry(resource: FhirResource): FhirBundleEntry {
    return { fullUrl: `${FHIR_BASE_URL}/${resource.resourceType}/${resource.id}`, resource };
}

export function toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function generateReferenceNumber(prefix: string, now: Date): string {
    const stamp = toDateString(now).replace(/-/g, "");
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return `${prefix}-${stamp}-${suffix}`;
}

function profile(name: string): { profile: string[] } {
    return { profile: [`${PROFILE_BASE}/${name}`] };
}

export function findResource<T extends FhirResourceType>(
    bundle: FhirBundle,
    type: T,
): FhirResourceOf<T> | undefined {
    for (const entry of bundle.entry) {
        if (entry.resource.resourceType === type) {
            return entry.resource as FhirResourceOf<T>;
        }
    }
    return undefined;
}

export function findResources<T extends FhirResourceType>(
    bundle: FhirBundle,
    type: T,
): Array<FhirResourceOf<T>> {
    const found: Array<FhirResourceOf<T>> = [];
    for (const entry of bundle.entry) {
        if (entry.resource.resourceType === type) {
            found.push(entry.resource as FhirResourceOf<T>);
        }
    }
    return found;
}

/** Finds the provider ("prov") or insurer ("ins") Organization in a bundle. */
export function findOrganizationByType(
    bundle: FhirBundle,
    kind: "prov" | "ins",
): FhirOrganization | undefined {
    return findResources(bundle, "Organization").find((org) =>
        (org.type ?? []).some((t) => (t.coding ?? []).some((c) => c.code === kind)),
    );
}

export function getPatientIdentifierValue(patient: FhirPatient): string | null {
    const match = patient.identifier.find(
        (id) => id.system === NPHIES_SYSTEMS.nationalId || id.system === NPHIES_SYSTEMS.iqama,
    );
    return match?.value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFhirBundle(value: unknown): value is FhirBundle {
    return (
        isRecord(value) &&
        value["resourceType"] === "Bundle" &&
        Array.isArray(value["entry"]) &&
        value["entry"].every(
            (e: unknown) => isRecord(e) && isRecord(e["resource"]) && typeof e["resource"]["resourceType"] === "string",
        )
    );
}

export function isOperationOutcome(value: unknown): value is FhirOperationOutcome {
    return (
        isRecord(value) && value["resourceType"] === "OperationOutcome" && Array.isArray(value["issue"])
    );
}

/* ========================================================================== */
/* Issues + error bundles                                                     */
/* ========================================================================== */

export function buildIssue(args: {
    severity: FhirIssueSeverity;
    code: FhirIssueType;
    errorCode: string;
    messageEn: string;
    messageAr: string;
    expression?: string[];
}): FhirOperationOutcomeIssue {
    return {
        severity: args.severity,
        code: args.code,
        details: {
            coding: [coding(NPHIES_SYSTEMS.mjditalErrors, args.errorCode, args.messageEn)],
            text: args.messageAr,
        },
        diagnostics: args.messageEn,
        ...(args.expression !== undefined ? { expression: args.expression } : {}),
    };
}

/** Builds a response Bundle that carries only an OperationOutcome (validation / transport failure). */
export function buildOperationOutcomeBundle(
    issues: FhirOperationOutcomeIssue[],
    options: {
        requestHeader?: FhirMessageHeader;
        responseCode?: "fatal-error" | "transient-error";
        now?: Date;
    } = {},
): FhirBundle {
    const now = options.now ?? new Date();
    const requestHeader = options.requestHeader;
    const outcome: FhirOperationOutcome = {
        resourceType: "OperationOutcome",
        id: newId(),
        issue: issues,
    };
    const header: FhirMessageHeader = {
        resourceType: "MessageHeader",
        id: newId(),
        eventCoding:
            requestHeader?.eventCoding ?? coding(NPHIES_SYSTEMS.messageEvents, "error-response"),
        destination: [
            {
                endpoint:
                    requestHeader?.source.endpoint ?? `${NPHIES_SYSTEMS.providerLicense}/UNKNOWN`,
                ...(requestHeader?.sender !== undefined ? { receiver: requestHeader.sender } : {}),
            },
        ],
        source: { endpoint: "http://nphies.sa", name: "NPHIES" },
        focus: [resourceRef("OperationOutcome", outcome.id)],
        response: {
            identifier: requestHeader?.id ?? "unknown",
            code: options.responseCode ?? "fatal-error",
        },
    };
    return wrapBundle([header, outcome], now);
}

export function wrapBundle(resources: FhirResource[], now: Date): FhirBundle {
    return {
        resourceType: "Bundle",
        id: newId(),
        meta: profile("ksa-message"),
        type: "message",
        timestamp: now.toISOString(),
        entry: resources.map(toEntry),
    };
}

/* ========================================================================== */
/* Shared resource builders                                                   */
/* ========================================================================== */

function splitName(fullName: string): { family: string; given: string[] } {
    const parts = fullName
        .trim()
        .split(/\s+/)
        .filter((p) => p.length > 0);
    if (parts.length <= 1) {
        return { family: parts[0] ?? fullName, given: [] };
    }
    return { family: parts[parts.length - 1] ?? "", given: parts.slice(0, -1) };
}

export function buildProviderOrganization(facility: NphiesFacilityContext): FhirOrganization {
    return {
        resourceType: "Organization",
        id: newId(),
        meta: profile("ksa-provider-organization"),
        identifier: [
            {
                use: "official",
                system: NPHIES_SYSTEMS.providerLicense,
                value: facility.nphiesFacilityId,
            },
        ],
        active: true,
        type: [concept(NPHIES_SYSTEMS.organizationType, "prov", "Healthcare Provider")],
        name: facility.nameEn,
        alias: [facility.nameAr],
        address: [{ city: facility.city, country: "SA" }],
    };
}

export function buildInsurerOrganization(payer: {
    licenseId: string;
    nameEn: string;
    nameAr?: string;
}): FhirOrganization {
    return {
        resourceType: "Organization",
        id: newId(),
        meta: profile("ksa-insurer-organization"),
        identifier: [{ use: "official", system: NPHIES_SYSTEMS.payerLicense, value: payer.licenseId }],
        active: true,
        type: [concept(NPHIES_SYSTEMS.organizationType, "ins", "Insurance Company")],
        name: payer.nameEn,
        ...(payer.nameAr !== undefined ? { alias: [payer.nameAr] } : {}),
    };
}

export function buildPatientResource(patient: PortalPatient): FhirPatient {
    const isIqama = patient.identityType === "IQAMA";
    const names: FhirPatient["name"] = [];
    const en = patient.fullNameEn?.trim();
    const ar = patient.fullNameAr?.trim();
    if (en !== undefined && en.length > 0) {
        const { family, given } = splitName(en);
        names.push({ use: "official", text: en, family, given });
    }
    if (ar !== undefined && ar.length > 0) {
        names.push({ use: "usual", text: ar });
    }
    if (names.length === 0) {
        names.push({ use: "official", text: "Unknown" });
    }
    return {
        resourceType: "Patient",
        id: newId(),
        meta: profile("ksa-patient"),
        identifier: [
            {
                use: "official",
                type: concept(
                    NPHIES_SYSTEMS.identifierType,
                    isIqama ? "PRC" : "NI",
                    isIqama ? "Permanent Resident Card (Iqama)" : "National Identifier",
                ),
                system: isIqama ? NPHIES_SYSTEMS.iqama : NPHIES_SYSTEMS.nationalId,
                value: patient.nationalId,
            },
        ],
        active: true,
        name: names,
        ...(patient.phone !== undefined
            ? { telecom: [{ system: "phone" as const, value: patient.phone, use: "mobile" as const }] }
            : {}),
        ...(patient.gender !== undefined ? { gender: patient.gender } : {}),
        ...(patient.dateOfBirth !== undefined ? { birthDate: patient.dateOfBirth } : {}),
    };
}

export function buildPractitionerResource(practitioner: PortalPractitioner): FhirPractitioner {
    const { family, given } = splitName(practitioner.fullNameEn);
    const names: FhirPractitioner["name"] = [
        { use: "official", text: practitioner.fullNameEn, family, given },
    ];
    if (practitioner.fullNameAr !== undefined && practitioner.fullNameAr.trim().length > 0) {
        names.push({ use: "usual", text: practitioner.fullNameAr.trim() });
    }
    return {
        resourceType: "Practitioner",
        id: newId(),
        meta: profile("ksa-practitioner"),
        identifier: [
            {
                use: "official",
                system: NPHIES_SYSTEMS.practitionerLicense,
                value: practitioner.scfhsLicenseNumber,
            },
        ],
        active: true,
        name: names,
        ...(practitioner.specialty !== undefined
            ? { qualification: [{ code: { text: practitioner.specialty } }] }
            : {}),
    };
}

export function buildCoverageResource(
    patient: PortalPatient,
    patientResource: FhirPatient,
    insurer: FhirOrganization,
): FhirCoverage {
    const patientRef = resourceRef("Patient", patientResource.id);
    return {
        resourceType: "Coverage",
        id: newId(),
        meta: profile("ksa-coverage"),
        ...(patient.insuranceMemberId !== undefined
            ? {
                identifier: [
                    {
                        use: "official" as const,
                        system: NPHIES_SYSTEMS.memberIdentifier,
                        value: patient.insuranceMemberId,
                    },
                ],
                subscriberId: patient.insuranceMemberId,
            }
            : {}),
        status: "active",
        type: concept(NPHIES_SYSTEMS.coverageType, "EHCPOL", "extended healthcare"),
        subscriber: patientRef,
        beneficiary: patientRef,
        relationship: concept(NPHIES_SYSTEMS.subscriberRelationship, "self", "Self"),
        payor: [resourceRef("Organization", insurer.id, insurer.name)],
        ...(patient.insurancePolicyNumber !== undefined
            ? {
                class: [
                    {
                        type: concept(NPHIES_SYSTEMS.coverageClass, "group", "Group"),
                        value: patient.insurancePolicyNumber,
                    },
                ],
            }
            : {}),
    };
}

interface PartyBundle {
    provider: FhirOrganization;
    insurer: FhirOrganization;
    patient: FhirPatient;
    coverage: FhirCoverage;
    payerLicenseId: string;
    payerName: string;
}

function buildParties(
    request: { patient: PortalPatient; payer?: PortalPayerHint },
    facility: NphiesFacilityContext,
): PartyBundle {
    const payerLicenseId = request.payer?.nphiesPayerId ?? DISCOVERY_PAYER_ID;
    const payerName = request.payer?.nameEn ?? request.payer?.nameAr ?? "Payer Discovery";
    const provider = buildProviderOrganization(facility);
    const insurer = buildInsurerOrganization({
        licenseId: payerLicenseId,
        nameEn: payerName,
        ...(request.payer?.nameAr !== undefined ? { nameAr: request.payer.nameAr } : {}),
    });
    const patient = buildPatientResource(request.patient);
    const coverage = buildCoverageResource(request.patient, patient, insurer);
    return { provider, insurer, patient, coverage, payerLicenseId, payerName };
}

export function buildMessageHeader(args: {
    event: NphiesMessageEvent;
    facility: NphiesFacilityContext;
    payerLicenseId: string;
    focus: FhirReference[];
}): FhirMessageHeader {
    const providerEndpoint = `${NPHIES_SYSTEMS.providerLicense}/${args.facility.nphiesFacilityId}`;
    return {
        resourceType: "MessageHeader",
        id: newId(),
        meta: profile("ksa-message-header"),
        eventCoding: coding(NPHIES_SYSTEMS.messageEvents, args.event),
        destination: [
            {
                endpoint: `${NPHIES_SYSTEMS.payerLicense}/${args.payerLicenseId}`,
                receiver: {
                    type: "Organization",
                    identifier: { system: NPHIES_SYSTEMS.payerLicense, value: args.payerLicenseId },
                },
            },
        ],
        sender: {
            type: "Organization",
            identifier: {
                system: NPHIES_SYSTEMS.providerLicense,
                value: args.facility.nphiesFacilityId,
            },
        },
        source: { endpoint: providerEndpoint, name: args.facility.nameEn, software: "Mjdital" },
        focus: args.focus,
    };
}

/* ========================================================================== */
/* 1. Eligibility                                                             */
/* ========================================================================== */

export function buildEligibilityRequestBundle(
    request: EligibilityCheckRequest,
    facility: NphiesFacilityContext,
    now: Date = new Date(),
): BuiltRequest {
    const parties = buildParties(request, facility);
    const referenceNumber = generateReferenceNumber("ELG", now);

    const eligibility: FhirCoverageEligibilityRequest = {
        resourceType: "CoverageEligibilityRequest",
        id: newId(),
        meta: profile("ksa-coverage-eligibility-request"),
        identifier: [{ system: NPHIES_SYSTEMS.requestIdentifier, value: referenceNumber }],
        status: "active",
        priority: concept(NPHIES_SYSTEMS.processPriority, "normal", "Normal"),
        purpose: ["benefits", "validation"],
        patient: resourceRef("Patient", parties.patient.id),
        servicedDate: request.serviceDate ?? toDateString(now),
        created: now.toISOString(),
        provider: resourceRef("Organization", parties.provider.id),
        insurer: resourceRef("Organization", parties.insurer.id),
        insurance: [{ focal: true, coverage: resourceRef("Coverage", parties.coverage.id) }],
    };

    const header = buildMessageHeader({
        event: "eligibility-request",
        facility,
        payerLicenseId: parties.payerLicenseId,
        focus: [resourceRef("CoverageEligibilityRequest", eligibility.id)],
    });

    return {
        referenceNumber,
        bundle: wrapBundle(
            [header, eligibility, parties.provider, parties.insurer, parties.patient, parties.coverage],
            now,
        ),
    };
}

/* ========================================================================== */
/* 2 / 3 / 4. Claim-family builders (pre-auth, claim, e-prescription)         */
/* ========================================================================== */

interface ClaimLineInput {
    code: string;
    system: string;
    display: string;
    text?: string;
    category: ServiceCategory;
    modality?: ImagingModality;
    quantity: number;
    unitPrice: number;
    requiresPreAuth?: boolean;
    preAuthRef?: string;
    medicationRequestId?: string;
}

interface ClaimBundleArgs {
    use: "preauthorization" | "claim";
    event: "priorauth-request" | "claim-request";
    refPrefix: string;
    claimTypeCode: "professional" | "oral" | "pharmacy";
    request: {
        patient: PortalPatient;
        payer?: PortalPayerHint;
        practitioner: PortalPractitioner;
        diagnoses: PortalDiagnosis[];
    };
    lines: ClaimLineInput[];
    claimLevelPreAuthRef?: string;
    medications?: Array<{ id: string; item: PortalMedicationItem }>;
    facility: NphiesFacilityContext;
    now: Date;
}

function buildClaimItem(
    line: ClaimLineInput,
    sequence: number,
    diagnosisCount: number,
    servicedDate: string,
): FhirClaimItem {
    const extension: FhirExtension[] = [];
    if (line.modality !== undefined) {
        extension.push({ url: MJDITAL_EXTENSIONS.imagingModality, valueCode: line.modality });
    }
    if (line.requiresPreAuth === true) {
        extension.push({ url: MJDITAL_EXTENSIONS.requiresPreAuth, valueBoolean: true });
    }
    if (line.preAuthRef !== undefined) {
        extension.push({ url: MJDITAL_EXTENSIONS.itemPreAuthRef, valueString: line.preAuthRef });
    }
    if (line.medicationRequestId !== undefined) {
        extension.push({
            url: MJDITAL_EXTENSIONS.medicationRequest,
            valueReference: resourceRef("MedicationRequest", line.medicationRequestId),
        });
    }
    const diagnosisSequence = Array.from({ length: diagnosisCount }, (_, i) => i + 1);
    return {
        sequence,
        careTeamSequence: [1],
        ...(diagnosisSequence.length > 0 ? { diagnosisSequence } : {}),
        category: concept(NPHIES_SYSTEMS.serviceCategory, line.category),
        productOrService: {
            coding: [coding(line.system, line.code, line.display)],
            ...(line.text !== undefined ? { text: line.text } : {}),
        },
        servicedDate,
        quantity: { value: line.quantity },
        unitPrice: money(line.unitPrice),
        net: money(line.quantity * line.unitPrice),
        ...(extension.length > 0 ? { extension } : {}),
    };
}

function buildClaimBundle(args: ClaimBundleArgs): BuiltRequest {
    const { facility, now } = args;
    const parties = buildParties(args.request, facility);
    const practitioner = buildPractitionerResource(args.request.practitioner);
    const referenceNumber = generateReferenceNumber(args.refPrefix, now);
    const today = toDateString(now);

    const medicationRequests: FhirMedicationRequest[] = (args.medications ?? []).map(({ id, item }) => ({
        resourceType: "MedicationRequest",
        id,
        meta: profile("ksa-medication-request"),
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
            coding: [
                coding(NPHIES_SYSTEMS.sfdaDrug, item.sfdaCode, item.nameEn ?? item.nameAr ?? item.sfdaCode),
            ],
            ...(item.nameAr !== undefined ? { text: item.nameAr } : {}),
        },
        subject: resourceRef("Patient", parties.patient.id),
        authoredOn: now.toISOString(),
        requester: resourceRef("Practitioner", practitioner.id),
        dosageInstruction: [
            {
                sequence: 1,
                text: item.dosageText,
                timing: { repeat: { duration: item.daysSupply, durationUnit: "d" } },
            },
        ],
        dispenseRequest: {
            quantity: { value: item.quantity },
            expectedSupplyDuration: {
                value: item.daysSupply,
                unit: "day",
                system: "http://unitsofmeasure.org",
                code: "d",
            },
        },
    }));

    const diagnoses = args.request.diagnoses.map((dx, index) => ({
        sequence: index + 1,
        diagnosisCodeableConcept: {
            coding: [coding(NPHIES_SYSTEMS.icd10Am, dx.icd10AmCode, dx.description)],
        },
        type: [
            concept(
                NPHIES_SYSTEMS.diagnosisType,
                dx.type ?? (index === 0 ? "principal" : "secondary"),
            ),
        ],
    }));

    const items = args.lines.map((line, index) =>
        buildClaimItem(line, index + 1, diagnoses.length, today),
    );
    const total = items.reduce((sum, item) => sum + (item.net?.value ?? 0), 0);

    const preAuthRefs = Array.from(
        new Set(
            [
                ...(args.claimLevelPreAuthRef !== undefined ? [args.claimLevelPreAuthRef] : []),
                ...args.lines.flatMap((l) => (l.preAuthRef !== undefined ? [l.preAuthRef] : [])),
            ].filter((ref) => ref.trim().length > 0),
        ),
    );

    const firstMedication = medicationRequests[0];

    const claim: FhirClaim = {
        resourceType: "Claim",
        id: newId(),
        meta: profile("ksa-claim"),
        identifier: [{ system: NPHIES_SYSTEMS.requestIdentifier, value: referenceNumber }],
        status: "active",
        type: concept(NPHIES_SYSTEMS.claimType, args.claimTypeCode),
        subType: concept(NPHIES_SYSTEMS.claimSubType, "op", "Outpatient"),
        use: args.use,
        patient: resourceRef("Patient", parties.patient.id),
        created: now.toISOString(),
        insurer: resourceRef("Organization", parties.insurer.id),
        provider: resourceRef("Organization", parties.provider.id),
        priority: concept(NPHIES_SYSTEMS.processPriority, "normal", "Normal"),
        ...(firstMedication !== undefined
            ? { prescription: resourceRef("MedicationRequest", firstMedication.id) }
            : {}),
        careTeam: [
            {
                sequence: 1,
                provider: resourceRef("Practitioner", practitioner.id),
                role: concept(NPHIES_SYSTEMS.careTeamRole, "primary", "Primary provider"),
            },
        ],
        ...(diagnoses.length > 0 ? { diagnosis: diagnoses } : {}),
        insurance: [
            {
                sequence: 1,
                focal: true,
                coverage: resourceRef("Coverage", parties.coverage.id),
                ...(preAuthRefs.length > 0 ? { preAuthRef: preAuthRefs } : {}),
            },
        ],
        item: items,
        total: money(total),
    };

    const header = buildMessageHeader({
        event: args.event,
        facility,
        payerLicenseId: parties.payerLicenseId,
        focus: [resourceRef("Claim", claim.id)],
    });

    return {
        referenceNumber,
        bundle: wrapBundle(
            [
                header,
                claim,
                parties.provider,
                parties.insurer,
                parties.patient,
                parties.coverage,
                practitioner,
                ...medicationRequests,
            ],
            now,
        ),
    };
}

function serviceItemToLine(item: PortalServiceItem): ClaimLineInput {
    return {
        code: item.code,
        system: NPHIES_SYSTEMS.sbs,
        display: item.nameEn ?? item.nameAr ?? item.code,
        ...(item.nameAr !== undefined ? { text: item.nameAr } : {}),
        category: item.category,
        ...(item.modality !== undefined ? { modality: item.modality } : {}),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.requiresPreAuth !== undefined ? { requiresPreAuth: item.requiresPreAuth } : {}),
        ...(item.preAuthRef !== undefined ? { preAuthRef: item.preAuthRef } : {}),
    };
}

function inferClaimType(items: PortalServiceItem[]): "professional" | "oral" {
    return items.length > 0 && items.every((i) => i.category === "dental") ? "oral" : "professional";
}

/** 2. Pre-Authorization — `Claim.use = "preauthorization"`. */
export function buildPreAuthorizationBundle(
    request: PreAuthorizationRequest,
    facility: NphiesFacilityContext,
    now: Date = new Date(),
): BuiltRequest {
    return buildClaimBundle({
        use: "preauthorization",
        event: "priorauth-request",
        refPrefix: "PRA",
        claimTypeCode: inferClaimType(request.items),
        request,
        lines: request.items.map(serviceItemToLine),
        facility,
        now,
    });
}

/** 3. Claim Submission — `Claim.use = "claim"`. */
export function buildClaimSubmissionBundle(
    request: ClaimSubmissionRequest,
    facility: NphiesFacilityContext,
    now: Date = new Date(),
): BuiltRequest {
    return buildClaimBundle({
        use: "claim",
        event: "claim-request",
        refPrefix: "CLM",
        claimTypeCode: inferClaimType(request.items),
        request,
        lines: request.items.map(serviceItemToLine),
        ...(request.preAuthRef !== undefined ? { claimLevelPreAuthRef: request.preAuthRef } : {}),
        facility,
        now,
    });
}

/** 4. e-Prescription — pharmacy `Claim` (use "preauthorization") + `MedicationRequest` per drug. */
export function buildEPrescriptionBundle(
    request: EPrescriptionRequest,
    facility: NphiesFacilityContext,
    now: Date = new Date(),
): BuiltRequest {
    const medications = request.medications.map((item) => ({ id: newId(), item }));
    const lines: ClaimLineInput[] = medications.map(({ id, item }) => ({
        code: item.sfdaCode,
        system: NPHIES_SYSTEMS.sfdaDrug,
        display: item.nameEn ?? item.nameAr ?? item.sfdaCode,
        ...(item.nameAr !== undefined ? { text: item.nameAr } : {}),
        category: "pharmacy",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        medicationRequestId: id,
    }));
    return buildClaimBundle({
        use: "preauthorization",
        event: "priorauth-request",
        refPrefix: "ERX",
        claimTypeCode: "pharmacy",
        request,
        lines,
        medications,
        facility,
        now,
    });
}

/* ========================================================================== */
/* 5. Poll / Status Check (Task)                                              */
/* ========================================================================== */

export function buildStatusCheckBundle(
    input: {
        originalReferenceNumber: string;
        originalRequestBundle: FhirBundle;
    },
    facility: NphiesFacilityContext,
    now: Date = new Date(),
): BuiltRequest {
    const originalHeader = findResource(input.originalRequestBundle, "MessageHeader");
    const payerLicenseId =
        originalHeader?.destination[0]?.receiver?.identifier?.value ?? DISCOVERY_PAYER_ID;

    const provider = buildProviderOrganization(facility);
    const insurer = buildInsurerOrganization({
        licenseId: payerLicenseId,
        nameEn: findOrganizationByType(input.originalRequestBundle, "ins")?.name ?? "Payer",
    });

    const task: FhirTask = {
        resourceType: "Task",
        id: newId(),
        meta: profile("ksa-task"),
        identifier: [{ system: NPHIES_SYSTEMS.requestIdentifier, value: `STS-${newId()}` }],
        status: "requested",
        intent: "order",
        priority: "routine",
        code: concept(NPHIES_SYSTEMS.taskCode, "status-check", "Status Check"),
        description: `Status check for ${input.originalReferenceNumber}`,
        focus: {
            type: "Claim",
            identifier: {
                system: NPHIES_SYSTEMS.requestIdentifier,
                value: input.originalReferenceNumber,
            },
        },
        authoredOn: now.toISOString(),
        lastModified: now.toISOString(),
        requester: resourceRef("Organization", provider.id),
        owner: resourceRef("Organization", insurer.id),
        input: [
            {
                type: concept(NPHIES_SYSTEMS.taskInputType, "request-identifier", "Request Identifier"),
                valueString: input.originalReferenceNumber,
            },
        ],
    };

    const header = buildMessageHeader({
        event: "status-check",
        facility,
        payerLicenseId,
        focus: [resourceRef("Task", task.id)],
    });

    return {
        referenceNumber: input.originalReferenceNumber,
        bundle: wrapBundle([header, task, provider, insurer], now),
    };
}