// src/app/admin/finance/zatca/actions.ts

"use server";

import { Prisma } from "@prisma/client";
import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import {
    MOCK_SEALED_PREFIX,
    ZatcaFlowError,
    encryptionKey,
    generateKeyAndCsr,
    parseCertificateValidity,
    sealSecret,
} from "@/lib/zatca/crypto";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type ZatcaEnvironmentValue = "SIMULATION" | "PRODUCTION";
export type ZatcaRange = "24H" | "7D" | "30D" | "90D";
export type ZatcaInvoiceTypeValue =
    | "SIMPLIFIED_B2C"
    | "TAX_B2B"
    | "CREDIT_NOTE"
    | "DEBIT_NOTE";
export type ZatcaResponseStatusValue =
    | "PENDING"
    | "REPORTED"
    | "CLEARED"
    | "REJECTED";
export type ZatcaProfileField =
    | "taxRegistrationNumber"
    | "legalEntityName"
    | "streetName"
    | "district"
    | "city"
    | "postalCode";

export interface ZatcaActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface ZatcaTaxProfile {
    taxRegistrationNumber: string;
    legalEntityName: string;
    streetName: string;
    district: string;
    city: string;
    postalCode: string;
    complete: boolean;
    missing: ZatcaProfileField[];
}

export interface ZatcaCredentialView {
    environment: ZatcaEnvironmentValue;
    egsSerial: string;
    issuedAt: string;
    expiresAt: string;
}

export interface ZatcaTransmissionMessage {
    level: "ERROR" | "WARNING" | "INFO";
    type: string;
    code: string;
    category: string;
    message: string;
}

export interface ZatcaTransmissionRow {
    id: string;
    invoiceRef: string;
    invoiceUuid: string;
    invoiceType: ZatcaInvoiceTypeValue;
    isInsurance: boolean;
    payerName: string | null;
    environment: ZatcaEnvironmentValue;
    status: ZatcaResponseStatusValue;
    submittedAt: string;
    zatcaRequestId: string | null;
    httpStatus: number | null;
    messages: ZatcaTransmissionMessage[];
}

export interface ZatcaTransmissionsData {
    environment: ZatcaEnvironmentValue;
    range: ZatcaRange;
    rows: ZatcaTransmissionRow[];
    truncated: boolean;
}

export interface ZatcaOverviewData {
    environment: ZatcaEnvironmentValue;
    profile: ZatcaTaxProfile;
    credentials: Record<ZatcaEnvironmentValue, ZatcaCredentialView | null>;
    transmissions: ZatcaTransmissionsData;
    /** True when the server runs with ZATCA_MOCK_MODE="true" (lets the UI show an optional "Test mode" hint). */
    mockMode?: boolean;
}

export interface GetZatcaTransmissionsInput {
    environment: string;
    range?: string;
}

export interface SetZatcaEnvironmentInput {
    environment: string;
}

export interface GenerateZatcaCsidInput {
    environment: string;
    otp: string;
}

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

const LOG_LIMIT = 200;
const MAX_MESSAGES = 25;
const GATEWAY_TIMEOUT_MS = 25_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<ZatcaRange, number> = {
    "24H": DAY_MS,
    "7D": 7 * DAY_MS,
    "30D": 30 * DAY_MS,
    "90D": 90 * DAY_MS,
};

const OTP_PATTERN = /^\d{6}$/;
const TAX_NUMBER_PATTERN = /^3\d{13}3$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;

/** Fixed EGS serial used by the testing mock certificate. */
const MOCK_EGS_SERIAL = "EGS-KSA-01-00482";

const DEVELOPER_PORTAL_URL =
    "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";
const PRODUCTION_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/core";

function invalidGatewayUrl(variable: string, received: string): ZatcaFlowError {
    return new ZatcaFlowError(
        "INVALID_GATEWAY_URL",
        bi(
            `${variable} is invalid (received: "${received}"). It must be the ZATCA gateway base URL, e.g. ${DEVELOPER_PORTAL_URL}`,
            `قيمة ${variable} غير صالحة. يجب أن تكون رابط بوابة هيئة الزكاة الأساسي، مثل ${DEVELOPER_PORTAL_URL}`,
        ),
    );
}

/**
 * Resolves and validates the ZATCA gateway base URL (no trailing slash, no endpoint suffix).
 *
 *   SIMULATION -> ZATCA_SIMULATION_URL  (default: Developer Portal sandbox)
 *   PRODUCTION -> ZATCA_PRODUCTION_URL  (default: .../e-invoicing/core)
 *
 * A value such as "https://zatca.gov.sa" (the public website) is rejected up front: requests to it
 * are answered with the website's HTML "page not found" page instead of the e-invoicing gateway.
 */
function resolveGatewayBase(environment: ZatcaEnvironmentValue): string {
    const variable =
        environment === "PRODUCTION" ? "ZATCA_PRODUCTION_URL" : "ZATCA_SIMULATION_URL";
    const fallback =
        environment === "PRODUCTION" ? PRODUCTION_URL : DEVELOPER_PORTAL_URL;
    const configured = (process.env[variable] ?? "").trim();

    if (!configured) return fallback;

    let parsed: URL;

    try {
        parsed = new URL(configured);
    } catch {
        throw invalidGatewayUrl(variable, configured);
    }

    if (parsed.protocol !== "https:" || !parsed.pathname.startsWith("/e-invoicing/")) {
        throw invalidGatewayUrl(variable, configured);
    }

    const path = parsed.pathname
        .replace(/\/+$/, "")
        .replace(/\/(compliance|production\/csids)$/, "");

    return `${parsed.origin}${path}`;
}

function isDeveloperPortal(base: string): boolean {
    return base.includes("/e-invoicing/developer-portal");
}

/**
 * Compliance-only onboarding: the Compliance CSID returned by POST {base}/compliance is stored as
 * the device certificate and the production CSID step is skipped.
 * Default: ON for the Developer Portal sandbox, OFF everywhere else.
 * Override with ZATCA_COMPLIANCE_ONLY="true" | "false". Never applies to the PRODUCTION environment.
 */
function isComplianceOnly(environment: ZatcaEnvironmentValue, base: string): boolean {
    if (environment !== "SIMULATION") return false;

    const flag = (process.env.ZATCA_COMPLIANCE_ONLY ?? "").trim().toLowerCase();

    if (flag === "true") return true;
    if (flag === "false") return false;

    return isDeveloperPortal(base);
}

function basicAuthHeader(binarySecurityToken: string, secret: string): string {
    return `Basic ${Buffer.from(`${binarySecurityToken}:${secret}`, "utf8").toString("base64")}`;
}

/**
 * Testing Mock Mode switch.
 * Enabled ONLY when ZATCA_MOCK_MODE is exactly "true". Any other value (or unset) = real ZATCA calls.
 */
function isMockMode(): boolean {
    return process.env.ZATCA_MOCK_MODE === "true";
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Bilingual message: the server does not know the UI locale, so both languages are returned. */
function bi(english: string, arabic: string): string {
    return `${english} — ${arabic}`;
}

function fail<T>(error: string, code = "INVALID_INPUT"): ZatcaActionResult<T> {
    return { success: false, error, code };
}

function isUniqueViolation(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    );
}

function databaseError<T>(action: string, error: unknown): ZatcaActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof ZatcaFlowError) {
        return fail(error.message, error.code);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return fail(
                    bi(
                        "A conflicting ZATCA record already exists. Please try again.",
                        "يوجد سجل متعارض لهيئة الزكاة. حاول مرة أخرى.",
                    ),
                    "DUPLICATE_RECORD",
                );
            case "P2025":
                return fail(
                    bi(
                        "The requested record could not be found. Refresh and try again.",
                        "تعذّر العثور على السجل المطلوب. حدّث الصفحة وحاول مرة أخرى.",
                    ),
                    "RECORD_NOT_FOUND",
                );
        }
    }

    return fail(
        bi(
            "The operation could not be completed. Please try again.",
            "تعذّر إكمال العملية. حاول مرة أخرى.",
        ),
        "DATABASE_ERROR",
    );
}

function validEnvironment(value: unknown): value is ZatcaEnvironmentValue {
    return value === "SIMULATION" || value === "PRODUCTION";
}

function validRange(value: unknown): value is ZatcaRange {
    return (
        value === "24H" || value === "7D" || value === "30D" || value === "90D"
    );
}

function cleanText(value: unknown, max = 500): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/* ---------------------------------- profile -------------------------------- */

async function loadTaxProfile(organizationId: string): Promise<ZatcaTaxProfile> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
            nameEn: true,
            vatNumber: true,
            centerSettings: {
                select: {
                    taxRegistrationNumber: true,
                    streetName: true,
                    district: true,
                    city: true,
                    postalCode: true,
                },
            },
        },
    });

    const settings = organization?.centerSettings ?? null;

    const taxRegistrationNumber = cleanText(
        settings?.taxRegistrationNumber ?? organization?.vatNumber,
        15,
    );
    const legalEntityName = cleanText(organization?.nameEn, 200);
    const streetName = cleanText(settings?.streetName, 127);
    const district = cleanText(settings?.district, 127);
    const city = cleanText(settings?.city, 127);
    const postalCode = cleanText(settings?.postalCode, 5);

    const missing: ZatcaProfileField[] = [];

    if (!TAX_NUMBER_PATTERN.test(taxRegistrationNumber)) {
        missing.push("taxRegistrationNumber");
    }
    if (!legalEntityName) missing.push("legalEntityName");
    if (!streetName) missing.push("streetName");
    if (!district) missing.push("district");
    if (!city) missing.push("city");
    if (!POSTAL_CODE_PATTERN.test(postalCode)) missing.push("postalCode");

    return {
        taxRegistrationNumber,
        legalEntityName,
        streetName,
        district,
        city,
        postalCode,
        complete: missing.length === 0,
        missing,
    };
}

/* ------------------------------- credentials ------------------------------- */

const credentialSelect = {
    environment: true,
    egsSerial: true,
    issuedAt: true,
    expiresAt: true,
} satisfies Prisma.ZatcaCredentialSelect;

type CredentialRecord = Prisma.ZatcaCredentialGetPayload<{
    select: typeof credentialSelect;
}>;

function mapCredential(record: CredentialRecord): ZatcaCredentialView {
    return {
        environment: record.environment,
        egsSerial: record.egsSerial,
        issuedAt: record.issuedAt.toISOString(),
        expiresAt: record.expiresAt.toISOString(),
    };
}

interface PersistCredentialInput {
    organizationId: string;
    environment: ZatcaEnvironmentValue;
    egsSerial: string;
    egsUuid: string;
    complianceRequestId: string | null;
    productionRequestId: string | null;
    binarySecurityToken: string;
    secretEncrypted: string;
    privateKeyEncrypted: string;
    issuedAt: Date;
    expiresAt: Date;
}

/** Shared by the real flow and the mock flow so both produce identical database state. */
async function persistCredential(
    input: PersistCredentialInput,
): Promise<CredentialRecord> {
    const { organizationId, environment, ...fields } = input;

    return prisma.$transaction(async (tx) => {
        const credential = await tx.zatcaCredential.upsert({
            where: {
                organizationId_environment: { organizationId, environment },
            },
            create: {
                organizationId,
                environment,
                egsSerial: fields.egsSerial,
                egsUuid: fields.egsUuid,
                complianceRequestId: fields.complianceRequestId,
                productionRequestId: fields.productionRequestId,
                binarySecurityToken: fields.binarySecurityToken,
                secretEncrypted: fields.secretEncrypted,
                privateKeyEncrypted: fields.privateKeyEncrypted,
                issuedAt: fields.issuedAt,
                expiresAt: fields.expiresAt,
            },
            update: {
                egsSerial: fields.egsSerial,
                egsUuid: fields.egsUuid,
                complianceRequestId: fields.complianceRequestId,
                productionRequestId: fields.productionRequestId,
                binarySecurityToken: fields.binarySecurityToken,
                secretEncrypted: fields.secretEncrypted,
                privateKeyEncrypted: fields.privateKeyEncrypted,
                issuedAt: fields.issuedAt,
                expiresAt: fields.expiresAt,
            },
            select: credentialSelect,
        });

        await tx.zatcaConfig.upsert({
            where: { organizationId },
            create: { organizationId, activeEnvironment: environment },
            update: {},
            select: { id: true },
        });

        return credential;
    });
}

/* ------------------------------- transmissions ----------------------------- */

const transmissionSelect = {
    id: true,
    invoiceRef: true,
    invoiceUuid: true,
    invoiceType: true,
    isInsurance: true,
    payerName: true,
    environment: true,
    status: true,
    submittedAt: true,
    zatcaRequestId: true,
    httpStatus: true,
    messages: true,
} satisfies Prisma.ZatcaTransmissionSelect;

type TransmissionRecord = Prisma.ZatcaTransmissionGetPayload<{
    select: typeof transmissionSelect;
}>;

function parseMessages(value: Prisma.JsonValue | null): ZatcaTransmissionMessage[] {
    if (!Array.isArray(value)) return [];

    const output: ZatcaTransmissionMessage[] = [];

    for (const item of value.slice(0, MAX_MESSAGES)) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;

        const record = item as Record<string, unknown>;
        const level =
            record.level === "WARNING" || record.level === "INFO"
                ? record.level
                : "ERROR";

        output.push({
            level,
            type: cleanText(record.type, 60),
            code: cleanText(record.code, 80),
            category: cleanText(record.category, 80),
            message: cleanText(record.message, 800),
        });
    }

    return output;
}

function mapTransmission(record: TransmissionRecord): ZatcaTransmissionRow {
    return {
        id: record.id,
        invoiceRef: record.invoiceRef,
        invoiceUuid: record.invoiceUuid,
        invoiceType: record.invoiceType,
        isInsurance: record.isInsurance,
        payerName: record.payerName,
        environment: record.environment,
        status: record.status,
        submittedAt: record.submittedAt.toISOString(),
        zatcaRequestId: record.zatcaRequestId,
        httpStatus: record.httpStatus,
        messages: parseMessages(record.messages),
    };
}

async function fetchTransmissions(
    organizationId: string,
    environment: ZatcaEnvironmentValue,
    range: ZatcaRange,
): Promise<ZatcaTransmissionsData> {
    const since = new Date(Date.now() - RANGE_MS[range]);

    const records = await prisma.zatcaTransmission.findMany({
        where: {
            organizationId,
            environment,
            submittedAt: { gte: since },
        },
        select: transmissionSelect,
        orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
        take: LOG_LIMIT + 1,
    });

    const truncated = records.length > LOG_LIMIT;

    return {
        environment,
        range,
        rows: records.slice(0, LOG_LIMIT).map(mapTransmission),
        truncated,
    };
}

/* ---------------------------- ZATCA gateway access -------------------------- */

interface GatewayResponse {
    ok: boolean;
    status: number;
    /** Parsed JSON body (null when the response was empty or not JSON). */
    body: unknown;
    /** Raw response text (kept for logging / classification only, never shown to the user). */
    raw: string;
    isJson: boolean;
    contentType: string;
    url: string;
}

/**
 * The ONLY function that performs network requests to ZATCA.
 * It is never reached when ZATCA_MOCK_MODE === "true" (guarded again here as defense in depth).
 */
async function callGateway(
    url: string,
    headers: Record<string, string>,
    payload: unknown,
): Promise<GatewayResponse> {
    if (isMockMode()) {
        throw new ZatcaFlowError(
            "MOCK_MODE_NETWORK_BLOCKED",
            bi(
                "Network requests to ZATCA are disabled while ZATCA_MOCK_MODE is on.",
                "طلبات الشبكة إلى هيئة الزكاة معطّلة أثناء تفعيل وضع المحاكاة.",
            ),
        );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "Accept-Version": "V2",
                "Accept-Language": "en",
                ...headers,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
            cache: "no-store",
        });

        const raw = await response.text();
        const contentType = response.headers.get("content-type") ?? "";
        let body: unknown = null;
        let isJson = false;

        if (raw.trim()) {
            try {
                body = JSON.parse(raw);
                isJson = true;
            } catch {
                body = null;
            }
        }

        if (!response.ok) {
            // Full detail for debugging; the UI only receives a short, safe summary.
            console.error(
                `[zatca gateway] HTTP ${response.status} POST ${url} (content-type: ${contentType || "n/a"})\n${raw.slice(0, 2000)}`,
            );
        }

        return { ok: response.ok, status: response.status, body, raw, isJson, contentType, url };
    } catch (error) {
        console.error(`[zatca gateway] request to ${url} failed`, error);
        throw new ZatcaFlowError(
            "GATEWAY_UNREACHABLE",
            bi(
                "Could not reach the ZATCA gateway. Please try again.",
                "تعذّر الوصول إلى بوابة هيئة الزكاة. حاول مرة أخرى.",
            ),
        );
    } finally {
        clearTimeout(timer);
    }
}

function nonEmptyString(value: unknown): string {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function gatewayMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;

        // ZATCA error shapes: { errorCode, errorCategory, errorMessage } | { message } | { errors: [...] }
        const direct =
            nonEmptyString(record.errorMessage) || nonEmptyString(record.message);

        if (direct) return direct.slice(0, 300);

        const disposition = nonEmptyString(record.dispositionMessage);

        if (disposition && disposition !== "ISSUED") return disposition.slice(0, 300);

        if (Array.isArray(record.errors) && record.errors.length > 0) {
            const first = record.errors[0];

            if (first && typeof first === "object") {
                const message = nonEmptyString((first as Record<string, unknown>).message);

                if (message) return message.slice(0, 300);
            }
        }
    }

    return fallback;
}

/** Lower-cased text of every code/message in a gateway body, used for error classification. */
function gatewayHaystack(body: unknown): string {
    const chunks: string[] = [];

    if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;

        for (const key of [
            "code",
            "message",
            "dispositionMessage",
            "errorCode",
            "errorCategory",
            "errorMessage",
        ]) {
            const value = record[key];
            if (typeof value === "string") chunks.push(value);
        }

        if (Array.isArray(record.errors)) {
            for (const item of record.errors.slice(0, 10)) {
                if (!item || typeof item !== "object") continue;

                const entry = item as Record<string, unknown>;

                if (typeof entry.code === "string") chunks.push(entry.code);
                if (typeof entry.message === "string") chunks.push(entry.message);
            }
        }
    }

    return chunks.join(" ").toLowerCase();
}

/** Short "[HTTP 400 /path] {json}" suffix so the real ZATCA reply is visible in the UI and logs. */
function failureDiagnostic(response: GatewayResponse): string {
    let path = response.url;

    try {
        path = new URL(response.url).pathname;
    } catch {
        // keep the raw url
    }

    const head = `[HTTP ${response.status} ${path}]`;

    return response.isJson
        ? `\n${head} ${JSON.stringify(response.body).slice(0, 700)}`
        : `\n${head}`;
}

/** Turns a failed gateway response into a clear bilingual message plus a stable code. */
function describeGatewayFailure(
    response: GatewayResponse,
    stage: "compliance" | "production",
): { message: string; code: string } {
    const result = classifyGatewayFailure(response, stage);

    return { code: result.code, message: `${result.message}${failureDiagnostic(response)}` };
}

function classifyGatewayFailure(
    response: GatewayResponse,
    stage: "compliance" | "production",
): { message: string; code: string } {
    const haystack = gatewayHaystack(response.body);
    const detail = gatewayMessage(response.body, "");
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(response.raw);

    // An HTML page (e.g. the zatca.gov.sa website 404 page) means the request never reached the
    // e-invoicing gateway: the base URL is wrong. Never surface that HTML to the user.
    if (
        !response.isJson &&
        (response.status === 404 || (looksLikeHtml && response.status < 500))
    ) {
        return {
            code: "GATEWAY_ENDPOINT_NOT_FOUND",
            message: bi(
                `ZATCA answered with a non-API page (HTTP ${response.status}). The gateway URL is wrong: set ZATCA_SIMULATION_URL=${DEVELOPER_PORTAL_URL}`,
                `ردّت الهيئة بصفحة غير تابعة للـ API (HTTP ${response.status}). رابط البوابة غير صحيح: اضبط ZATCA_SIMULATION_URL على ${DEVELOPER_PORTAL_URL}`,
            ),
        };
    }

    if (/\botp\b/.test(haystack)) {
        return {
            code: "INVALID_OTP",
            message: bi(
                `The OTP is invalid or has expired. Generate a new OTP from the Fatoora portal${isDeveloperPortal(response.url) ? " (Developer Portal: 123345)" : ""} and try again.`,
                `رمز OTP غير صالح أو منتهي الصلاحية. أنشئ رمزاً جديداً من بوابة فاتورة${isDeveloperPortal(response.url) ? " (بوابة المطورين: 123345)" : ""} وحاول مرة أخرى.`,
            ),
        };
    }

    if (/(invalid-csr|certificate signing request|\bcsr\b)/.test(haystack)) {
        return {
            code: "INVALID_CSR",
            message: bi(
                "ZATCA rejected the CSR. Check the certificate template name for this environment, the 15-digit VAT number and the EGS serial format.",
                "رفضت هيئة الزكاة طلب CSR. تحقق من اسم قالب الشهادة لهذه البيئة والرقم الضريبي (15 رقماً) وصيغة الرقم التسلسلي لجهاز EGS.",
            ),
        };
    }

    if (/(already|duplicate)/.test(haystack)) {
        return {
            code: "DUPLICATE_EGS",
            message: bi(
                "This EGS device is already onboarded with ZATCA. Revoke or renew the existing certificate in the Fatoora portal, then retry.",
                "جهاز EGS هذا مسجّل مسبقاً لدى هيئة الزكاة. ألغِ الشهادة الحالية أو جدّدها من بوابة فاتورة ثم أعد المحاولة.",
            ),
        };
    }

    if (response.status === 429) {
        return {
            code: "RATE_LIMITED",
            message: bi(
                "ZATCA is receiving too many requests. Please wait a minute and try again.",
                "تتلقى هيئة الزكاة طلبات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.",
            ),
        };
    }

    if (response.status >= 500) {
        return {
            code: "GATEWAY_UNAVAILABLE",
            message: bi(
                "The ZATCA gateway is temporarily unavailable. Please try again later.",
                "بوابة هيئة الزكاة غير متاحة مؤقتاً. حاول مرة أخرى لاحقاً.",
            ),
        };
    }

    if (stage === "production") {
        return {
            code: "COMPLIANCE_CHECKS_REQUIRED",
            message: bi(
                `ZATCA did not issue the production CSID. Make sure the compliance checks passed.${detail ? ` (${detail})` : ""}`,
                "لم تُصدر هيئة الزكاة معرّف CSID للإنتاج. تأكد من اجتياز فحوصات الامتثال.",
            ),
        };
    }

    return {
        code: "ZATCA_REJECTED",
        message: bi(
            `ZATCA rejected the certificate request${detail ? `: ${detail}` : "."}`,
            "رفضت هيئة الزكاة طلب الشهادة.",
        ),
    };
}

interface IssuedCsid {
    requestId: string;
    binarySecurityToken: string;
    secret: string;
}

function readIssuedCsid(body: unknown): IssuedCsid | null {
    if (!body || typeof body !== "object") return null;

    const record = body as Record<string, unknown>;
    const token = record.binarySecurityToken;
    const secret = record.secret;

    if (typeof token !== "string" || !token || typeof secret !== "string" || !secret) {
        return null;
    }

    const requestId =
        typeof record.requestID === "number" || typeof record.requestID === "string"
            ? String(record.requestID)
            : "";

    return { requestId, binarySecurityToken: token, secret };
}

/* ------------------------------- Mock CSID flow ------------------------------ */

/**
 * Frees the fixed mock serial from OTHER mock certificates (other organizations / the other
 * environment) so the unique constraint on the serial can never block a mock save.
 * Real (non-mock) certificates are never touched.
 */
async function releaseMockSerial(
    organizationId: string,
    environment: ZatcaEnvironmentValue,
): Promise<void> {
    const holders = await prisma.zatcaCredential.findMany({
        where: {
            egsSerial: MOCK_EGS_SERIAL,
            secretEncrypted: { startsWith: MOCK_SEALED_PREFIX },
            NOT: { organizationId, environment },
        },
        select: { organizationId: true, environment: true },
    });

    for (const holder of holders) {
        await prisma.zatcaCredential.update({
            where: {
                organizationId_environment: {
                    organizationId: holder.organizationId,
                    environment: holder.environment,
                },
            },
            data: { egsSerial: `${MOCK_EGS_SERIAL}-${randomUUID().slice(0, 8)}` },
            select: { id: true },
        });
    }
}

/**
 * Saves the mock certificate and guarantees that a unique-constraint conflict is never surfaced:
 *   1. try the fixed serial EGS-KSA-01-00482,
 *   2. on a conflict release the serial from other MOCK rows (or absorb a double-click race) and retry,
 *   3. as a last resort (a REAL certificate owns that serial) use a unique suffixed serial.
 */
async function saveMockCredential(
    base: Omit<PersistCredentialInput, "egsSerial">,
): Promise<CredentialRecord> {
    const attempts: Array<() => Promise<CredentialRecord>> = [
        () => persistCredential({ ...base, egsSerial: MOCK_EGS_SERIAL }),
        async () => {
            await releaseMockSerial(base.organizationId, base.environment);

            return persistCredential({ ...base, egsSerial: MOCK_EGS_SERIAL });
        },
        () =>
            persistCredential({
                ...base,
                egsSerial: `${MOCK_EGS_SERIAL}-${randomUUID().slice(0, 8)}`,
            }),
    ];

    let lastError: unknown;

    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;

            lastError = error;
        }
    }

    throw lastError;
}

/**
 * Testing Mock Mode: simulates a successful onboarding WITHOUT contacting the ZATCA gateway.
 * Stores a dummy active certificate (Issued: now, Expires: +1 year, EGS Serial: EGS-KSA-01-00482).
 * The stored token / secret / key are clearly marked placeholders: they cannot be decrypted and are
 * NOT valid for signing or reporting real invoices.
 *
 * Works for both the Simulation Sandbox and Production UI toggles, except that the PRODUCTION
 * environment is refused on a live deployment (NODE_ENV === "production").
 */
async function generateMockCsid(
    organizationId: string,
    rawEnvironment: unknown,
    rawOtp: unknown,
): Promise<ZatcaActionResult<ZatcaCredentialView>> {
    if (!validEnvironment(rawEnvironment)) {
        return fail(
            bi("Select a valid ZATCA environment.", "اختر بيئة صالحة لهيئة الزكاة."),
            "INVALID_ENVIRONMENT",
        );
    }

    const environment = rawEnvironment;

    if (!OTP_PATTERN.test(cleanText(rawOtp, 12))) {
        return fail(
            bi(
                "Enter the 6-digit OTP from the ZATCA Fatoora portal.",
                "أدخل رمز OTP المكوّن من 6 أرقام من بوابة فاتورة التابعة لهيئة الزكاة.",
            ),
            "INVALID_OTP_FORMAT",
        );
    }

    if (environment === "PRODUCTION" && process.env.NODE_ENV === "production") {
        return fail(
            bi(
                "Mock mode cannot certify the PRODUCTION environment on a production deployment. Disable ZATCA_MOCK_MODE or use the Simulation environment.",
                "لا يمكن لوضع المحاكاة اعتماد بيئة الإنتاج في نشر إنتاجي. عطّل ZATCA_MOCK_MODE أو استخدم بيئة المحاكاة.",
            ),
            "MOCK_NOT_ALLOWED_IN_PRODUCTION",
        );
    }

    console.warn(
        `[zatca mock] ZATCA_MOCK_MODE is ON — issuing a DUMMY ${environment} certificate for organization ${organizationId}. No request was sent to ZATCA.`,
    );

    try {
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime());
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);

        const mockRequestId = `MOCK-${Date.now()}`;

        const existing = await prisma.zatcaCredential.findUnique({
            where: {
                organizationId_environment: { organizationId, environment },
            },
            select: { egsUuid: true },
        });

        const saved = await saveMockCredential({
            organizationId,
            environment,
            egsUuid: existing?.egsUuid ?? randomUUID(),
            complianceRequestId: mockRequestId,
            productionRequestId: mockRequestId,
            binarySecurityToken: Buffer.from(
                `MOCK-CERTIFICATE-${randomUUID()}`,
                "utf8",
            ).toString("base64"),
            secretEncrypted: `${MOCK_SEALED_PREFIX}not-a-real-secret`,
            privateKeyEncrypted: `${MOCK_SEALED_PREFIX}not-a-real-private-key`,
            issuedAt,
            expiresAt,
        });

        return { success: true, data: mapCredential(saved) };
    } catch (error) {
        console.error("[zatca mock]", error);

        // Never expose "A conflicting ZATCA record already exists" in mock mode.
        return fail(
            bi(
                "The mock certificate could not be saved. Please try again.",
                "تعذّر حفظ شهادة المحاكاة. حاول مرة أخرى.",
            ),
            "MOCK_SAVE_FAILED",
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Actions                                  */
/* -------------------------------------------------------------------------- */

/** One round trip for the first paint: environment, tax profile, certificates, recent log. */
export async function getZatcaOverviewAction(): Promise<
    ZatcaActionResult<ZatcaOverviewData>
> {
    try {
        const session = await requirePortalSession("admin");
        const organizationId = session.organizationId;

        const [profile, config, credentialRows] = await Promise.all([
            loadTaxProfile(organizationId),
            prisma.zatcaConfig.findUnique({
                where: { organizationId },
                select: { activeEnvironment: true },
            }),
            prisma.zatcaCredential.findMany({
                where: { organizationId },
                select: credentialSelect,
            }),
        ]);

        const environment: ZatcaEnvironmentValue =
            config?.activeEnvironment ?? "SIMULATION";

        const credentials: Record<ZatcaEnvironmentValue, ZatcaCredentialView | null> = {
            SIMULATION: null,
            PRODUCTION: null,
        };

        for (const record of credentialRows) {
            credentials[record.environment] = mapCredential(record);
        }

        const transmissions = await fetchTransmissions(organizationId, environment, "7D");

        return {
            success: true,
            data: {
                environment,
                profile,
                credentials,
                transmissions,
                mockMode: isMockMode(),
            },
        };
    } catch (error) {
        console.error("[getZatcaOverviewAction]", error);

        return fail(
            bi(
                "Unable to load ZATCA integration. Please refresh the page and try again.",
                "تعذّر تحميل ربط هيئة الزكاة. حدّث الصفحة وحاول مرة أخرى.",
            ),
            "FETCH_ZATCA_FAILED",
        );
    }
}

/** Transmission log for one environment and period (used by filter changes and background refresh). */
export async function getZatcaTransmissionsAction(
    input: GetZatcaTransmissionsInput,
): Promise<ZatcaActionResult<ZatcaTransmissionsData>> {
    try {
        const session = await requirePortalSession("admin");

        if (!validEnvironment(input?.environment)) {
            return fail(
                bi("Select a valid ZATCA environment.", "اختر بيئة صالحة لهيئة الزكاة."),
                "INVALID_ENVIRONMENT",
            );
        }

        const range: ZatcaRange = validRange(input.range) ? input.range : "7D";

        const data = await fetchTransmissions(
            session.organizationId,
            input.environment,
            range,
        );

        return { success: true, data };
    } catch (error) {
        console.error("[getZatcaTransmissionsAction]", error);

        return fail(
            bi(
                "Unable to load the transmission log. Please try again.",
                "تعذّر تحميل سجل الإرسال. حاول مرة أخرى.",
            ),
            "FETCH_TRANSMISSIONS_FAILED",
        );
    }
}

/** Persists the selected ZATCA environment (Simulation Sandbox / Production). */
export async function setZatcaEnvironmentAction(
    input: SetZatcaEnvironmentInput,
): Promise<ZatcaActionResult<{ environment: ZatcaEnvironmentValue }>> {
    try {
        const session = await requirePortalSession("admin");

        if (!validEnvironment(input?.environment)) {
            return fail(
                bi("Select a valid ZATCA environment.", "اختر بيئة صالحة لهيئة الزكاة."),
                "INVALID_ENVIRONMENT",
            );
        }

        const environment = input.environment;

        await prisma.zatcaConfig.upsert({
            where: { organizationId: session.organizationId },
            create: {
                organizationId: session.organizationId,
                activeEnvironment: environment,
            },
            update: { activeEnvironment: environment },
            select: { id: true },
        });

        return { success: true, data: { environment } };
    } catch (error) {
        return databaseError("setZatcaEnvironmentAction", error);
    }
}

/**
 * Onboards the EGS device.
 *
 * - ZATCA_MOCK_MODE === "true": handled FIRST, right after authentication. No encryption key, tax
 *   profile, CSR or gateway call is involved; a dummy active certificate is stored and returned.
 * - Otherwise: builds the CSR and exchanges the OTP for a compliance CSID (POST {base}/compliance).
 *   Developer Portal (default for SIMULATION): the compliance CSID is stored as the device certificate.
 *   Other gateways: it is upgraded to a production CSID (POST {base}/production/csids) first.
 *   Secrets are stored AES-256-GCM encrypted.
 */
export async function generateZatcaCsidAction(
    input: GenerateZatcaCsidInput,
): Promise<ZatcaActionResult<ZatcaCredentialView>> {
    try {
        const session = await requirePortalSession("admin");
        const organizationId = session.organizationId;

        /* ------- Testing Mock Mode: absolute priority, nothing below runs ------- */
        if (isMockMode()) {
            return await generateMockCsid(organizationId, input?.environment, input?.otp);
        }

        /* ---------------------- Real ZATCA onboarding flow -------------------- */

        if (!validEnvironment(input?.environment)) {
            return fail(
                bi("Select a valid ZATCA environment.", "اختر بيئة صالحة لهيئة الزكاة."),
                "INVALID_ENVIRONMENT",
            );
        }

        const environment = input.environment;
        const otp = cleanText(input.otp, 12);

        if (!OTP_PATTERN.test(otp)) {
            return fail(
                bi(
                    "Enter the 6-digit OTP from the ZATCA Fatoora portal.",
                    "أدخل رمز OTP المكوّن من 6 أرقام من بوابة فاتورة التابعة لهيئة الزكاة.",
                ),
                "INVALID_OTP_FORMAT",
            );
        }

        // Fail fast on a misconfigured gateway URL (before anything else runs or the OTP is spent).
        const base = resolveGatewayBase(environment);
        const complianceOnly = isComplianceOnly(environment, base);

        console.info(
            `[zatca] onboarding ${environment} via ${base} (complianceOnly=${complianceOnly})`,
        );

        // Fail fast (before the single-use OTP is spent) when the server cannot protect the secrets.
        const key = encryptionKey();

        const profile = await loadTaxProfile(organizationId);

        if (!profile.complete) {
            return fail(
                bi(
                    "The tax profile is incomplete. Complete it in Center Settings first.",
                    "الملف الضريبي غير مكتمل. أكمله من إعدادات المركز أولاً.",
                ),
                "PROFILE_INCOMPLETE",
            );
        }

        const existing = await prisma.zatcaCredential.findUnique({
            where: {
                organizationId_environment: { organizationId, environment },
            },
            select: { egsSerial: true, egsUuid: true },
        });

        let egsSerial = existing?.egsSerial;
        const egsUuid = existing?.egsUuid ?? randomUUID();

        if (!egsSerial) {
            const count = await prisma.zatcaCredential.count({
                where: { organizationId },
            });

            egsSerial = `EGS-KSA-${String(count + 1).padStart(2, "0")}-${String(
                randomInt(1, 100_000),
            ).padStart(5, "0")}`;
        }

        // Also done before the OTP is consumed: a local failure must never burn the single-use OTP.
        const { privateKeyPem, csrPem } = generateKeyAndCsr({
            environment,
            egsSerial,
            egsUuid,
            legalName: profile.legalEntityName,
            vatNumber: profile.taxRegistrationNumber,
            city: profile.city,
            street: profile.streetName,
            district: profile.district,
        });

        // 1) Compliance CSID (the single-use OTP is consumed here).
        const compliance = await callGateway(
            `${base}/compliance`,
            { OTP: otp },
            { csr: Buffer.from(csrPem, "utf8").toString("base64") },
        );

        const complianceCsid = compliance.ok ? readIssuedCsid(compliance.body) : null;

        if (!complianceCsid) {
            const failure = describeGatewayFailure(compliance, "compliance");

            return fail(failure.message, failure.code);
        }

        // 2) Production CSID (requires the compliance request to be accepted by ZATCA).
        //    Skipped in compliance-only mode (Developer Portal): the Compliance CSID is stored instead.
        let issued: IssuedCsid = complianceCsid;
        let productionRequestId: string | null = null;

        if (!complianceOnly) {
            const production = await callGateway(
                `${base}/production/csids`,
                {
                    Authorization: basicAuthHeader(
                        complianceCsid.binarySecurityToken,
                        complianceCsid.secret,
                    ),
                },
                { compliance_request_id: complianceCsid.requestId },
            );

            const productionCsid = production.ok ? readIssuedCsid(production.body) : null;

            if (!productionCsid) {
                const failure = describeGatewayFailure(production, "production");

                return fail(failure.message, failure.code);
            }

            issued = productionCsid;
            productionRequestId = productionCsid.requestId || null;
        }

        const { issuedAt, expiresAt } = parseCertificateValidity(issued.binarySecurityToken);

        const secretEncrypted = sealSecret(issued.secret, organizationId, key);
        const privateKeyEncrypted = sealSecret(privateKeyPem, organizationId, key);

        const saved = await persistCredential({
            organizationId,
            environment,
            egsSerial,
            egsUuid,
            complianceRequestId: complianceCsid.requestId || null,
            productionRequestId,
            binarySecurityToken: issued.binarySecurityToken,
            secretEncrypted,
            privateKeyEncrypted,
            issuedAt,
            expiresAt,
        });

        return { success: true, data: mapCredential(saved) };
    } catch (error) {
        return databaseError("generateZatcaCsidAction", error);
    }
}