// ============================================================================
// src/lib/zatca/zatca-service.ts
// ZATCA Phase 2 (Fatoora) service for the Reception Front Desk settlement flow.
//
// Server-only (never import this file from a client component). It covers, in order:
//   1. Pre-flight certificate check          -> inspectZatcaReadiness / loadSigningMaterial / checkReportingCredential
//   2. UBL 2.1 Simplified Tax Invoice XML    -> buildSignedSimplifiedInvoice
//   3. SHA-256 hash + ECDSA signature + TLV  -> buildSignedSimplifiedInvoice (9-tag QR)
//   4. Reporting API submission              -> reportSimplifiedInvoice
//   (5. persistence / transmission log is done by the caller inside its database transaction)
//   Onboarding helper: buildComplianceSamples (compliance invoice checks before the Production CSID)
//
// Seller VAT (BT-31): ZATCA only accepts invoices whose seller VAT equals the VAT number embedded in
// the authentication certificate (`certificate-permissions`). The VAT is therefore read from the
// certificate itself (`ParsedCertificate.vatNumber`) and used for the UBL XML and the QR (tag 2);
// the Center Settings VAT is only the fallback when the certificate carries none.
//
// Buyer identification: invoices exempted with VATEX-SA-HEA (Saudi citizens) carry the buyer's
// national ID with schemeID "NAT" (BR-KSA-49); non-Saudi buyers are identified with "IQA".
//
// Environment switching (process.env.ZATCA_ENV):
//   "PRODUCTION"  -> ZATCA_PRODUCTION_URL (default .../e-invoicing/core)           + /invoices/reporting/single
//   anything else -> ZATCA_SIMULATION_URL (default .../e-invoicing/developer-portal) + /invoices/reporting/single
//   so an unset / mistyped value can never report to the live platform by accident.
//
// ZATCA_MOCK_MODE="true" (same switch as the Admin ZATCA page) never touches the network: the
// invoice is still built, hashed and signed locally and the report is simulated as REPORTED.
//
// Secrets: the private key and CSID secret are stored AES-256-GCM sealed by @/lib/zatca/crypto
// (`sealSecret`). The matching "open" function is resolved by name at runtime (see OPENER_NAMES)
// so this file keeps working whichever name your crypto.ts exports it under.
// ============================================================================

import {
    X509Certificate,
    createHash,
    createPrivateKey,
    createSign,
    generateKeyPairSync,
    randomBytes,
    randomUUID,
    type KeyObject,
} from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import * as zatcaCrypto from "@/lib/zatca/crypto";
import {
    MOCK_SEALED_PREFIX,
    ZatcaFlowError,
    encryptionKey,
    extractCertificateVat,
} from "@/lib/zatca/crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ZatcaEnvironmentName = "SIMULATION" | "PRODUCTION";
export type ZatcaPaymentMethod = "CASH" | "MADA";

export interface ZatcaMessage {
    level: "ERROR" | "WARNING" | "INFO";
    type: string;
    code: string;
    category: string;
    message: string;
}

export interface ZatcaReadiness {
    environment: ZatcaEnvironmentName;
    ready: boolean;
    /** "ZATCA_CERT_MISSING" when no active / valid / non-expired CSID exists for the environment. */
    code: "ZATCA_CERT_MISSING" | null;
}

export interface ZatcaSellerProfile {
    nameAr: string;
    nameEn: string;
    /** 15-digit VAT registration number. */
    vatNumber: string;
    crNumber: string | null;
    logoUrl: string | null;
    phone: string | null;
    streetName: string;
    district: string;
    city: string;
    /** 5 digits. */
    postalCode: string;
    /** 4 digits. */
    buildingNumber: string;
    /** 4 digits, optional. */
    additionalNumber: string | null;
}

interface ParsedCertificate {
    /** Base64 certificate body (no PEM header), exactly as embedded in ds:X509Certificate. */
    body: string;
    /** base64(hex(sha256(body))) as required for xades:CertDigest. */
    digest: string;
    issuerName: string;
    serialDecimal: string;
    /** SubjectPublicKeyInfo (DER) -> QR tag 8. */
    publicKeyDer: Buffer;
    /** The CA's ECDSA signature over the certificate (DER) -> QR tag 9. */
    signatureDer: Buffer;
    /** 15-digit VAT number embedded in the certificate (null for mock / unreadable certificates). */
    vatNumber: string | null;
}

export interface ZatcaSigningMaterial {
    mode: "REAL" | "MOCK";
    environment: ZatcaEnvironmentName;
    egsSerial: string;
    /** `Basic ...` header for the reporting API; null in mock mode. */
    authorization: string | null;
    privateKey: KeyObject;
    certificate: ParsedCertificate;
}

export type ZatcaBuyerIdScheme = "NAT" | "IQA";

/** Buyer identification (BT-46 / BT-46-1) of a simplified invoice. */
export interface ZatcaBuyerIdentification {
    /** "NAT" = Saudi national ID, "IQA" = resident permit (Iqama). */
    scheme: ZatcaBuyerIdScheme;
    value: string;
}

export interface ZatcaInvoiceInput {
    uuid: string;
    invoiceNumber: string;
    /** Invoice counter value (KSA-16), monotonically increasing per organization. */
    icv: number;
    /** Previous invoice hash (KSA-13), base64. */
    pih: string;
    issuedAt: Date;
    seller: ZatcaSellerProfile;
    buyerName: string;
    /** Required for VATEX-SA-HEA exempt invoices (scheme "NAT"); optional otherwise. */
    buyerId?: ZatcaBuyerIdentification | null;
    paymentMethod: ZatcaPaymentMethod;
    itemCode: string;
    itemNameAr: string;
    itemNameEn: string;
    /** All amounts in integer halalas (1 SAR = 100). */
    feeC: number;
    insuranceC: number;
    patientC: number;
    vatC: number;
    /** 0 or 15. */
    vatRate: number;
    /** True when the patient is a Saudi citizen (0% - VATEX-SA-HEA). */
    vatExempt: boolean;
    /** Document kind (default "INVOICE" = 388). Credit / debit notes are used by the compliance checks. */
    documentType?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
    /** Invoice number the note refers to (BillingReference, required for credit / debit notes). */
    billingReference?: string;
    /** Reason of the note (KSA-10, required for credit / debit notes). */
    noteReason?: string;
}

export interface SignedZatcaInvoice {
    /** Seller VAT number actually written to the XML and the QR (the certificate's VAT number). */
    sellerVatNumber: string;
    xml: string;
    xmlBase64: string;
    /** base64(SHA-256(canonical XML without UBLExtensions / Signature / QR)). */
    invoiceHash: string;
    signatureValue: string;
    /** ZATCA Phase 2 QR payload: base64 TLV with tags 1-9. */
    qrPayload: string;
    totalC: number;
}

export interface ZatcaReportResult {
    outcome: "REPORTED" | "REJECTED" | "UNAVAILABLE";
    httpStatus: number | null;
    requestId: string | null;
    messages: ZatcaMessage[];
    mock: boolean;
    /** Short bilingual reason for REJECTED / UNAVAILABLE outcomes. */
    reason: string | null;
}

/* -------------------------------------------------------------------------- */
/* Constants & small helpers                                                  */
/* -------------------------------------------------------------------------- */

/** ZATCA genesis PIH: base64 of the hex SHA-256 of "0". */
export const ZATCA_GENESIS_PIH =
    "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export const ZATCA_CERT_MISSING_MESSAGE =
    "Please complete ZATCA (CSID) integration in Admin settings first. — يرجى إكمال ربط الزكاة (CSID) من إعدادات الأدمن أولاً";

const DEVELOPER_PORTAL_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal";
const PRODUCTION_URL = "https://gw-fatoora.zatca.gov.sa/e-invoicing/core";
const REPORTING_PATH = "/invoices/reporting/single";
const GATEWAY_TIMEOUT_MS = 25_000;
const OPENER_NAMES = [
    "openSecret",
    "unsealSecret",
    "decryptSecret",
    "revealSecret",
    "openSealedSecret",
] as const;

const NS_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const NS_CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
const NS_CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const NS_EXT = "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";
const NS_XADES = "http://uri.etsi.org/01903/v1.3.2#";
const ALG_C14N11 = "http://www.w3.org/2006/12/xml-c14n11";
const ALG_SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const ALG_ECDSA = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256";
const ALG_XPATH = "http://www.w3.org/TR/1999/REC-xpath-19991116";

function bi(english: string, arabic: string): string {
    return `${english} — ${arabic}`;
}

function certMissing(): ZatcaFlowError {
    return new ZatcaFlowError("ZATCA_CERT_MISSING", ZATCA_CERT_MISSING_MESSAGE);
}

function isMockMode(): boolean {
    return process.env.ZATCA_MOCK_MODE === "true";
}

/** "PRODUCTION" only when explicitly configured; everything else is the safe Simulation sandbox. */
export function resolveZatcaEnvironment(): ZatcaEnvironmentName {
    return (process.env.ZATCA_ENV ?? "").trim().toUpperCase() === "PRODUCTION"
        ? "PRODUCTION"
        : "SIMULATION";
}

function resolveReportingUrl(environment: ZatcaEnvironmentName): string {
    const variable = environment === "PRODUCTION" ? "ZATCA_PRODUCTION_URL" : "ZATCA_SIMULATION_URL";
    const fallback = environment === "PRODUCTION" ? PRODUCTION_URL : DEVELOPER_PORTAL_URL;
    const configured = (process.env[variable] ?? "").trim();

    if (!configured) return `${fallback}${REPORTING_PATH}`;

    let parsed: URL;

    try {
        parsed = new URL(configured);
    } catch {
        throw new ZatcaFlowError(
            "INVALID_GATEWAY_URL",
            bi(
                `${variable} is invalid. It must be the ZATCA gateway base URL, e.g. ${fallback}`,
                `قيمة ${variable} غير صالحة. يجب أن تكون رابط بوابة هيئة الزكاة الأساسي.`,
            ),
        );
    }

    if (parsed.protocol !== "https:" || !parsed.pathname.startsWith("/e-invoicing/")) {
        throw new ZatcaFlowError(
            "INVALID_GATEWAY_URL",
            bi(
                `${variable} is invalid. It must be the ZATCA gateway base URL, e.g. ${fallback}`,
                `قيمة ${variable} غير صالحة. يجب أن تكون رابط بوابة هيئة الزكاة الأساسي.`,
            ),
        );
    }

    const path = parsed.pathname
        .replace(/\/+$/, "")
        .replace(/\/(compliance|production\/csids|invoices\/reporting\/single)$/, "");

    return `${parsed.origin}${path}${REPORTING_PATH}`;
}

/* -------------------------------------------------------------------------- */
/* Money & XML helpers                                                        */
/* -------------------------------------------------------------------------- */

function money(cents: number): string {
    return (cents / 100).toFixed(2);
}

/** Text-node escaping exactly as Canonical XML does (& < >). */
function xmlText(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Attribute escaping exactly as Canonical XML does (& < "). */
function xmlAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function sha256(data: string | Buffer): Buffer {
    return createHash("sha256").update(data).digest();
}

/* -------------------------------------------------------------------------- */
/* Certificate parsing                                                        */
/* -------------------------------------------------------------------------- */

function wrapBase64(body: string): string {
    return (body.match(/.{1,64}/g) ?? []).join("\n");
}

/**
 * ZATCA returns `binarySecurityToken` as base64 of the certificate text (itself base64 DER). Some
 * stores keep the DER base64 directly, so both shapes are accepted.
 */
function normalizeCertificateBody(token: string): string {
    const clean = (value: string): string =>
        value.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    const direct = clean(token.trim());

    try {
        const decoded = clean(Buffer.from(direct, "base64").toString("utf8"));

        if (decoded.length > 200 && /^[A-Za-z0-9+/=]+$/.test(decoded)) return decoded;
    } catch {
        // fall through: the token is already the certificate body
    }

    return direct;
}

interface DerElement {
    start: number;
    contentStart: number;
    end: number;
}

function readDer(buffer: Buffer, offset: number): DerElement {
    const lengthByte = buffer[offset + 1];

    if (lengthByte === undefined) throw new Error("Malformed DER");

    let length = lengthByte;
    let contentStart = offset + 2;

    if (lengthByte & 0x80) {
        const count = lengthByte & 0x7f;

        length = 0;

        for (let i = 0; i < count; i++) length = length * 256 + (buffer[offset + 2 + i] ?? 0);

        contentStart = offset + 2 + count;
    }

    return { start: offset, contentStart, end: contentStart + length };
}

/** Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue BIT STRING }. */
function extractCertificateSignature(der: Buffer): Buffer {
    const certificate = readDer(der, 0);
    const tbs = readDer(der, certificate.contentStart);
    const algorithm = readDer(der, tbs.end);
    const signature = readDer(der, algorithm.end);

    if (der[algorithm.end] !== 0x03) throw new Error("Malformed certificate signature");

    // First content byte of a BIT STRING = number of unused bits.
    return der.subarray(signature.contentStart + 1, signature.end);
}

function parseCertificate(token: string): ParsedCertificate {
    const body = normalizeCertificateBody(token);
    const pem = `-----BEGIN CERTIFICATE-----\n${wrapBase64(body)}\n-----END CERTIFICATE-----`;
    const x509 = new X509Certificate(pem);
    // Node lists the issuer RDNs in encoding order; ZATCA expects the RFC 2253 order
    // ("CN=..., DC=extgazt, DC=gov, DC=local").
    const issuerName = x509.issuer
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean)
        .reverse()
        .join(", ");

    return {
        body,
        digest: Buffer.from(sha256(body).toString("hex")).toString("base64"),
        issuerName,
        serialDecimal: BigInt(`0x${x509.serialNumber}`).toString(10),
        publicKeyDer: x509.publicKey.export({ type: "spki", format: "der" }),
        signatureDer: extractCertificateSignature(x509.raw),
        vatNumber: extractCertificateVat(x509.raw),
    };
}

/**
 * Seller profile whose VAT number is the one embedded in the signing certificate. ZATCA rejects
 * invoices whose seller VAT differs from the certificate's (`certificate-permissions`), so every
 * place that prints or submits the seller VAT must go through this helper. Falls back to the
 * Center Settings VAT only when the certificate carries none (mock mode).
 */
export function withCertificateVat(
    seller: ZatcaSellerProfile,
    material: ZatcaSigningMaterial,
): ZatcaSellerProfile {
    const certificateVat = material.certificate.vatNumber;

    if (!certificateVat || certificateVat === seller.vatNumber) return seller;

    console.warn(
        `[zatca] Center VAT ${seller.vatNumber} differs from the VAT in the ${material.environment} certificate (${certificateVat}). The certificate's VAT is used on invoices. Re-certify the CSID after fixing the Center Settings VAT.`,
    );

    return { ...seller, vatNumber: certificateVat };
}

/* -------------------------------------------------------------------------- */
/* Credentials: pre-flight + signing material                                 */
/* -------------------------------------------------------------------------- */

const credentialSelect = {
    egsSerial: true,
    binarySecurityToken: true,
    secretEncrypted: true,
    privateKeyEncrypted: true,
    expiresAt: true,
} as const;

type SecretOpener = (
    sealed: string,
    organizationId: string,
    key: ReturnType<typeof encryptionKey>,
) => string;

function resolveSecretOpener(): SecretOpener {
    const registry = zatcaCrypto as unknown as Record<string, unknown>;

    for (const name of OPENER_NAMES) {
        const candidate = registry[name];

        if (typeof candidate === "function") return candidate as SecretOpener;
    }

    throw new ZatcaFlowError(
        "ZATCA_DECRYPT_UNAVAILABLE",
        bi(
            "The ZATCA secret opener is not exported by @/lib/zatca/crypto. Add its name to OPENER_NAMES in zatca-service.ts.",
            "دالة فك تشفير بيانات الزكاة غير متوفرة في @/lib/zatca/crypto.",
        ),
    );
}

/**
 * Step 1 (read-only): is there an active, non-expired certificate for the active environment?
 * Used by the quote (to warn the cashier early) and by the settlement itself.
 */
export async function inspectZatcaReadiness(organizationId: string): Promise<ZatcaReadiness> {
    const environment = resolveZatcaEnvironment();
    const credential = await prisma.zatcaCredential.findUnique({
        where: { organizationId_environment: { organizationId, environment } },
        select: credentialSelect,
    });

    const placeholder =
        credential !== null &&
        (credential.secretEncrypted.startsWith(MOCK_SEALED_PREFIX) ||
            credential.privateKeyEncrypted.startsWith(MOCK_SEALED_PREFIX));

    const usable =
        credential !== null &&
        credential.expiresAt.getTime() > Date.now() &&
        (!placeholder || isMockMode());

    return { environment, ready: usable, code: usable ? null : "ZATCA_CERT_MISSING" };
}

/** Loads and decrypts the EGS credentials. Throws ZATCA_CERT_MISSING when nothing valid exists. */
export async function loadSigningMaterial(
    organizationId: string,
    environment: ZatcaEnvironmentName,
): Promise<ZatcaSigningMaterial> {
    const credential = await prisma.zatcaCredential.findUnique({
        where: { organizationId_environment: { organizationId, environment } },
        select: credentialSelect,
    });

    if (!credential || credential.expiresAt.getTime() <= Date.now()) throw certMissing();

    const mock = isMockMode();
    const placeholder =
        credential.secretEncrypted.startsWith(MOCK_SEALED_PREFIX) ||
        credential.privateKeyEncrypted.startsWith(MOCK_SEALED_PREFIX);

    if (mock && environment === "PRODUCTION" && process.env.NODE_ENV === "production") {
        throw new ZatcaFlowError(
            "MOCK_NOT_ALLOWED_IN_PRODUCTION",
            bi(
                "ZATCA_MOCK_MODE cannot be used with the PRODUCTION environment on a production deployment.",
                "لا يمكن استخدام وضع المحاكاة مع بيئة الإنتاج في نشر إنتاجي.",
            ),
        );
    }

    // A placeholder certificate (Admin mock mode) is only usable while mock mode is on.
    if (placeholder) {
        if (!mock) throw certMissing();

        const pair = generateKeyPairSync("ec", { namedCurve: "secp256k1" });
        const publicKeyDer = pair.publicKey.export({ type: "spki", format: "der" });
        const body = publicKeyDer.toString("base64");

        return {
            mode: "MOCK",
            environment,
            egsSerial: credential.egsSerial,
            authorization: null,
            privateKey: pair.privateKey,
            certificate: {
                body,
                digest: Buffer.from(sha256(body).toString("hex")).toString("base64"),
                issuerName: "CN=MOCK-ZATCA-CA",
                serialDecimal: "1",
                publicKeyDer,
                signatureDer: randomBytes(71),
                vatNumber: null,
            },
        };
    }

    try {
        const open = resolveSecretOpener();
        const key = encryptionKey();
        const secret = open(credential.secretEncrypted, organizationId, key);
        const privateKeyPem = open(credential.privateKeyEncrypted, organizationId, key);
        const certificate = parseCertificate(credential.binarySecurityToken);

        return {
            mode: "REAL",
            environment,
            egsSerial: credential.egsSerial,
            authorization: `Basic ${Buffer.from(
                `${credential.binarySecurityToken.trim()}:${secret}`,
                "utf8",
            ).toString("base64")}`,
            privateKey: createPrivateKey(privateKeyPem),
            certificate,
        };
    } catch (error) {
        if (error instanceof ZatcaFlowError && error.code === "ZATCA_DECRYPT_UNAVAILABLE") {
            throw error;
        }

        console.error("[zatca] stored credential could not be opened", error);

        throw certMissing();
    }
}

/* -------------------------------------------------------------------------- */
/* Phase 2 TLV QR                                                             */
/* -------------------------------------------------------------------------- */

function tlv(tag: number, value: Buffer): Buffer {
    if (value.length > 255) throw new Error(`TLV tag ${tag} is longer than 255 bytes`);

    return Buffer.concat([Buffer.from([tag, value.length]), value]);
}

function truncateUtf8(value: string, maxBytes: number): string {
    let result = value;

    while (Buffer.byteLength(result, "utf8") > maxBytes) result = result.slice(0, -1);

    return result;
}

/** 9-tag Phase 2 QR (base64 TLV): seller, VAT no., timestamp, total, VAT, hash, signature, key, stamp. */
export function buildPhase2Qr(input: {
    sellerName: string;
    vatNumber: string;
    timestamp: string;
    totalC: number;
    vatC: number;
    invoiceHash: string;
    signatureValue: string;
    publicKeyDer: Buffer;
    certificateSignature: Buffer;
}): string {
    return Buffer.concat([
        tlv(1, Buffer.from(truncateUtf8(input.sellerName, 250), "utf8")),
        tlv(2, Buffer.from(input.vatNumber, "utf8")),
        tlv(3, Buffer.from(input.timestamp, "utf8")),
        tlv(4, Buffer.from(money(input.totalC), "utf8")),
        tlv(5, Buffer.from(money(input.vatC), "utf8")),
        tlv(6, Buffer.from(input.invoiceHash, "utf8")),
        tlv(7, Buffer.from(input.signatureValue, "utf8")),
        tlv(8, input.publicKeyDer),
        tlv(9, input.certificateSignature),
    ]).toString("base64");
}

/* -------------------------------------------------------------------------- */
/* UBL 2.1 Simplified Tax Invoice + XAdES signature                           */
/* -------------------------------------------------------------------------- */

function signedPropertiesXml(signingTime: string, certificate: ParsedCertificate): string {
    const ds = (tag: string, attrs: string, content: string): string =>
        `<ds:${tag} xmlns:ds="${NS_DS}"${attrs}>${content}</ds:${tag}>`;

    return (
        `<xades:SignedProperties xmlns:xades="${NS_XADES}" Id="xadesSignedProperties">` +
        `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate><xades:Cert>` +
        `<xades:CertDigest>` +
        ds("DigestMethod", ` Algorithm="${ALG_SHA256}"`, "") +
        ds("DigestValue", "", xmlText(certificate.digest)) +
        `</xades:CertDigest>` +
        `<xades:IssuerSerial>` +
        ds("X509IssuerName", "", xmlText(certificate.issuerName)) +
        ds("X509SerialNumber", "", certificate.serialDecimal) +
        `</xades:IssuerSerial>` +
        `</xades:Cert></xades:SigningCertificate>` +
        `</xades:SignedSignatureProperties>` +
        `</xades:SignedProperties>`
    );
}

function amountTag(tag: string, cents: number): string {
    return `<cbc:${tag} currencyID="SAR">${money(cents)}</cbc:${tag}>`;
}

const NATIONAL_ID_PATTERN = /^\d{10}$/;

/**
 * Validated buyer identification. Exempt (VATEX-SA-HEA) invoices must carry a Saudi national ID
 * with scheme NAT (BR-KSA-49); a missing / malformed one stops the invoice before it is sent.
 * For taxable invoices the ID is optional and only sent when it is well formed.
 */
function resolveBuyerIdentification(input: ZatcaInvoiceInput): ZatcaBuyerIdentification | null {
    const value = input.buyerId?.value.trim() ?? "";
    const scheme = input.buyerId?.scheme ?? null;
    const valid = scheme !== null && NATIONAL_ID_PATTERN.test(value);

    if (input.vatExempt && !(valid && scheme === "NAT")) {
        throw new ZatcaFlowError(
            "ZATCA_BUYER_ID_INVALID",
            bi(
                "A Saudi citizen's 10-digit national ID is required on a VAT-exempt (healthcare) invoice. Correct the patient's national ID and try again.",
                "رقم الهوية الوطنية (10 أرقام) للمواطن مطلوب في فاتورة الرعاية الصحية المعفاة من الضريبة. صحّح رقم هوية المريض وحاول مرة أخرى.",
            ),
        );
    }

    return valid && scheme !== null ? { scheme, value } : null;
}

/**
 * Builds the invoice (minified, already in canonical form so hashing needs no re-serialization),
 * hashes it, signs the hash with the EGS private key and embeds the XAdES signature + Phase 2 QR.
 */
export function buildSignedSimplifiedInvoice(
    input: ZatcaInvoiceInput,
    material: ZatcaSigningMaterial,
): SignedZatcaInvoice {
    // The seller VAT (BT-31) must be the one inside the authentication certificate.
    const seller = withCertificateVat(input.seller, material);
    const iso = input.issuedAt.toISOString();
    const issueDate = iso.slice(0, 10);
    const issueTime = `${iso.slice(11, 19)}Z`;
    const qrTimestamp = `${issueDate}T${issueTime}`;
    const signingTime = `${issueDate}T${issueTime}`;
    const totalC = input.patientC + input.vatC;
    const percent = input.vatExempt ? "0.00" : input.vatRate.toFixed(2);
    const category = input.vatExempt ? "Z" : "S";
    const itemName = `${input.itemNameEn} - ${input.itemNameAr}`;
    const documentType = input.documentType ?? "INVOICE";
    const typeCode =
        documentType === "CREDIT_NOTE" ? "381" : documentType === "DEBIT_NOTE" ? "383" : "388";
    const billingReference =
        documentType !== "INVOICE" && input.billingReference
            ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xmlText(input.billingReference)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
            : "";
    const instructionNote =
        documentType !== "INVOICE" && input.noteReason
            ? `<cbc:InstructionNote>${xmlText(input.noteReason)}</cbc:InstructionNote>`
            : "";

    const rootOpen = `<Invoice xmlns="${NS_INVOICE}" xmlns:cac="${NS_CAC}" xmlns:cbc="${NS_CBC}" xmlns:ext="${NS_EXT}">`;

    const header =
        `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>` +
        `<cbc:ID>${xmlText(input.invoiceNumber)}</cbc:ID>` +
        `<cbc:UUID>${input.uuid}</cbc:UUID>` +
        `<cbc:IssueDate>${issueDate}</cbc:IssueDate>` +
        `<cbc:IssueTime>${issueTime}</cbc:IssueTime>` +
        `<cbc:InvoiceTypeCode name="0200000">${typeCode}</cbc:InvoiceTypeCode>` +
        `<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>` +
        `<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>` +
        billingReference +
        `<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${input.icv}</cbc:UUID></cac:AdditionalDocumentReference>` +
        `<cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${input.pih}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;

    // BT-29: a CRN must be the 10-digit commercial registration number; anything else is sent as OTH.
    const crNumber = seller.crNumber?.trim() ?? "";
    const sellerIdentification = /^\d{10}$/.test(crNumber)
        ? `<cbc:ID schemeID="CRN">${crNumber}</cbc:ID>`
        : `<cbc:ID schemeID="OTH">${xmlText(seller.vatNumber)}</cbc:ID>`;

    // BT-46 / BT-46-1: VATEX-SA-HEA (Saudi citizen) requires the buyer's national ID, scheme NAT.
    const buyerId = resolveBuyerIdentification(input);
    const buyerIdentification = buyerId
        ? `<cac:PartyIdentification><cbc:ID schemeID="${buyerId.scheme}">${buyerId.value}</cbc:ID></cac:PartyIdentification>`
        : "";

    const parties =
        `<cac:AccountingSupplierParty><cac:Party>` +
        `<cac:PartyIdentification>${sellerIdentification}</cac:PartyIdentification>` +
        `<cac:PostalAddress>` +
        `<cbc:StreetName>${xmlText(seller.streetName)}</cbc:StreetName>` +
        `<cbc:BuildingNumber>${xmlText(seller.buildingNumber)}</cbc:BuildingNumber>` +
        (seller.additionalNumber
            ? `<cbc:PlotIdentification>${xmlText(seller.additionalNumber)}</cbc:PlotIdentification>`
            : "") +
        `<cbc:CitySubdivisionName>${xmlText(seller.district)}</cbc:CitySubdivisionName>` +
        `<cbc:CityName>${xmlText(seller.city)}</cbc:CityName>` +
        `<cbc:PostalZone>${xmlText(seller.postalCode)}</cbc:PostalZone>` +
        `<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>` +
        `</cac:PostalAddress>` +
        `<cac:PartyTaxScheme><cbc:CompanyID>${xmlText(seller.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` +
        `<cac:PartyLegalEntity><cbc:RegistrationName>${xmlText(seller.nameAr)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
        `</cac:Party></cac:AccountingSupplierParty>` +
        `<cac:AccountingCustomerParty><cac:Party>` +
        buyerIdentification +
        `<cac:PartyLegalEntity><cbc:RegistrationName>${xmlText(input.buyerName)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
        `</cac:Party></cac:AccountingCustomerParty>`;

    const exemption = input.vatExempt
        ? `<cbc:TaxExemptionReasonCode>VATEX-SA-HEA</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Private healthcare to citizen</cbc:TaxExemptionReason>`
        : "";

    const insuranceAllowance =
        input.insuranceC > 0
            ? `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Insurance coverage</cbc:AllowanceChargeReason>${amountTag("Amount", input.insuranceC)}</cac:AllowanceCharge>`
            : "";

    const totals =
        `<cac:PaymentMeans><cbc:PaymentMeansCode>${input.paymentMethod === "CASH" ? "10" : "48"}</cbc:PaymentMeansCode>${instructionNote}</cac:PaymentMeans>` +
        `<cac:TaxTotal>${amountTag("TaxAmount", input.vatC)}</cac:TaxTotal>` +
        `<cac:TaxTotal>${amountTag("TaxAmount", input.vatC)}` +
        `<cac:TaxSubtotal>${amountTag("TaxableAmount", input.patientC)}${amountTag("TaxAmount", input.vatC)}` +
        `<cac:TaxCategory><cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">${category}</cbc:ID><cbc:Percent>${percent}</cbc:Percent>${exemption}` +
        `<cac:TaxScheme><cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>` +
        `</cac:TaxSubtotal></cac:TaxTotal>` +
        `<cac:LegalMonetaryTotal>${amountTag("LineExtensionAmount", input.patientC)}${amountTag("TaxExclusiveAmount", input.patientC)}${amountTag("TaxInclusiveAmount", totalC)}${amountTag("AllowanceTotalAmount", 0)}${amountTag("PrepaidAmount", 0)}${amountTag("PayableAmount", totalC)}</cac:LegalMonetaryTotal>` +
        `<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>${amountTag("LineExtensionAmount", input.patientC)}` +
        insuranceAllowance +
        `<cac:TaxTotal>${amountTag("TaxAmount", input.vatC)}${amountTag("RoundingAmount", totalC)}</cac:TaxTotal>` +
        `<cac:Item><cbc:Name>${xmlText(itemName)}</cbc:Name>` +
        `<cac:ClassifiedTaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${percent}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>` +
        `<cac:Price>${amountTag("PriceAmount", input.feeC)}</cac:Price>` +
        `</cac:InvoiceLine>`;

    const close = `</Invoice>`;

    // 1. Hash: the document WITHOUT ext:UBLExtensions, cac:Signature and the QR reference.
    const hashable = rootOpen + header + parties + totals + close;
    const invoiceHashBytes = sha256(hashable);
    const invoiceHash = invoiceHashBytes.toString("base64");

    // 2. ECDSA signature over the invoice hash.
    const signatureValue = createSign("sha256")
        .update(invoiceHashBytes)
        .sign(material.privateKey, "base64");

    // 3. XAdES SignedProperties digest (base64 of the hex SHA-256) and the full signature block.
    const signedProperties = signedPropertiesXml(signingTime, material.certificate);
    const signedPropertiesDigest = Buffer.from(sha256(signedProperties).toString("hex")).toString(
        "base64",
    );

    const xpath = (expression: string): string =>
        `<ds:Transform Algorithm="${ALG_XPATH}"><ds:XPath>${xmlText(expression)}</ds:XPath></ds:Transform>`;

    const ublExtensions =
        `<ext:UBLExtensions><ext:UBLExtension>` +
        `<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
        `<ext:ExtensionContent>` +
        `<sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">` +
        `<sac:SignatureInformation>` +
        `<cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
        `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
        `<ds:Signature xmlns:ds="${NS_DS}" Id="signature">` +
        `<ds:SignedInfo>` +
        `<ds:CanonicalizationMethod Algorithm="${ALG_C14N11}"></ds:CanonicalizationMethod>` +
        `<ds:SignatureMethod Algorithm="${ALG_ECDSA}"></ds:SignatureMethod>` +
        `<ds:Reference Id="invoiceSignedData" URI="">` +
        `<ds:Transforms>` +
        xpath("not(//ancestor-or-self::ext:UBLExtensions)") +
        xpath("not(//ancestor-or-self::cac:Signature)") +
        xpath("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])") +
        `<ds:Transform Algorithm="${ALG_C14N11}"></ds:Transform>` +
        `</ds:Transforms>` +
        `<ds:DigestMethod Algorithm="${ALG_SHA256}"></ds:DigestMethod>` +
        `<ds:DigestValue>${invoiceHash}</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
        `<ds:DigestMethod Algorithm="${ALG_SHA256}"></ds:DigestMethod>` +
        `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
        `</ds:Reference>` +
        `</ds:SignedInfo>` +
        `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
        `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${material.certificate.body}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
        `<ds:Object><xades:QualifyingProperties xmlns:xades="${NS_XADES}" Target="signature">${signedProperties}</xades:QualifyingProperties></ds:Object>` +
        `</ds:Signature>` +
        `</sac:SignatureInformation>` +
        `</sig:UBLDocumentSignatures>` +
        `</ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>`;

    // 4. Phase 2 QR (TLV, 9 tags).
    const qrPayload = buildPhase2Qr({
        sellerName: seller.nameAr,
        vatNumber: seller.vatNumber,
        timestamp: qrTimestamp,
        totalC,
        vatC: input.vatC,
        invoiceHash,
        signatureValue,
        publicKeyDer: material.certificate.publicKeyDer,
        certificateSignature: material.certificate.signatureDer,
    });

    const qrReference = `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrPayload}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
    const signatureReference = `<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>`;

    const xml =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        rootOpen +
        ublExtensions +
        header +
        qrReference +
        signatureReference +
        parties +
        totals +
        close;

    return {
        sellerVatNumber: seller.vatNumber,
        xml,
        xmlBase64: Buffer.from(xml, "utf8").toString("base64"),
        invoiceHash,
        signatureValue,
        qrPayload,
        totalC,
    };
}

/* -------------------------------------------------------------------------- */
/* Reporting API (step 4)                                                     */
/* -------------------------------------------------------------------------- */

function textOf(value: unknown, max = 800): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readMessageGroup(
    group: unknown,
    level: ZatcaMessage["level"],
): ZatcaMessage[] {
    if (!Array.isArray(group)) return [];

    const output: ZatcaMessage[] = [];

    for (const item of group.slice(0, 25)) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;

        const record = item as Record<string, unknown>;

        output.push({
            level,
            type: textOf(record.type, 60),
            code: textOf(record.code, 80),
            category: textOf(record.category, 80),
            message: textOf(record.message),
        });
    }

    return output;
}

function readValidationMessages(body: unknown): ZatcaMessage[] {
    if (!body || typeof body !== "object") return [];

    const record = body as Record<string, unknown>;
    const results = record.validationResults;

    if (results && typeof results === "object" && !Array.isArray(results)) {
        const groups = results as Record<string, unknown>;

        return [
            ...readMessageGroup(groups.errorMessages, "ERROR"),
            ...readMessageGroup(groups.warningMessages, "WARNING"),
            ...readMessageGroup(groups.infoMessages, "INFO"),
        ];
    }

    const direct =
        textOf(record.errorMessage) || textOf(record.message) || textOf(record.dispositionMessage);

    if (direct) {
        return [
            {
                level: "ERROR",
                type: "GATEWAY",
                code: textOf(record.errorCode ?? record.code, 80) || "GATEWAY_ERROR",
                category: textOf(record.errorCategory, 80) || "GATEWAY",
                message: direct,
            },
        ];
    }

    return [];
}

function readRequestId(body: unknown): string | null {
    if (!body || typeof body !== "object") return null;

    const value = (body as Record<string, unknown>).requestID;

    return typeof value === "string" || typeof value === "number"
        ? String(value).slice(0, 64)
        : null;
}

/**
 * Submits the signed invoice as a Simplified Tax Invoice (B2C reporting). 200 / 202 = REPORTED
 * (202 carries warnings); 4xx = REJECTED; network errors, 429 and 5xx = UNAVAILABLE (nothing was
 * accepted, the caller keeps the visit unpaid).
 */
export async function reportSimplifiedInvoice(args: {
    material: ZatcaSigningMaterial;
    uuid: string;
    invoiceHash: string;
    xmlBase64: string;
}): Promise<ZatcaReportResult> {
    const { material } = args;

    if (isMockMode() || material.mode === "MOCK" || material.authorization === null) {
        return {
            outcome: "REPORTED",
            httpStatus: 200,
            requestId: `MOCK-${Date.now()}`,
            mock: true,
            reason: null,
            messages: [
                {
                    level: "INFO",
                    type: "MOCK_MODE",
                    code: "MOCK_MODE",
                    category: "MJDITAL",
                    message:
                        "ZATCA_MOCK_MODE is on: the invoice was signed locally and NOT sent to ZATCA.",
                },
            ],
        };
    }

    const url = resolveReportingUrl(material.environment);
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
                "Clearance-Status": "0",
                Authorization: material.authorization,
            },
            body: JSON.stringify({
                invoiceHash: args.invoiceHash,
                uuid: args.uuid,
                invoice: args.xmlBase64,
            }),
            signal: controller.signal,
            cache: "no-store",
        });

        const raw = await response.text();
        let body: unknown = null;

        if (raw.trim()) {
            try {
                body = JSON.parse(raw);
            } catch {
                body = null;
            }
        }

        const messages = readValidationMessages(body);
        const requestId = readRequestId(body);

        if (!response.ok) {
            console.error(
                `[zatca report] HTTP ${response.status} POST ${url}\n${raw.slice(0, 2000)}`,
            );
        }

        if (response.status === 200 || response.status === 202) {
            return {
                outcome: "REPORTED",
                httpStatus: response.status,
                requestId,
                messages,
                mock: false,
                reason: null,
            };
        }

        if (response.status === 429 || response.status >= 500) {
            return {
                outcome: "UNAVAILABLE",
                httpStatus: response.status,
                requestId,
                mock: false,
                messages:
                    messages.length > 0
                        ? messages
                        : [
                            {
                                level: "ERROR",
                                type: "GATEWAY",
                                code: `HTTP_${response.status}`,
                                category: "GATEWAY",
                                message: "The ZATCA gateway is temporarily unavailable.",
                            },
                        ],
                reason: bi(
                    "The ZATCA gateway is temporarily unavailable.",
                    "بوابة هيئة الزكاة غير متاحة مؤقتاً.",
                ),
            };
        }

        const fallbackMessage =
            response.status === 401 || response.status === 403
                ? "ZATCA rejected the CSID credentials. Re-issue the certificate in Admin settings."
                : response.status === 404
                    ? "The ZATCA reporting endpoint was not found. Check ZATCA_ENV and the gateway URL."
                    : "ZATCA rejected the invoice.";

        return {
            outcome: "REJECTED",
            httpStatus: response.status,
            requestId,
            mock: false,
            messages:
                messages.length > 0
                    ? messages
                    : [
                        {
                            level: "ERROR",
                            type: "GATEWAY",
                            code: `HTTP_${response.status}`,
                            category: "GATEWAY",
                            message: fallbackMessage,
                        },
                    ],
            reason:
                messages.find((entry) => entry.level === "ERROR")?.message || fallbackMessage,
        };
    } catch (error) {
        console.error(`[zatca report] request to ${url} failed`, error);

        return {
            outcome: "UNAVAILABLE",
            httpStatus: null,
            requestId: null,
            mock: false,
            messages: [
                {
                    level: "ERROR",
                    type: "NETWORK",
                    code: "GATEWAY_UNREACHABLE",
                    category: "GATEWAY",
                    message: "Could not reach the ZATCA gateway.",
                },
            ],
            reason: bi(
                "Could not reach the ZATCA gateway.",
                "تعذّر الوصول إلى بوابة هيئة الزكاة.",
            ),
        };
    } finally {
        clearTimeout(timer);
    }
}

/* -------------------------------------------------------------------------- */
/* Onboarding: compliance invoice samples (Compliance CSID -> Production CSID) */
/* -------------------------------------------------------------------------- */

export interface ComplianceSample {
    label: "SIMPLIFIED_INVOICE" | "SIMPLIFIED_CREDIT_NOTE" | "SIMPLIFIED_DEBIT_NOTE";
    invoiceNumber: string;
    uuid: string;
    invoiceHash: string;
    xmlBase64: string;
}

/**
 * Builds and signs the documents ZATCA requires for the compliance check of a SIMPLIFIED-only EGS
 * (CSR functionality "0100"): a simplified invoice, a simplified credit note and a simplified debit
 * note. They are signed with the Compliance CSID certificate + the CSR private key and must be posted
 * to POST {gateway}/compliance/invoices before the Production CSID can be requested.
 */
export function buildComplianceSamples(args: {
    seller: ZatcaSellerProfile;
    binarySecurityToken: string;
    privateKeyPem: string;
    environment: ZatcaEnvironmentName;
}): ComplianceSample[] {
    let material: ZatcaSigningMaterial;

    try {
        material = {
            mode: "REAL",
            environment: args.environment,
            egsSerial: "COMPLIANCE",
            authorization: null,
            privateKey: createPrivateKey(args.privateKeyPem),
            certificate: parseCertificate(args.binarySecurityToken),
        };
    } catch (error) {
        console.error("[zatca] compliance samples: certificate / key could not be read", error);

        throw new ZatcaFlowError(
            "COMPLIANCE_SAMPLE_FAILED",
            bi(
                "The compliance certificate or key could not be read.",
                "تعذّرت قراءة شهادة الامتثال أو المفتاح.",
            ),
        );
    }

    const issuedAt = new Date();
    const suffix = String(Date.now()).slice(-6);
    const invoiceNumber = `CMP-INV-${suffix}`;

    const plan: Array<{
        label: ComplianceSample["label"];
        documentType: NonNullable<ZatcaInvoiceInput["documentType"]>;
        number: string;
    }> = [
            { label: "SIMPLIFIED_INVOICE", documentType: "INVOICE", number: invoiceNumber },
            { label: "SIMPLIFIED_CREDIT_NOTE", documentType: "CREDIT_NOTE", number: `CMP-CRN-${suffix}` },
            { label: "SIMPLIFIED_DEBIT_NOTE", documentType: "DEBIT_NOTE", number: `CMP-DBN-${suffix}` },
        ];

    const samples: ComplianceSample[] = [];
    let pih = ZATCA_GENESIS_PIH;

    plan.forEach((entry, index) => {
        const uuid = randomUUID();
        const signed = buildSignedSimplifiedInvoice(
            {
                uuid,
                invoiceNumber: entry.number,
                icv: index + 1,
                pih,
                issuedAt,
                seller: args.seller,
                buyerName: "Compliance Test Patient",
                paymentMethod: "CASH",
                itemCode: "CHK-01",
                itemNameAr: "كشفية",
                itemNameEn: "Consultation",
                feeC: 10_000,
                insuranceC: 0,
                patientC: 10_000,
                vatC: 1_500,
                vatRate: 15,
                vatExempt: false,
                documentType: entry.documentType,
                billingReference: entry.documentType === "INVOICE" ? undefined : invoiceNumber,
                noteReason: entry.documentType === "INVOICE" ? undefined : "Compliance check",
            },
            material,
        );

        pih = signed.invoiceHash;

        samples.push({
            label: entry.label,
            invoiceNumber: entry.number,
            uuid,
            invoiceHash: signed.invoiceHash,
            xmlBase64: signed.xmlBase64,
        });
    });

    return samples;
}

/* -------------------------------------------------------------------------- */
/* Pre-flight: is the stored certificate able to REPORT invoices?             */
/* -------------------------------------------------------------------------- */

export type ZatcaCredentialCheck =
    | { ok: true }
    | { ok: false; code: "CSID_NOT_PRODUCTION" | "CSID_MOCK_CERTIFICATE"; message: string };

/** ZATCA Production CSID issuing CAs: TSZEINVOICE-*, PEZEINVOICE*, PRZEINVOICE*. */
const PRODUCTION_ISSUER_PATTERN = /CN=[A-Z]{2}ZEINVOICE/i;

/**
 * Positive X.509 proof of a Production CSID. `false` means "not proven", not "Compliance": the
 * Developer Portal's mock CA (CN=eInvoicing) cannot be told apart by issuer.
 */
export function isProductionCsidCertificate(binarySecurityToken: string): boolean {
    try {
        return PRODUCTION_ISSUER_PATTERN.test(parseCertificate(binarySecurityToken).issuerName);
    } catch {
        return false;
    }
}

/**
 * Single credential guard used by Reception before it reserves an invoice.
 *  - no credential          -> ok (loadSigningMaterial reports ZATCA_CERT_MISSING)
 *  - production request id stored by onboarding     -> ok
 *  - no request id, but issued by a Production CA   -> ok
 *  - otherwise (Compliance CSID)                    -> CSID_NOT_PRODUCTION
 *  - mock placeholder while ZATCA_MOCK_MODE is off  -> CSID_MOCK_CERTIFICATE
 */
export async function checkReportingCredential(
    organizationId: string,
    environment: ZatcaEnvironmentName,
): Promise<ZatcaCredentialCheck> {
    const credential = await prisma.zatcaCredential.findUnique({
        where: { organizationId_environment: { organizationId, environment } },
        select: {
            binarySecurityToken: true,
            productionRequestId: true,
            secretEncrypted: true,
            privateKeyEncrypted: true,
        },
    });

    if (!credential) return { ok: true };

    const productionRequestId = credential.productionRequestId?.trim() ?? "";
    const mockCertificate =
        productionRequestId.startsWith("MOCK-") ||
        credential.secretEncrypted.startsWith(MOCK_SEALED_PREFIX) ||
        credential.privateKeyEncrypted.startsWith(MOCK_SEALED_PREFIX);

    if (mockCertificate) {
        return isMockMode()
            ? { ok: true }
            : {
                ok: false,
                code: "CSID_MOCK_CERTIFICATE",
                message: bi(
                    "The stored ZATCA certificate is a test (mock) certificate. Open Admin > ZATCA Integration and click Generate & Certify CSID again with a fresh OTP.",
                    "شهادة الزكاة المخزّنة شهادة اختبار (محاكاة). افتح إعدادات الأدمن > ربط الزكاة وأعد إصدار الشهادة برمز OTP جديد.",
                ),
            };
    }

    if (
        productionRequestId !== "" ||
        isProductionCsidCertificate(credential.binarySecurityToken)
    ) {
        return { ok: true };
    }

    return {
        ok: false,
        code: "CSID_NOT_PRODUCTION",
        message: bi(
            `The stored ZATCA certificate is a Compliance CSID, which cannot report invoices. Open Admin > ZATCA Integration, select ${environment === "PRODUCTION" ? "Production" : "Simulation Sandbox"} and click Generate & Certify CSID again with a fresh OTP.`,
            `شهادة الزكاة المخزّنة هي CSID امتثال ولا يمكنها الإبلاغ عن الفواتير. افتح إعدادات الأدمن > ربط الزكاة، اختر ${environment === "PRODUCTION" ? "الإنتاج" : "بيئة المحاكاة"} وأعد إصدار الشهادة برمز OTP جديد.`,
        ),
    };
}