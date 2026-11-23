// src/lib/nphies/simulator.ts
/**
 * NPHIES Smart Simulator — deterministic, FHIR-R4-compliant response engine.
 *
 * Test triggers (last digit of the patient's National ID / Iqama):
 *   1 → Bupa Arabia (VIP), 0% co-pay, immediate approval for everything
 *   2 → Tawuniya (Standard), 20% co-pay (consultation capped at 100 SAR),
 *       services > 500 SAR are `queued` and resolve to `complete` after the poll threshold
 *   3 → Medgulf (Limited), 10% co-pay, rejects dental / cosmetic / CT scan
 *   0 → Inactive / expired policy
 *   other (valid 10-digit ID starting with 1 or 2) → Standard approved, 15% co-pay
 *   invalid format → FHIR OperationOutcome validation error
 *
 * Extra deterministic rules:
 *   - Claim lines needing prior approval (radiology, procedure, flagged, or > 500 SAR non-consultation)
 *     are rejected with PREAUTH-REQUIRED when no valid `PA-YYYY-XXXXXXXXXX` reference is supplied.
 *   - SFDA codes starting with "99" are "not in formulary"; codes must be 4–20 alphanumeric chars.
 */

import { createHash } from "node:crypto";
import {
    MJDITAL_EXTENSIONS,
    NPHIES_SYSTEMS,
    buildInsurerOrganization,
    buildIssue,
    buildOperationOutcomeBundle,
    concept,
    coding,
    findOrganizationByType,
    findResource,
    getPatientIdentifierValue,
    money,
    newId,
    resourceRef,
    roundMoney,
    toDateString,
    wrapBundle,
} from "./fhir-builder";
import type {
    FhirAdjudication,
    FhirBundle,
    FhirClaim,
    FhirClaimResponse,
    FhirClaimResponseItem,
    FhirCoverage,
    FhirCoverageEligibilityResponse,
    FhirEligibilityItem,
    FhirMessageHeader,
    FhirOperationOutcomeIssue,
    FhirOrganization,
    FhirTask,
    NphiesAdapter,
    NphiesDispatchContext,
    NphiesMessageEvent,
    NphiesMode,
    NphiesOutcome,
    PortalLineOutcome,
    ServiceCategory,
} from "./types";

/* ========================================================================== */
/* Options                                                                    */
/* ========================================================================== */

export interface NphiesSimulatorOptions {
    /** Artificial network latency per call. */
    latencyMs?: number;
    /** Elapsed time after which a `queued` request resolves to `complete` when polled. */
    queueDelayMs?: number;
    /** Injectable clock for tests. */
    now?: () => Date;
}

const DEFAULT_LATENCY_MS = 250;
const DEFAULT_QUEUE_DELAY_MS = 5000;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const PREAUTH_REF_PATTERN = /^PA-\d{4}-[0-9A-F]{10}$/;
const SFDA_CODE_PATTERN = /^[0-9A-Za-z-]{4,20}$/;

/* ========================================================================== */
/* Coverage profiles                                                          */
/* ========================================================================== */

type CoverageProfileKey = "VIP" | "STANDARD" | "LIMITED" | "INACTIVE" | "DEFAULT";

interface SimPayer {
    licenseId: string;
    nameEn: string;
    nameAr: string;
}

interface CoverageProfile {
    key: CoverageProfileKey;
    active: boolean;
    payer: SimPayer;
    planCode: string;
    planName: string;
    planClass: string;
    copayPercent: number;
    consultationCopayCap: number | null;
    coverageLimit: number;
    /** Lines with net > this value are `queued` on pre-auth / e-prescription. */
    queueAboveAmount: number | null;
    excludedCategories: ServiceCategory[];
    excludesCtScan: boolean;
}

const PAYERS = {
    bupa: { licenseId: "INS-BUPA", nameEn: "Bupa Arabia", nameAr: "بوبا العربية" },
    tawuniya: { licenseId: "INS-TAWUNIYA", nameEn: "Tawuniya", nameAr: "التعاونية" },
    medgulf: { licenseId: "INS-MEDGULF", nameEn: "Medgulf", nameAr: "ميدغلف" },
    rajhi: {
        licenseId: "INS-RAJHI-TAKAFUL",
        nameEn: "Al Rajhi Takaful",
        nameAr: "الراجحي للتكافل",
    },
    unknown: { licenseId: "INS-UNKNOWN", nameEn: "Unidentified Payer", nameAr: "جهة غير محددة" },
} as const satisfies Record<string, SimPayer>;

const PROFILES: Record<CoverageProfileKey, CoverageProfile> = {
    VIP: {
        key: "VIP",
        active: true,
        payer: PAYERS.bupa,
        planCode: "BUPA-VIP-GOLD",
        planName: "Bupa VIP Gold",
        planClass: "VIP",
        copayPercent: 0,
        consultationCopayCap: null,
        coverageLimit: 1_000_000,
        queueAboveAmount: null,
        excludedCategories: [],
        excludesCtScan: false,
    },
    STANDARD: {
        key: "STANDARD",
        active: true,
        payer: PAYERS.tawuniya,
        planCode: "TWN-STD",
        planName: "Tawuniya Standard",
        planClass: "B",
        copayPercent: 20,
        consultationCopayCap: 100,
        coverageLimit: 250_000,
        queueAboveAmount: 500,
        excludedCategories: [],
        excludesCtScan: false,
    },
    LIMITED: {
        key: "LIMITED",
        active: true,
        payer: PAYERS.medgulf,
        planCode: "MDG-LTD",
        planName: "Medgulf Limited",
        planClass: "C",
        copayPercent: 10,
        consultationCopayCap: null,
        coverageLimit: 50_000,
        queueAboveAmount: null,
        excludedCategories: ["dental", "cosmetic"],
        excludesCtScan: true,
    },
    INACTIVE: {
        key: "INACTIVE",
        active: false,
        payer: PAYERS.unknown,
        planCode: "EXPIRED",
        planName: "Expired Policy",
        planClass: "N/A",
        copayPercent: 0,
        consultationCopayCap: null,
        coverageLimit: 0,
        queueAboveAmount: null,
        excludedCategories: [],
        excludesCtScan: false,
    },
    DEFAULT: {
        key: "DEFAULT",
        active: true,
        payer: PAYERS.rajhi,
        planCode: "RJH-STD",
        planName: "Al Rajhi Standard",
        planClass: "B",
        copayPercent: 15,
        consultationCopayCap: null,
        coverageLimit: 150_000,
        queueAboveAmount: null,
        excludedCategories: [],
        excludesCtScan: false,
    },
};

/** Returns the deterministic coverage profile, or `null` when the ID format is invalid. */
export function resolveSimulatorCoverageProfile(nationalId: string): CoverageProfile | null {
    if (!NATIONAL_ID_PATTERN.test(nationalId)) {
        return null;
    }
    switch (nationalId.charAt(nationalId.length - 1)) {
        case "1":
            return PROFILES.VIP;
        case "2":
            return PROFILES.STANDARD;
        case "3":
            return PROFILES.LIMITED;
        case "0":
            return PROFILES.INACTIVE;
        default:
            return PROFILES.DEFAULT;
    }
}

/* ========================================================================== */
/* Reasons                                                                    */
/* ========================================================================== */

interface Reason {
    code: string;
    en: string;
    ar: string;
}

const REASONS = {
    POLICY_INACTIVE: {
        code: "POLICY-INACTIVE",
        en: "Policy Inactive / Expired",
        ar: "الوثيقة غير فعالة / منتهية الصلاحية",
    },
    NOT_COVERED: {
        code: "SERVICE-NOT-COVERED",
        en: "Service not covered under patient policy",
        ar: "الخدمة غير مشمولة بوثيقة المريض",
    },
    PREAUTH_REQUIRED: {
        code: "PREAUTH-REQUIRED",
        en: "Prior authorization reference is required for this service",
        ar: "مطلوب رقم موافقة مسبقة لهذه الخدمة",
    },
    PREAUTH_INVALID: {
        code: "PREAUTH-INVALID",
        en: "Prior authorization reference is invalid or not recognized",
        ar: "رقم الموافقة المسبقة غير صالح أو غير معروف",
    },
    PENDING_REVIEW: {
        code: "PENDING-REVIEW",
        en: "Pending insurer clinical review",
        ar: "قيد المراجعة الطبية لدى شركة التأمين",
    },
    NOT_IN_FORMULARY: {
        code: "DRUG-NOT-IN-FORMULARY",
        en: "Medication is not in the insurer formulary",
        ar: "الدواء غير مدرج في قائمة أدوية شركة التأمين",
    },
    INVALID_SFDA: {
        code: "INVALID-SFDA-CODE",
        en: "Invalid SFDA drug code",
        ar: "رمز الهيئة العامة للغذاء والدواء غير صالح",
    },
} as const satisfies Record<string, Reason>;

/* ========================================================================== */
/* Claim line extraction + adjudication                                       */
/* ========================================================================== */

const SERVICE_CATEGORIES: readonly string[] = [
    "consultation",
    "laboratory",
    "radiology",
    "procedure",
    "dental",
    "cosmetic",
    "pharmacy",
    "other",
];

function isServiceCategory(value: string | undefined): value is ServiceCategory {
    return value !== undefined && SERVICE_CATEGORIES.includes(value);
}

interface SimLine {
    sequence: number;
    code: string;
    display: string;
    category: ServiceCategory;
    modality: string | null;
    net: number;
    requiresPreAuthFlag: boolean;
    itemPreAuthRef: string | null;
}

interface AdjudicatedLine {
    line: SimLine;
    outcome: PortalLineOutcome;
    approved: number;
    patientShare: number;
    insurerShare: number;
    reason: Reason | null;
}

function extractLines(claim: FhirClaim): SimLine[] {
    const isPharmacy = (claim.type.coding ?? []).some((c) => c.code === "pharmacy");
    return (claim.item ?? []).map((item) => {
        const firstCoding = item.productOrService.coding?.[0];
        const categoryCode = item.category?.coding?.[0]?.code;
        const quantity = item.quantity?.value ?? 1;
        const unitPrice = item.unitPrice?.value ?? 0;
        const extensions = item.extension ?? [];
        const code = firstCoding?.code ?? "";
        const display = `${firstCoding?.display ?? ""} ${item.productOrService.text ?? ""}`.trim();
        return {
            sequence: item.sequence,
            code,
            display: display.length > 0 ? display : code,
            category: isServiceCategory(categoryCode) ? categoryCode : isPharmacy ? "pharmacy" : "other",
            modality:
                extensions.find((e) => e.url === MJDITAL_EXTENSIONS.imagingModality)?.valueCode ?? null,
            net: item.net?.value ?? roundMoney(quantity * unitPrice),
            requiresPreAuthFlag: extensions.some(
                (e) => e.url === MJDITAL_EXTENSIONS.requiresPreAuth && e.valueBoolean === true,
            ),
            itemPreAuthRef:
                extensions.find((e) => e.url === MJDITAL_EXTENSIONS.itemPreAuthRef)?.valueString ?? null,
        };
    });
}

function isCtScan(line: SimLine): boolean {
    if (line.modality === "CT") {
        return true;
    }
    if (line.display.includes("الأشعة المقطعية") || line.display.includes("الاشعة المقطعية")) {
        return true;
    }
    return (
        line.category === "radiology" && /\bCT\b|computed tomography|CAT scan/i.test(line.display)
    );
}

function requiresPriorApproval(line: SimLine): boolean {
    if (line.requiresPreAuthFlag) {
        return true;
    }
    if (line.category === "radiology" || line.category === "procedure") {
        return true;
    }
    return line.category !== "consultation" && line.net > 500;
}

function computeShares(
    profile: CoverageProfile,
    line: SimLine,
): { patient: number; insurer: number } {
    let patient = roundMoney((line.net * profile.copayPercent) / 100);
    if (profile.consultationCopayCap !== null && line.category === "consultation") {
        patient = Math.min(patient, profile.consultationCopayCap);
    }
    return { patient, insurer: roundMoney(line.net - patient) };
}

function rejectLine(line: SimLine, reason: Reason): AdjudicatedLine {
    return { line, outcome: "rejected", approved: 0, patientShare: 0, insurerShare: 0, reason };
}

function adjudicateLine(
    profile: CoverageProfile,
    line: SimLine,
    options: {
        isClaimUse: boolean;
        isPharmacy: boolean;
        claimPreAuthRefs: string[];
        resolveQueued: boolean;
    },
): AdjudicatedLine {
    if (!profile.active) {
        return rejectLine(line, REASONS.POLICY_INACTIVE);
    }

    if (options.isPharmacy) {
        if (!SFDA_CODE_PATTERN.test(line.code)) {
            return rejectLine(line, REASONS.INVALID_SFDA);
        }
        if (line.code.startsWith("99")) {
            return rejectLine(line, REASONS.NOT_IN_FORMULARY);
        }
    } else if (
        profile.excludedCategories.includes(line.category) ||
        (profile.excludesCtScan && isCtScan(line))
    ) {
        return rejectLine(line, REASONS.NOT_COVERED);
    }

    if (options.isClaimUse && requiresPriorApproval(line)) {
        const refs = line.itemPreAuthRef !== null ? [line.itemPreAuthRef] : options.claimPreAuthRefs;
        if (refs.length === 0) {
            return rejectLine(line, REASONS.PREAUTH_REQUIRED);
        }
        if (!refs.some((ref) => PREAUTH_REF_PATTERN.test(ref))) {
            return rejectLine(line, REASONS.PREAUTH_INVALID);
        }
    }

    if (
        !options.isClaimUse &&
        profile.queueAboveAmount !== null &&
        line.net > profile.queueAboveAmount &&
        !options.resolveQueued
    ) {
        return {
            line,
            outcome: "queued",
            approved: 0,
            patientShare: 0,
            insurerShare: 0,
            reason: REASONS.PENDING_REVIEW,
        };
    }

    const shares = computeShares(profile, line);
    return {
        line,
        outcome: "approved",
        approved: line.net,
        patientShare: shares.patient,
        insurerShare: shares.insurer,
        reason: null,
    };
}

function aggregateOutcome(lines: AdjudicatedLine[]): NphiesOutcome {
    if (lines.length > 0 && lines.every((l) => l.outcome === "rejected")) {
        return "error";
    }
    if (lines.some((l) => l.outcome === "queued")) {
        return "queued";
    }
    if (lines.some((l) => l.outcome === "rejected")) {
        return "partial";
    }
    return "complete";
}

export function derivePreAuthRef(claimIdentifier: string, createdIso: string): string {
    const year = createdIso.slice(0, 4);
    const digest = createHash("sha256").update(claimIdentifier).digest("hex").slice(0, 10);
    return `PA-${year}-${digest.toUpperCase()}`;
}

/* ========================================================================== */
/* Bundle validation                                                          */
/* ========================================================================== */

type RequestEvent = "eligibility-request" | "priorauth-request" | "claim-request" | "status-check";

function isRequestEvent(code: string | undefined): code is RequestEvent {
    return (
        code === "eligibility-request" ||
        code === "priorauth-request" ||
        code === "claim-request" ||
        code === "status-check"
    );
}

interface ValidationOutcome {
    event: RequestEvent | null;
    issues: FhirOperationOutcomeIssue[];
}

function validateRequestBundle(bundle: FhirBundle): ValidationOutcome {
    const issues: FhirOperationOutcomeIssue[] = [];
    const fail = (
        code: FhirOperationOutcomeIssue["code"],
        errorCode: string,
        messageEn: string,
        messageAr: string,
        expression?: string[],
    ): void => {
        issues.push(
            buildIssue({
                severity: "error",
                code,
                errorCode,
                messageEn,
                messageAr,
                ...(expression !== undefined ? { expression } : {}),
            }),
        );
    };

    const bundleType: string = bundle.type;
    if (bundleType !== "message") {
        fail("structure", "INVALID-BUNDLE-TYPE", "Bundle.type must be 'message'", "نوع الحزمة يجب أن يكون message", ["Bundle.type"]);
    }
    if (bundle.entry.length === 0) {
        fail("required", "EMPTY-BUNDLE", "Bundle.entry must not be empty", "حزمة الرسالة فارغة", ["Bundle.entry"]);
        return { event: null, issues };
    }
    if (bundle.entry[0]?.resource.resourceType !== "MessageHeader") {
        fail("structure", "MISSING-MESSAGE-HEADER", "The first Bundle entry must be a MessageHeader", "أول عنصر في الحزمة يجب أن يكون MessageHeader", ["Bundle.entry[0]"]);
        return { event: null, issues };
    }

    const header = findResource(bundle, "MessageHeader");
    const eventCode = header?.eventCoding.code;
    if (header === undefined || !isRequestEvent(eventCode)) {
        fail("not-supported", "UNSUPPORTED-EVENT", `Unsupported MessageHeader.eventCoding '${eventCode ?? ""}'`, "نوع الرسالة غير مدعوم", ["MessageHeader.eventCoding"]);
        return { event: null, issues };
    }
    if (header.sender?.identifier?.value === undefined || header.sender.identifier.value === "") {
        fail("required", "MISSING-SENDER", "MessageHeader.sender (provider license) is required", "معرّف المنشأة المرسلة (ترخيص نفيس) مطلوب", ["MessageHeader.sender"]);
    }
    if (header.destination.length === 0) {
        fail("required", "MISSING-DESTINATION", "MessageHeader.destination is required", "وجهة الرسالة مطلوبة", ["MessageHeader.destination"]);
    }

    const patient = findResource(bundle, "Patient");
    const needsPatient = eventCode !== "status-check";
    if (needsPatient) {
        if (patient === undefined) {
            fail("required", "MISSING-PATIENT", "Patient resource is required", "بيانات المريض مطلوبة", ["Bundle.entry.resource.ofType(Patient)"]);
        } else {
            const id = getPatientIdentifierValue(patient);
            if (id === null) {
                fail("required", "MISSING-IDENTIFIER", "Patient identifier (National ID / Iqama) is required", "رقم الهوية الوطنية / الإقامة مطلوب", ["Patient.identifier"]);
            } else if (!NATIONAL_ID_PATTERN.test(id)) {
                fail(
                    "value",
                    "INVALID-IDENTIFIER",
                    "Patient identifier must be a 10-digit National ID / Iqama starting with 1 or 2",
                    "رقم الهوية يجب أن يتكون من 10 أرقام ويبدأ بـ 1 أو 2",
                    ["Patient.identifier.value"],
                );
            }
        }
        if (findResource(bundle, "Coverage") === undefined) {
            fail("required", "MISSING-COVERAGE", "Coverage resource is required", "بيانات التغطية التأمينية مطلوبة", ["Bundle.entry.resource.ofType(Coverage)"]);
        }
        if (findOrganizationByType(bundle, "prov") === undefined) {
            fail("required", "MISSING-PROVIDER", "Provider Organization is required", "بيانات المنشأة الصحية مطلوبة", ["Bundle.entry.resource.ofType(Organization)"]);
        }
        if (findOrganizationByType(bundle, "ins") === undefined) {
            fail("required", "MISSING-INSURER", "Insurer Organization is required", "بيانات شركة التأمين مطلوبة", ["Bundle.entry.resource.ofType(Organization)"]);
        }
    }

    if (eventCode === "eligibility-request") {
        if (findResource(bundle, "CoverageEligibilityRequest") === undefined) {
            fail("required", "MISSING-ELIGIBILITY-REQUEST", "CoverageEligibilityRequest is required", "طلب التحقق من الأهلية مفقود", ["Bundle.entry.resource.ofType(CoverageEligibilityRequest)"]);
        }
    } else if (eventCode === "priorauth-request" || eventCode === "claim-request") {
        const claim = findResource(bundle, "Claim");
        if (claim === undefined) {
            fail("required", "MISSING-CLAIM", "Claim resource is required", "مورد المطالبة مفقود", ["Bundle.entry.resource.ofType(Claim)"]);
        } else {
            const expectedUse = eventCode === "claim-request" ? "claim" : "preauthorization";
            if (claim.use !== expectedUse) {
                fail("business-rule", "CLAIM-USE-MISMATCH", `Claim.use must be '${expectedUse}' for event '${eventCode}'`, "قيمة Claim.use لا تطابق نوع الرسالة", ["Claim.use"]);
            }
            if ((claim.item ?? []).length === 0) {
                fail("required", "MISSING-CLAIM-ITEMS", "Claim must contain at least one item", "يجب أن تحتوي المطالبة على بند واحد على الأقل", ["Claim.item"]);
            }
            for (const item of claim.item ?? []) {
                const code = item.productOrService.coding?.[0]?.code;
                if (code === undefined || code.trim() === "") {
                    fail("required", "MISSING-ITEM-CODE", `Claim.item[${item.sequence}] requires a productOrService code`, "رمز الخدمة مطلوب لكل بند", [`Claim.item[${item.sequence}].productOrService`]);
                }
                if (item.quantity === undefined || item.quantity.value <= 0) {
                    fail("value", "INVALID-ITEM-QUANTITY", `Claim.item[${item.sequence}] quantity must be greater than 0`, "كمية البند يجب أن تكون أكبر من صفر", [`Claim.item[${item.sequence}].quantity`]);
                }
                if (item.unitPrice === undefined || item.unitPrice.value < 0) {
                    fail("value", "INVALID-ITEM-PRICE", `Claim.item[${item.sequence}] unitPrice must be 0 or greater`, "سعر الوحدة غير صالح", [`Claim.item[${item.sequence}].unitPrice`]);
                }
            }
        }
        if (findResource(bundle, "Practitioner") === undefined) {
            fail("required", "MISSING-PRACTITIONER", "Practitioner resource is required", "بيانات الممارس الصحي مطلوبة", ["Bundle.entry.resource.ofType(Practitioner)"]);
        }
    } else {
        if (findResource(bundle, "Task") === undefined) {
            fail("required", "MISSING-TASK", "Task resource is required for status-check", "مورد المهمة (Task) مطلوب لمتابعة الحالة", ["Bundle.entry.resource.ofType(Task)"]);
        }
    }

    return { event: eventCode, issues };
}

/* ========================================================================== */
/* Response builders                                                          */
/* ========================================================================== */

function buildResponseHeader(
    requestHeader: FhirMessageHeader,
    event: NphiesMessageEvent,
    focus: FhirMessageHeader["focus"],
): FhirMessageHeader {
    return {
        resourceType: "MessageHeader",
        id: newId(),
        eventCoding: coding(NPHIES_SYSTEMS.messageEvents, event),
        destination: [
            {
                endpoint: requestHeader.source.endpoint,
                ...(requestHeader.sender !== undefined ? { receiver: requestHeader.sender } : {}),
            },
        ],
        source: { endpoint: "http://nphies.sa", name: "NPHIES Simulator", software: "Mjdital-Sim" },
        focus,
        response: { identifier: requestHeader.id, code: "ok" },
    };
}

function simInsurerOrganization(payer: SimPayer): FhirOrganization {
    return buildInsurerOrganization(payer);
}

function resolvePayer(profile: CoverageProfile, requestInsurer: FhirOrganization | undefined): SimPayer {
    if (profile.active) {
        return profile.payer;
    }
    const license = requestInsurer?.identifier?.[0]?.value;
    if (requestInsurer !== undefined && license !== undefined && license !== "INS-DISCOVERY") {
        return {
            licenseId: license,
            nameEn: requestInsurer.name,
            nameAr: requestInsurer.alias?.[0] ?? requestInsurer.name,
        };
    }
    return profile.payer;
}

function buildEligibilityResponse(
    requestBundle: FhirBundle,
    profile: CoverageProfile,
    now: Date,
): FhirBundle {
    const requestHeader = findResource(requestBundle, "MessageHeader");
    const request = findResource(requestBundle, "CoverageEligibilityRequest");
    if (requestHeader === undefined || request === undefined) {
        return buildOperationOutcomeBundle(
            [
                buildIssue({
                    severity: "error",
                    code: "required",
                    errorCode: "MISSING-ELIGIBILITY-REQUEST",
                    messageEn: "CoverageEligibilityRequest is required",
                    messageAr: "طلب التحقق من الأهلية مفقود",
                }),
            ],
            { now },
        );
    }

    const payer = resolvePayer(profile, findOrganizationByType(requestBundle, "ins"));
    const insurer = simInsurerOrganization(payer);

    const periodStart = profile.active
        ? toDateString(new Date(now.getTime() - 90 * 86_400_000))
        : toDateString(new Date(now.getTime() - 400 * 86_400_000));
    const periodEnd = profile.active
        ? toDateString(new Date(now.getTime() + 275 * 86_400_000))
        : toDateString(new Date(now.getTime() - 35 * 86_400_000));

    const coverage: FhirCoverage = {
        resourceType: "Coverage",
        id: newId(),
        status: profile.active ? "active" : "cancelled",
        type: concept(NPHIES_SYSTEMS.coverageType, "EHCPOL", "extended healthcare"),
        beneficiary: request.patient,
        payor: [resourceRef("Organization", insurer.id, insurer.name)],
        period: { start: periodStart, end: periodEnd },
        class: [
            {
                type: concept(NPHIES_SYSTEMS.coverageClass, "plan", "Plan"),
                value: profile.planCode,
                name: profile.planName,
            },
            {
                type: concept(NPHIES_SYSTEMS.coverageClass, "class", "Class"),
                value: profile.planClass,
                name: `Class ${profile.planClass}`,
            },
        ],
    };

    const items: FhirEligibilityItem[] = [];
    if (profile.active) {
        items.push({
            category: concept(NPHIES_SYSTEMS.benefitCategory, "medical", "Medical Care"),
            name: "Medical Care",
            excluded: false,
            benefit: [
                {
                    type: concept(NPHIES_SYSTEMS.benefitType, "benefit", "Benefit"),
                    allowedMoney: money(profile.coverageLimit),
                    usedMoney: money(0),
                },
                {
                    type: concept(NPHIES_SYSTEMS.benefitType, "copay-percent", "Copay Percent"),
                    allowedUnsignedInt: profile.copayPercent,
                },
            ],
        });
        items.push({
            category: concept(NPHIES_SYSTEMS.benefitCategory, "consultation", "Consultation"),
            name: "Consultation",
            excluded: false,
            benefit: [
                {
                    type: concept(NPHIES_SYSTEMS.benefitType, "copay-percent", "Copay Percent"),
                    allowedUnsignedInt: profile.copayPercent,
                },
                ...(profile.consultationCopayCap !== null
                    ? [
                        {
                            type: concept(NPHIES_SYSTEMS.benefitType, "copay-maximum", "Copay Maximum"),
                            allowedMoney: money(profile.consultationCopayCap),
                        },
                    ]
                    : []),
            ],
        });
        for (const category of profile.excludedCategories) {
            items.push({
                category: concept(NPHIES_SYSTEMS.benefitCategory, category),
                name: category === "dental" ? "Dental" : "Cosmetic",
                excluded: true,
            });
        }
        if (profile.excludesCtScan) {
            items.push({
                category: concept(NPHIES_SYSTEMS.benefitCategory, "ct-scan"),
                name: "CT Scan (الأشعة المقطعية)",
                excluded: true,
            });
        }
    }

    const response: FhirCoverageEligibilityResponse = {
        resourceType: "CoverageEligibilityResponse",
        id: newId(),
        status: "active",
        purpose: request.purpose,
        patient: request.patient,
        ...(request.servicedDate !== undefined ? { servicedDate: request.servicedDate } : {}),
        created: now.toISOString(),
        requestor: request.provider,
        request: resourceRef("CoverageEligibilityRequest", request.id),
        outcome: "complete",
        disposition: profile.active ? "Policy Active" : "Policy Inactive / Expired",
        insurer: resourceRef("Organization", insurer.id, insurer.name),
        insurance: [
            {
                coverage: resourceRef("Coverage", coverage.id),
                inforce: profile.active,
                benefitPeriod: { start: periodStart, end: periodEnd },
                ...(items.length > 0 ? { item: items } : {}),
            },
        ],
    };

    const header = buildResponseHeader(requestHeader, "eligibility-response", [
        resourceRef("CoverageEligibilityResponse", response.id),
    ]);
    return wrapBundle([header, response, insurer, coverage], now);
}

interface ClaimAdjudication {
    claimResponse: FhirClaimResponse;
    insurer: FhirOrganization;
}

const EN_LANG = { coding: [coding(NPHIES_SYSTEMS.bcp47, "en")] };
const AR_LANG = { coding: [coding(NPHIES_SYSTEMS.bcp47, "ar")] };

function reasonConcept(reason: Reason): FhirClaimResponseItem["adjudication"][number]["reason"] {
    return concept(NPHIES_SYSTEMS.adjudicationReason, reason.code, reason.en, reason.ar);
}

function adjudicateClaimBundle(
    requestBundle: FhirBundle,
    now: Date,
    resolveQueued: boolean,
): ClaimAdjudication | null {
    const claim = findResource(requestBundle, "Claim");
    const patient = findResource(requestBundle, "Patient");
    if (claim === undefined || patient === undefined) {
        return null;
    }
    const nationalId = getPatientIdentifierValue(patient) ?? "";
    const profile = resolveSimulatorCoverageProfile(nationalId);
    if (profile === null) {
        return null;
    }

    const isClaimUse = claim.use === "claim";
    const isPharmacy = (claim.type.coding ?? []).some((c) => c.code === "pharmacy");
    const claimPreAuthRefs = claim.insurance.flatMap((i) => i.preAuthRef ?? []);
    const identifierValue =
        claim.identifier?.find((i) => i.system === NPHIES_SYSTEMS.requestIdentifier)?.value ?? claim.id;

    const lines = extractLines(claim).map((line) =>
        adjudicateLine(profile, line, { isClaimUse, isPharmacy, claimPreAuthRefs, resolveQueued }),
    );
    const outcome = aggregateOutcome(lines);
    const payer = resolvePayer(profile, findOrganizationByType(requestBundle, "ins"));
    const insurer = simInsurerOrganization(payer);

    const items: FhirClaimResponseItem[] = lines.map((l) => {
        const adjudication: FhirAdjudication[] = [
            { category: concept(NPHIES_SYSTEMS.adjudication, "submitted"), amount: money(l.line.net) },
        ];
        if (l.outcome === "approved") {
            adjudication.push(
                { category: concept(NPHIES_SYSTEMS.adjudication, "eligible"), amount: money(l.approved) },
                { category: concept(NPHIES_SYSTEMS.adjudication, "copay"), amount: money(l.patientShare) },
                { category: concept(NPHIES_SYSTEMS.adjudication, "benefit"), amount: money(l.insurerShare) },
            );
        } else if (l.reason !== null) {
            adjudication.push({
                category: concept(NPHIES_SYSTEMS.adjudication, "benefit"),
                reason: reasonConcept(l.reason),
                amount: money(0),
            });
        }
        return {
            itemSequence: l.line.sequence,
            extension: [
                {
                    url: MJDITAL_EXTENSIONS.adjudicationOutcome,
                    valueCodeableConcept: concept(NPHIES_SYSTEMS.adjudicationOutcome, l.outcome),
                },
            ],
            adjudication,
        };
    });

    const sum = (pick: (l: AdjudicatedLine) => number): number =>
        roundMoney(lines.reduce((acc, l) => acc + pick(l), 0));
    const submittedTotal = sum((l) => l.line.net);
    const copayTotal = sum((l) => l.patientShare);
    const benefitTotal = sum((l) => l.insurerShare);

    const firstRejected = lines.find((l) => l.outcome === "rejected" && l.reason !== null);
    const rejectedCount = lines.filter((l) => l.outcome === "rejected").length;

    let disposition: string;
    if (outcome === "complete") {
        disposition = isClaimUse
            ? "Claim approved"
            : isPharmacy
                ? "Prescription approved"
                : "Prior authorization approved";
    } else if (outcome === "queued") {
        disposition = "Request queued for insurer clinical review";
    } else if (outcome === "partial") {
        disposition = `Partially approved — ${rejectedCount} item(s) rejected`;
    } else {
        disposition = firstRejected?.reason?.en ?? "Request rejected";
    }

    const processNote: NonNullable<FhirClaimResponse["processNote"]> = [];
    for (const l of lines) {
        if (l.reason !== null && l.outcome === "rejected") {
            processNote.push(
                { number: processNote.length + 1, type: "display", text: `Item ${l.line.sequence}: ${l.reason.en}`, language: EN_LANG },
                { number: processNote.length + 2, type: "display", text: `البند ${l.line.sequence}: ${l.reason.ar}`, language: AR_LANG },
            );
        }
    }

    const issuesPreAuth = !isClaimUse && (outcome === "complete" || outcome === "partial");
    const preAuthRef = issuesPreAuth ? derivePreAuthRef(identifierValue, claim.created) : undefined;

    const claimResponse: FhirClaimResponse = {
        resourceType: "ClaimResponse",
        id: newId(),
        identifier: [{ system: NPHIES_SYSTEMS.requestIdentifier, value: identifierValue }],
        status: "active",
        type: claim.type,
        use: claim.use,
        patient: claim.patient,
        created: now.toISOString(),
        insurer: resourceRef("Organization", insurer.id, insurer.name),
        requestor: claim.provider,
        request: resourceRef("Claim", claim.id),
        outcome,
        disposition,
        ...(preAuthRef !== undefined
            ? {
                preAuthRef,
                preAuthPeriod: {
                    start: toDateString(now),
                    end: toDateString(new Date(now.getTime() + 30 * 86_400_000)),
                },
            }
            : {}),
        item: items,
        total: [
            { category: concept(NPHIES_SYSTEMS.adjudication, "submitted"), amount: money(submittedTotal) },
            { category: concept(NPHIES_SYSTEMS.adjudication, "copay"), amount: money(copayTotal) },
            { category: concept(NPHIES_SYSTEMS.adjudication, "benefit"), amount: money(benefitTotal) },
        ],
        ...(isClaimUse && (outcome === "complete" || outcome === "partial")
            ? { payment: { amount: money(benefitTotal) } }
            : {}),
        ...(processNote.length > 0 ? { processNote } : {}),
        ...(outcome === "error" && firstRejected?.reason !== undefined && firstRejected.reason !== null
            ? { error: [{ code: reasonConcept(firstRejected.reason) ?? {} }] }
            : {}),
    };

    return { claimResponse, insurer };
}

/* ========================================================================== */
/* Adapter                                                                    */
/* ========================================================================== */

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class NphiesSimulatorAdapter implements NphiesAdapter {
    readonly mode: NphiesMode = "SIMULATOR";

    private readonly latencyMs: number;
    private readonly queueDelayMs: number;
    private readonly clock: () => Date;

    constructor(options: NphiesSimulatorOptions = {}) {
        this.latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
        this.queueDelayMs = options.queueDelayMs ?? DEFAULT_QUEUE_DELAY_MS;
        this.clock = options.now ?? (() => new Date());
    }

    async send(bundle: FhirBundle, context: NphiesDispatchContext): Promise<FhirBundle> {
        if (this.latencyMs > 0) {
            await sleep(this.latencyMs);
        }
        const now = this.clock();
        const requestHeader = findResource(bundle, "MessageHeader");
        const { event, issues } = validateRequestBundle(bundle);

        if (event === null || issues.length > 0) {
            return buildOperationOutcomeBundle(issues, {
                ...(requestHeader !== undefined ? { requestHeader } : {}),
                responseCode: "fatal-error",
                now,
            });
        }
        if (requestHeader === undefined) {
            return buildOperationOutcomeBundle(issues, { now });
        }

        switch (event) {
            case "eligibility-request":
                return this.handleEligibility(bundle, now);
            case "priorauth-request":
            case "claim-request":
                return this.handleClaim(bundle, requestHeader, now);
            case "status-check":
                return this.handleStatusCheck(bundle, requestHeader, context, now);
        }
    }

    private handleEligibility(bundle: FhirBundle, now: Date): FhirBundle {
        const patient = findResource(bundle, "Patient");
        const profile = resolveSimulatorCoverageProfile(
            patient !== undefined ? (getPatientIdentifierValue(patient) ?? "") : "",
        );
        if (profile === null) {
            return buildOperationOutcomeBundle(
                [
                    buildIssue({
                        severity: "error",
                        code: "value",
                        errorCode: "INVALID-IDENTIFIER",
                        messageEn: "Patient identifier must be a 10-digit National ID / Iqama starting with 1 or 2",
                        messageAr: "رقم الهوية يجب أن يتكون من 10 أرقام ويبدأ بـ 1 أو 2",
                    }),
                ],
                { now },
            );
        }
        return buildEligibilityResponse(bundle, profile, now);
    }

    private handleClaim(bundle: FhirBundle, requestHeader: FhirMessageHeader, now: Date): FhirBundle {
        const adjudicated = adjudicateClaimBundle(bundle, now, false);
        if (adjudicated === null) {
            return buildOperationOutcomeBundle(
                [
                    buildIssue({
                        severity: "error",
                        code: "processing",
                        errorCode: "ADJUDICATION-FAILED",
                        messageEn: "Unable to adjudicate the claim bundle",
                        messageAr: "تعذّر معالجة طلب المطالبة",
                    }),
                ],
                { requestHeader, now },
            );
        }
        const event: NphiesMessageEvent =
            adjudicated.claimResponse.use === "claim" ? "claim-response" : "priorauth-response";
        const header = buildResponseHeader(requestHeader, event, [
            resourceRef("ClaimResponse", adjudicated.claimResponse.id),
        ]);
        return wrapBundle([header, adjudicated.claimResponse, adjudicated.insurer], now);
    }

    private handleStatusCheck(
        bundle: FhirBundle,
        requestHeader: FhirMessageHeader,
        context: NphiesDispatchContext,
        now: Date,
    ): FhirBundle {
        const task = findResource(bundle, "Task");
        const requestedRef =
            task?.input?.find((i) => i.type.coding?.[0]?.code === "request-identifier")?.valueString ??
            task?.focus?.identifier?.value;
        const original = context.originalTransaction;

        if (original === undefined || requestedRef === undefined || original.referenceNumber !== requestedRef) {
            return buildOperationOutcomeBundle(
                [
                    buildIssue({
                        severity: "error",
                        code: "not-found",
                        errorCode: "REQUEST-NOT-FOUND",
                        messageEn: "No pending request found for the supplied reference",
                        messageAr: "لا يوجد طلب معلّق بهذا الرقم المرجعي",
                        expression: ["Task.input"],
                    }),
                ],
                { requestHeader, now },
            );
        }

        const createdMs = Date.parse(original.createdAt);
        const elapsedMs = Number.isNaN(createdMs) ? 0 : now.getTime() - createdMs;
        const resolve = elapsedMs >= this.queueDelayMs;
        const adjudicated = adjudicateClaimBundle(original.requestBundle, now, resolve);
        if (adjudicated === null) {
            return buildOperationOutcomeBundle(
                [
                    buildIssue({
                        severity: "error",
                        code: "processing",
                        errorCode: "ADJUDICATION-FAILED",
                        messageEn: "Unable to re-adjudicate the original request",
                        messageAr: "تعذّرت إعادة معالجة الطلب الأصلي",
                    }),
                ],
                { requestHeader, now },
            );
        }

        const completed = adjudicated.claimResponse.outcome !== "queued";
        const retryAfter = Math.max(0, this.queueDelayMs - elapsedMs);
        const responseTask: FhirTask = {
            resourceType: "Task",
            id: newId(),
            ...(completed
                ? {}
                : {
                    extension: [
                        { url: MJDITAL_EXTENSIONS.retryAfterMs, valueInteger: retryAfter },
                    ],
                }),
            status: completed ? "completed" : "in-progress",
            intent: "order",
            code: concept(NPHIES_SYSTEMS.taskCode, "status-check", "Status Check"),
            ...(task?.focus !== undefined ? { focus: task.focus } : {}),
            authoredOn: task?.authoredOn ?? now.toISOString(),
            lastModified: now.toISOString(),
            ...(completed
                ? {
                    output: [
                        {
                            type: concept(NPHIES_SYSTEMS.taskOutputType, "claim-response", "Claim Response"),
                            valueReference: resourceRef("ClaimResponse", adjudicated.claimResponse.id),
                        },
                    ],
                }
                : {}),
        };

        const header = buildResponseHeader(requestHeader, "status-check", [
            resourceRef("Task", responseTask.id),
        ]);
        return wrapBundle([header, responseTask, adjudicated.claimResponse, adjudicated.insurer], now);
    }
}