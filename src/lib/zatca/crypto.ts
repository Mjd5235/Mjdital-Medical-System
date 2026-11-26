// src/lib/zatca/crypto.ts

/**
 * ZATCA cryptography utilities (Node.js native `crypto` only — no openssl binary, no extra packages).
 *
 * Responsibilities
 * ----------------
 * 1. Generate a valid secp256k1 EC key pair and a PKCS#10 CSR carrying the ZATCA certificate
 *    template + subjectAltName directoryName extensions, signed with ECDSA-SHA256.
 * 2. Protect secrets at rest with AES-256-GCM (`sealSecret` / `unsealSecret`), using a 32-byte
 *    `ZATCA_ENCRYPTION_KEY` (64 hex chars or base64) and binding each ciphertext to the
 *    organizationId through the GCM additional authenticated data (AAD).
 * 3. Read the validity window and the VAT number of the certificate (binarySecurityToken) issued
 *    by ZATCA.
 *
 * Why not `hashPassword`?
 *   A password hash is one-way. It can never yield an EC private key, a CSR or a certificate, and
 *   secrets that must be used later (CSID secret, signing key) have to be decryptable.
 *   AES-256-GCM is the correct primitive for that.
 *
 * Note: this module has no "use server" directive on purpose. It is a plain server-side library
 * that must only be imported from server code (server actions / route handlers).
 */

import {
    X509Certificate,
    createCipheriv,
    createDecipheriv,
    generateKeyPairSync,
    randomBytes,
    sign,
} from "node:crypto";

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

/** Domain error carrying a stable machine-readable code (mapped to a UI message by the caller). */
export class ZatcaFlowError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "ZatcaFlowError";
        this.code = code;
    }
}

/* -------------------------------------------------------------------------- */
/*                         Secrets at rest (AES-256-GCM)                       */
/* -------------------------------------------------------------------------- */

/** Prefix used by the testing mock for placeholder secrets. They can never be decrypted. */
export const MOCK_SEALED_PREFIX = "mock:v1:";

const SEALED_VERSION = "v1";
const GCM_IV_BYTES = 12;

export function isMockSealed(value: string): boolean {
    return value.startsWith(MOCK_SEALED_PREFIX);
}

/**
 * Reads and validates ZATCA_ENCRYPTION_KEY.
 * Accepts 64 hex characters or a base64 string that decodes to exactly 32 bytes.
 *
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function encryptionKey(): Buffer {
    const raw = process.env.ZATCA_ENCRYPTION_KEY?.trim();

    if (!raw) {
        throw new ZatcaFlowError(
            "ENCRYPTION_NOT_CONFIGURED",
            "ZATCA credential encryption is not configured on the server. — لم يتم إعداد تشفير بيانات اعتماد هيئة الزكاة على الخادم.",
        );
    }

    const key = /^[0-9a-f]{64}$/i.test(raw)
        ? Buffer.from(raw, "hex")
        : Buffer.from(raw, "base64");

    if (key.length !== 32) {
        throw new ZatcaFlowError(
            "ENCRYPTION_NOT_CONFIGURED",
            "ZATCA credential encryption key is invalid (32 bytes required). — مفتاح تشفير بيانات اعتماد هيئة الزكاة غير صالح (يلزم 32 بايت).",
        );
    }

    return key;
}

/**
 * Encrypts `plain` with AES-256-GCM.
 * Output format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`.
 * The organizationId is bound as AAD, so a ciphertext copied to another tenant fails to decrypt.
 */
export function sealSecret(
    plain: string,
    organizationId: string,
    key: Buffer = encryptionKey(),
): string {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(organizationId, "utf8"));

    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${SEALED_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Decrypts a value produced by `sealSecret`. Throws `ZatcaFlowError` on tampering or wrong tenant. */
export function unsealSecret(
    sealed: string,
    organizationId: string,
    key: Buffer = encryptionKey(),
): string {
    if (isMockSealed(sealed)) {
        throw new ZatcaFlowError(
            "MOCK_CREDENTIAL",
            "This certificate was issued in Mock Mode and cannot be used for real signing. — صدرت هذه الشهادة في وضع المحاكاة ولا يمكن استخدامها للتوقيع الفعلي.",
        );
    }

    const parts = sealed.split(":");

    if (parts.length !== 4 || parts[0] !== SEALED_VERSION) {
        throw new ZatcaFlowError(
            "SECRET_FORMAT_INVALID",
            "The stored ZATCA secret has an unsupported format. — صيغة السر المخزّن لهيئة الزكاة غير مدعومة.",
        );
    }

    try {
        const iv = Buffer.from(parts[1], "base64");
        const tag = Buffer.from(parts[2], "base64");
        const data = Buffer.from(parts[3], "base64");

        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAAD(Buffer.from(organizationId, "utf8"));
        decipher.setAuthTag(tag);

        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch (error) {
        console.error("[zatca unseal]", error);

        throw new ZatcaFlowError(
            "SECRET_DECRYPTION_FAILED",
            "The stored ZATCA secret could not be decrypted. Check ZATCA_ENCRYPTION_KEY. — تعذّر فك تشفير السر المخزّن. تحقق من ZATCA_ENCRYPTION_KEY.",
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                         DER / PKCS#10 primitives                            */
/* -------------------------------------------------------------------------- */

function derLength(length: number): Buffer {
    if (length < 0x80) return Buffer.from([length]);

    const bytes: number[] = [];
    let value = length;

    while (value > 0) {
        bytes.unshift(value & 0xff);
        value = Math.floor(value / 256);
    }

    return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...parts: Buffer[]): Buffer {
    const body = Buffer.concat(parts);

    return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function derOid(oid: string): Buffer {
    const arcs = oid.split(".").map((part) => Number(part));
    const encoded: number[] = [];
    const sequence = [arcs[0] * 40 + arcs[1], ...arcs.slice(2)];

    for (const arc of sequence) {
        const chunk: number[] = [arc % 128];
        let rest = Math.floor(arc / 128);

        while (rest > 0) {
            chunk.unshift((rest % 128) | 0x80);
            rest = Math.floor(rest / 128);
        }

        encoded.push(...chunk);
    }

    return tlv(0x06, Buffer.from(encoded));
}

const derSequence = (...parts: Buffer[]) => tlv(0x30, ...parts);
const derSet = (...parts: Buffer[]) => tlv(0x31, ...parts);
const derUtf8 = (value: string) => tlv(0x0c, Buffer.from(value, "utf8"));
const derPrintable = (value: string) => tlv(0x13, Buffer.from(value, "ascii"));
const derOctetString = (value: Buffer) => tlv(0x04, value);
const derBitString = (value: Buffer) => tlv(0x03, Buffer.from([0x00]), value);

function rdn(oid: string, value: Buffer): Buffer {
    return derSet(derSequence(derOid(oid), value));
}

function toPem(label: string, der: Buffer): string {
    const lines = der.toString("base64").match(/.{1,64}/g) ?? [];

    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/** Safe text for certificate subject values: printable ASCII only. */
export function configValue(value: string, fallback: string, max = 64): string {
    const cleaned = value
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9 .\-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);

    return cleaned || fallback;
}

/* -------------------------------------------------------------------------- */
/*                              Key pair + CSR                                 */
/* -------------------------------------------------------------------------- */

/** Certificate template name per ZATCA gateway: Developer Portal / Simulation / Core. */
export type ZatcaCsrTemplate =
    | "TSTZATCA-Code-Signing"
    | "PREZATCA-Code-Signing"
    | "ZATCA-Code-Signing";

export interface CsrParams {
    environment: "SIMULATION" | "PRODUCTION";
    egsSerial: string;
    egsUuid: string;
    legalName: string;
    vatNumber: string;
    city: string;
    street: string;
    district: string;
    /**
     * ZATCA invoice-type functionality (CSR `title`): "0100" = Simplified only (default),
     * "1100" = Standard + Simplified. It decides which compliance documents ZATCA demands
     * before it issues the Production CSID (simplified only => invoice + credit + debit note).
     */
    invoiceTypes?: "0100" | "1100";
    /** Must match the gateway that receives the CSR. Defaults from `environment` when omitted. */
    templateName?: ZatcaCsrTemplate;
}

const OID = {
    countryName: "2.5.4.6",
    organizationName: "2.5.4.10",
    organizationalUnitName: "2.5.4.11",
    commonName: "2.5.4.3",
    surname: "2.5.4.4",
    title: "2.5.4.12",
    businessCategory: "2.5.4.15",
    registeredAddress: "2.5.4.26",
    userId: "0.9.2342.19200300.100.1.1",
    certificateTemplateName: "1.3.6.1.4.1.311.20.2",
    subjectAltName: "2.5.29.17",
    extensionRequest: "1.2.840.113549.1.9.14",
    ecdsaWithSha256: "1.2.840.10045.4.3.2",
} as const;

/**
 * Generates a secp256k1 key pair and a ZATCA-style PKCS#10 CSR (PEM).
 * The private key is returned as SEC1 PEM and must be sealed with `sealSecret` before storage.
 */
export function generateKeyAndCsr(params: CsrParams): {
    privateKeyPem: string;
    csrPem: string;
} {
    try {
        const { privateKey, publicKey } = generateKeyPairSync("ec", {
            namedCurve: "secp256k1",
        });

        const templateName: ZatcaCsrTemplate =
            params.templateName ??
            (params.environment === "PRODUCTION"
                ? "ZATCA-Code-Signing"
                : "PREZATCA-Code-Signing");

        // Subject: C / OU / O / CN
        const subject = derSequence(
            rdn(OID.countryName, derPrintable("SA")),
            rdn(
                OID.organizationalUnitName,
                derUtf8(configValue(`${params.city} Branch`, "Main Branch")),
            ),
            rdn(
                OID.organizationName,
                derUtf8(configValue(params.legalName, "Healthcare Provider")),
            ),
            rdn(OID.commonName, derUtf8(configValue(params.egsSerial, "EGS-KSA-01-00001"))),
        );

        // Extension 1: certificate template name
        const templateExtension = derSequence(
            derOid(OID.certificateTemplateName),
            derOctetString(derPrintable(templateName)),
        );

        // Extension 2: subjectAltName = directoryName { SN, UID, title, registeredAddress, businessCategory }
        const directoryName = derSequence(
            rdn(OID.surname, derUtf8(`1-Mjdital|2-HMS|3-${params.egsUuid}`)),
            rdn(OID.userId, derUtf8(params.vatNumber)),
            rdn(OID.title, derUtf8(params.invoiceTypes ?? "0100")),
            rdn(
                OID.registeredAddress,
                derUtf8(configValue(`${params.street} ${params.district}`, "Riyadh", 127)),
            ),
            rdn(OID.businessCategory, derUtf8("Healthcare")),
        );

        const altNameExtension = derSequence(
            derOid(OID.subjectAltName),
            derOctetString(derSequence(tlv(0xa4, directoryName))),
        );

        const extensionRequest = derSequence(
            derOid(OID.extensionRequest),
            derSet(derSequence(templateExtension, altNameExtension)),
        );

        const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;

        const certificationRequestInfo = derSequence(
            tlv(0x02, Buffer.from([0x00])), // version 0
            subject,
            spki,
            tlv(0xa0, extensionRequest), // attributes [0]
        );

        // Default dsaEncoding for EC keys is DER (ECDSA-Sig-Value), as required by PKCS#10.
        const signature = sign("sha256", certificationRequestInfo, privateKey);

        const certificationRequest = derSequence(
            certificationRequestInfo,
            derSequence(derOid(OID.ecdsaWithSha256)),
            derBitString(signature),
        );

        const privateKeyPem = privateKey
            .export({ type: "sec1", format: "pem" })
            .toString();

        return {
            privateKeyPem,
            csrPem: toPem("CERTIFICATE REQUEST", certificationRequest),
        };
    } catch (error) {
        console.error("[zatca csr]", error);

        throw new ZatcaFlowError(
            "CSR_GENERATION_FAILED",
            "The certificate signing request could not be generated. — تعذّر إنشاء طلب توقيع الشهادة.",
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                           Certificate validity                              */
/* -------------------------------------------------------------------------- */

/** DER content of OID 0.9.2342.19200300.100.1.1 (userId / UID): ZATCA stores the VAT number here. */
const UID_OID_DER = Buffer.from([0x09, 0x92, 0x26, 0x89, 0x93, 0xf2, 0x2c, 0x64, 0x01, 0x01]);
/** DER content of OID 2.5.4.97 (organizationIdentifier): fallback location of the VAT number. */
const ORGANIZATION_IDENTIFIER_OID_DER = Buffer.from([0x55, 0x04, 0x61]);

const CERTIFICATE_VAT_PATTERN = /^\d{15}$/;

/** A certificate whose notBefore is older than this at issuance time is a static sandbox sample. */
const SAMPLE_CERTIFICATE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the first DER string value that follows `oidContent` (an OID's content bytes) and passes
 * the 15-digit check. The ZATCA VAT number lives in the certificate's subjectAltName directoryName
 * (UID) and, on some CAs, in the subject's organizationIdentifier.
 */
function findVatAfterOid(der: Buffer, oidContent: Buffer): string | null {
    const header = Buffer.from([0x06, oidContent.length]);
    const needle = Buffer.concat([header, oidContent]);
    let from = 0;

    while (from < der.length) {
        const index = der.indexOf(needle, from);

        if (index < 0) return null;

        const tagOffset = index + needle.length;
        const tag = der[tagOffset];
        const length = der[tagOffset + 1];

        // UTF8String (0x0c), PrintableString (0x13) or IA5String (0x16), short-form length.
        if (
            (tag === 0x0c || tag === 0x13 || tag === 0x16) &&
            length !== undefined &&
            length < 0x80
        ) {
            const value = der
                .subarray(tagOffset + 2, tagOffset + 2 + length)
                .toString("utf8")
                .trim();

            if (CERTIFICATE_VAT_PATTERN.test(value)) return value;
        }

        from = index + 1;
    }

    return null;
}

/**
 * VAT registration number embedded in a ZATCA certificate (DER). ZATCA only lets the certificate's
 * own VAT number appear as the seller VAT (BT-31) of reported invoices (`certificate-permissions`).
 */
export function extractCertificateVat(der: Buffer): string | null {
    return (
        findVatAfterOid(der, UID_OID_DER) ??
        findVatAfterOid(der, ORGANIZATION_IDENTIFIER_OID_DER)
    );
}

export interface CertificateValidity {
    /**
     * Issue date stored / shown in Admin. It is the certificate's own notBefore, except for the
     * Developer Portal's fixed sample certificate (notBefore years in the past), where it is the
     * moment this credential was certified, so a freshly generated CSID never looks stale.
     */
    issuedAt: Date;
    /** The certificate's real notAfter (drives the expiry pre-flight, so it is never altered). */
    expiresAt: Date;
    /** notBefore exactly as written in the X.509 certificate. */
    certificateNotBefore: Date;
    /** VAT number embedded in the certificate, when it can be read. */
    vatNumber: string | null;
    /** True when the certificate is a static sandbox sample that was not minted just now. */
    sandboxSample: boolean;
}

/** Reads the validity window and VAT number of the certificate inside ZATCA's `binarySecurityToken`. */
export function parseCertificateValidity(
    binarySecurityToken: string,
    now: Date = new Date(),
): CertificateValidity {
    try {
        // ZATCA returns base64( base64(DER) ) — decode the outer layer to get the inner base64 text.
        const base64Der = Buffer.from(binarySecurityToken, "base64")
            .toString("utf8")
            .replace(/\s+/g, "");
        const certificate = new X509Certificate(Buffer.from(base64Der, "base64"));

        const certificateNotBefore = new Date(certificate.validFrom);
        const expiresAt = new Date(certificate.validTo);

        if (
            Number.isNaN(certificateNotBefore.getTime()) ||
            Number.isNaN(expiresAt.getTime())
        ) {
            throw new Error("Invalid certificate validity dates");
        }

        const sandboxSample =
            now.getTime() - certificateNotBefore.getTime() > SAMPLE_CERTIFICATE_AGE_MS;

        return {
            issuedAt: sandboxSample ? now : certificateNotBefore,
            expiresAt,
            certificateNotBefore,
            vatNumber: extractCertificateVat(certificate.raw),
            sandboxSample,
        };
    } catch (error) {
        console.error("[zatca certificate]", error);

        throw new ZatcaFlowError(
            "CERTIFICATE_INVALID",
            "ZATCA returned a certificate that could not be read. — أعادت هيئة الزكاة شهادة لا يمكن قراءتها.",
        );
    }
}