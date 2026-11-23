// src/lib/nphies/production.ts
/**
 * NPHIES Production adapter — dispatches FHIR R4 message Bundles to the NPHIES HSB:
 *   POST https://hsb.nphies.sa/api/fs/fhir/$process-message
 *
 * Uses `node:https` (no extra dependency) so a mutual-TLS client certificate can be
 * attached through an `https.Agent`. Server-side only (Node.js runtime, never Edge/browser).
 *
 * Extension points (placeholders):
 *   - `hooks.signBundle`     → apply a digital signature / JWS to the Bundle before dispatch.
 *   - `hooks.getAuthHeaders` → inject extra headers (API gateway key, tracing IDs, etc.).
 *   - `config.senderLicenseId` / `config.receiverLicenseId` → override license IDs
 *     (e.g. when the NPHIES-issued sender license differs from `CenterSettings.nphiesFacilityId`).
 */

import { readFileSync } from "node:fs";
import { Agent, request } from "node:https";
import {
    NPHIES_SYSTEMS,
    buildOperationOutcomeBundle,
    findOrganizationByType,
    findResource,
    isFhirBundle,
    isOperationOutcome,
} from "./fhir-builder";
import type { FhirBundle, NphiesAdapter, NphiesDispatchContext, NphiesMode } from "./types";

/* ========================================================================== */
/* Config                                                                     */
/* ========================================================================== */

export const NPHIES_DEFAULT_BASE_URL = "https://hsb.nphies.sa/api/fs/fhir";
export const NPHIES_PROCESS_MESSAGE_OPERATION = "$process-message";

export interface NphiesProductionConfig {
    /** Full endpoint, e.g. https://hsb.nphies.sa/api/fs/fhir/$process-message */
    endpointUrl: string;
    timeoutMs: number;
    /** PEM contents of the mTLS client certificate issued by NPHIES. */
    clientCertPem?: string;
    /** PEM contents of the client private key. */
    clientKeyPem?: string;
    clientKeyPassphrase?: string;
    /** Optional extra CA bundle (PEM) used to validate the NPHIES server certificate. */
    caCertPem?: string;
    rejectUnauthorized: boolean;
    /** Optional override of the sender (provider) license ID. */
    senderLicenseId?: string;
    /** Optional override of the receiver license ID. */
    receiverLicenseId?: string;
}

export interface NphiesProductionHooks {
    signBundle?: (bundle: FhirBundle, context: NphiesDispatchContext) => Promise<FhirBundle>;
    getAuthHeaders?: (context: NphiesDispatchContext) => Promise<Record<string, string>>;
}

function readPem(inline: string | undefined, path: string | undefined): string | undefined {
    if (inline !== undefined && inline.trim() !== "") {
        return inline.replace(/\\n/g, "\n");
    }
    if (path !== undefined && path.trim() !== "") {
        return readFileSync(path, "utf8");
    }
    return undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadNphiesProductionConfig(
    env: NodeJS.ProcessEnv = process.env,
): NphiesProductionConfig {
    const baseUrl = (env["NPHIES_BASE_URL"] ?? NPHIES_DEFAULT_BASE_URL).replace(/\/+$/, "");
    const clientCertPem = readPem(env["NPHIES_CLIENT_CERT_PEM"], env["NPHIES_CLIENT_CERT_PATH"]);
    const clientKeyPem = readPem(env["NPHIES_CLIENT_KEY_PEM"], env["NPHIES_CLIENT_KEY_PATH"]);
    const caCertPem = readPem(env["NPHIES_CA_CERT_PEM"], env["NPHIES_CA_CERT_PATH"]);
    const passphrase = env["NPHIES_CLIENT_KEY_PASSPHRASE"];
    const sender = env["NPHIES_SENDER_LICENSE_ID"];
    const receiver = env["NPHIES_RECEIVER_LICENSE_ID"];

    return {
        endpointUrl: `${baseUrl}/${NPHIES_PROCESS_MESSAGE_OPERATION}`,
        timeoutMs: parsePositiveInt(env["NPHIES_TIMEOUT_MS"], 30_000),
        ...(clientCertPem !== undefined ? { clientCertPem } : {}),
        ...(clientKeyPem !== undefined ? { clientKeyPem } : {}),
        ...(passphrase !== undefined && passphrase !== "" ? { clientKeyPassphrase: passphrase } : {}),
        ...(caCertPem !== undefined ? { caCertPem } : {}),
        rejectUnauthorized: (env["NPHIES_TLS_REJECT_UNAUTHORIZED"] ?? "true").toLowerCase() !== "false",
        ...(sender !== undefined && sender !== "" ? { senderLicenseId: sender } : {}),
        ...(receiver !== undefined && receiver !== "" ? { receiverLicenseId: receiver } : {}),
    };
}

/* ========================================================================== */
/* Errors                                                                     */
/* ========================================================================== */

export class NphiesProductionError extends Error {
    readonly code: string;
    readonly httpStatus: number | null;
    readonly retryable: boolean;
    readonly responseBody: string | null;

    constructor(
        code: string,
        message: string,
        options: { httpStatus?: number; retryable?: boolean; responseBody?: string } = {},
    ) {
        super(message);
        this.name = "NphiesProductionError";
        this.code = code;
        this.httpStatus = options.httpStatus ?? null;
        this.retryable = options.retryable ?? false;
        this.responseBody = options.responseBody ?? null;
    }
}

function isRetryableStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500;
}

/* ========================================================================== */
/* License overrides                                                          */
/* ========================================================================== */

function applyLicenseOverrides(bundle: FhirBundle, config: NphiesProductionConfig): FhirBundle {
    if (config.senderLicenseId === undefined && config.receiverLicenseId === undefined) {
        return bundle;
    }
    const copy = JSON.parse(JSON.stringify(bundle)) as FhirBundle;
    const header = findResource(copy, "MessageHeader");
    if (header === undefined) {
        return copy;
    }

    if (config.senderLicenseId !== undefined) {
        const id = config.senderLicenseId;
        header.sender = {
            type: "Organization",
            identifier: { system: NPHIES_SYSTEMS.providerLicense, value: id },
        };
        header.source.endpoint = `${NPHIES_SYSTEMS.providerLicense}/${id}`;
        const provider = findOrganizationByType(copy, "prov");
        if (provider !== undefined) {
            provider.identifier = [{ use: "official", system: NPHIES_SYSTEMS.providerLicense, value: id }];
        }
    }

    if (config.receiverLicenseId !== undefined) {
        const id = config.receiverLicenseId;
        header.destination = [
            {
                endpoint: `${NPHIES_SYSTEMS.payerLicense}/${id}`,
                receiver: {
                    type: "Organization",
                    identifier: { system: NPHIES_SYSTEMS.payerLicense, value: id },
                },
            },
        ];
    }
    return copy;
}

/* ========================================================================== */
/* Adapter                                                                    */
/* ========================================================================== */

interface RawHttpResponse {
    status: number;
    text: string;
}

export class NphiesProductionAdapter implements NphiesAdapter {
    readonly mode: NphiesMode = "PRODUCTION";

    private readonly config: NphiesProductionConfig;
    private readonly hooks: NphiesProductionHooks;
    private agent: Agent | null = null;

    constructor(
        config: NphiesProductionConfig = loadNphiesProductionConfig(),
        hooks: NphiesProductionHooks = {},
    ) {
        this.config = config;
        this.hooks = hooks;
    }

    async send(bundle: FhirBundle, context: NphiesDispatchContext): Promise<FhirBundle> {
        if (context.facility.nphiesFacilityId.trim() === "") {
            throw new NphiesProductionError(
                "NPHIES_MISSING_FACILITY_ID",
                "CenterSettings.nphiesFacilityId (NPHIES provider license) is required in PRODUCTION mode",
            );
        }

        let prepared = applyLicenseOverrides(bundle, this.config);
        if (this.hooks.signBundle !== undefined) {
            prepared = await this.hooks.signBundle(prepared, context);
        }

        const body = JSON.stringify(prepared);
        const extraHeaders =
            this.hooks.getAuthHeaders !== undefined ? await this.hooks.getAuthHeaders(context) : {};
        const headers: Record<string, string> = {
            "Content-Type": "application/fhir+json; charset=utf-8",
            Accept: "application/fhir+json",
            "Content-Length": Buffer.byteLength(body).toString(),
            ...extraHeaders,
        };

        const response = await this.post(body, headers);
        return this.parseResponse(response);
    }

    private getAgent(): Agent {
        if (this.agent === null) {
            if (this.config.clientCertPem === undefined || this.config.clientKeyPem === undefined) {
                throw new NphiesProductionError(
                    "NPHIES_MTLS_NOT_CONFIGURED",
                    "mTLS client certificate and key are required in PRODUCTION mode " +
                    "(NPHIES_CLIENT_CERT_PATH / NPHIES_CLIENT_KEY_PATH or *_PEM)",
                );
            }
            this.agent = new Agent({
                cert: this.config.clientCertPem,
                key: this.config.clientKeyPem,
                ...(this.config.clientKeyPassphrase !== undefined
                    ? { passphrase: this.config.clientKeyPassphrase }
                    : {}),
                ...(this.config.caCertPem !== undefined ? { ca: this.config.caCertPem } : {}),
                rejectUnauthorized: this.config.rejectUnauthorized,
                keepAlive: true,
            });
        }
        return this.agent;
    }

    private post(body: string, headers: Record<string, string>): Promise<RawHttpResponse> {
        const url = new URL(this.config.endpointUrl);
        const agent = this.getAgent();

        return new Promise<RawHttpResponse>((resolve, reject) => {
            const req = request(
                {
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port !== "" ? url.port : 443,
                    path: `${url.pathname}${url.search}`,
                    method: "POST",
                    headers,
                    agent,
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => chunks.push(chunk));
                    res.on("end", () =>
                        resolve({
                            status: res.statusCode ?? 0,
                            text: Buffer.concat(chunks).toString("utf8"),
                        }),
                    );
                    res.on("error", (error: Error) =>
                        reject(
                            new NphiesProductionError("NPHIES_NETWORK_ERROR", error.message, { retryable: true }),
                        ),
                    );
                },
            );

            req.setTimeout(this.config.timeoutMs, () => {
                req.destroy(
                    new NphiesProductionError(
                        "NPHIES_TIMEOUT",
                        `NPHIES did not respond within ${this.config.timeoutMs} ms`,
                        { retryable: true },
                    ),
                );
            });
            req.on("error", (error: Error) => {
                reject(
                    error instanceof NphiesProductionError
                        ? error
                        : new NphiesProductionError("NPHIES_NETWORK_ERROR", error.message, { retryable: true }),
                );
            });
            req.write(body);
            req.end();
        });
    }

    private parseResponse(response: RawHttpResponse): FhirBundle {
        let parsed: unknown;
        try {
            parsed = JSON.parse(response.text);
        } catch {
            throw new NphiesProductionError(
                "NPHIES_INVALID_RESPONSE",
                `NPHIES returned a non-JSON response (HTTP ${response.status})`,
                {
                    httpStatus: response.status,
                    retryable: isRetryableStatus(response.status),
                    responseBody: response.text.slice(0, 2000),
                },
            );
        }

        if (isFhirBundle(parsed)) {
            return parsed;
        }
        if (isOperationOutcome(parsed)) {
            return buildOperationOutcomeBundle(parsed.issue, {
                responseCode: response.status >= 500 ? "transient-error" : "fatal-error",
            });
        }
        throw new NphiesProductionError(
            "NPHIES_UNEXPECTED_PAYLOAD",
            `NPHIES returned an unexpected FHIR payload (HTTP ${response.status})`,
            {
                httpStatus: response.status,
                retryable: isRetryableStatus(response.status),
                responseBody: response.text.slice(0, 2000),
            },
        );
    }
}