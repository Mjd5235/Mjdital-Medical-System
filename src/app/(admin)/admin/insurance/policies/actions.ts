"use server";

/**
 * Policies & Tiers — server actions
 * ---------------------------------
 * - Every query is scoped by `organizationId` AND by the clinics that belong to the caller's
 *   organization (tenant isolation, same pattern as the doctors module).
 * - The client may supply the UUID of a new row (`id`). That is what lets the UI stay 100%
 *   optimistic: the temporary row already carries its final id, so follow-up actions on it
 *   (edit / toggle / delete) can be queued without waiting for the server.
 * - `policyNumber` is mandatory, normalised to upper case and validated, because NPHIES uses it as
 *   the official contract identifier.
 * - Uniqueness: a policy number must be unique PER PAYER (DB constraint: provider_id + policy_number).
 *   The server checks it first and answers with a friendly DUPLICATE_POLICY_NUMBER error; the DB
 *   constraint (P2002) remains the final safety net for races.
 * - Duplicating a policy is a UI workflow: the modal opens pre-filled with an empty policy number
 *   and the admin must type a new, unique number. It ends up in `createPolicyAction`.
 * - Activating an expired contract is rejected.
 * - Mutations are written to `audit_logs` (best effort, never blocks the response).
 * - No `revalidatePath` on purpose: the client component owns its data and revalidation would make
 *   every Server Action response heavier and slower.
 */

import { AuditActionType, PolicyCopayType, Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

const MAX_POLICIES = 1000;
const MAX_MONEY = "9999999999.99";
const DUPLICATE_NUMBER_MESSAGE =
    "This policy number is already registered for this payer. Please change it.";

export type PolicyCopayTypeValue = "PERCENTAGE" | "FIXED_AMOUNT";

export interface PolicyActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface PolicyProviderOption {
    id: string;
    clinicId: string;
    nameEn: string;
    nameAr: string;
    logoUrl: string | null;
    isActive: boolean;
}

export interface PolicyRow {
    id: string;
    clinicId: string;
    providerId: string;
    providerNameEn: string;
    providerNameAr: string;
    providerLogoUrl: string | null;
    nameEn: string;
    nameAr: string | null;
    policyNumber: string;
    copayType: PolicyCopayTypeValue;
    /** Percentage (0..100) or fixed SAR amount, depending on `copayType`. */
    copayValue: string;
    /** SAR cap for percentage policies, otherwise null. */
    maxPatientShare: string | null;
    /** ISO date (YYYY-MM-DD) or null. */
    expiryDate: string | null;
    isActive: boolean;
    createdAt: string;
}

export interface GetPoliciesData {
    policies: PolicyRow[];
    providers: PolicyProviderOption[];
}

export interface PolicyInput {
    providerId: string;
    nameEn: string;
    /** `undefined` keeps the stored value on update, `null`/"" clears it. */
    nameAr?: string | null;
    policyNumber: string;
    copayType: PolicyCopayTypeValue;
    copayValue: string | number;
    maxPatientShare?: string | number | null;
    /** YYYY-MM-DD, empty/null for "no expiry recorded". */
    expiryDate?: string | null;
    isActive: boolean;
}

export interface CreatePolicyInput extends PolicyInput {
    /** Optional client-generated UUID so the optimistic row keeps the same id. */
    id?: string;
}

export interface UpdatePolicyInput extends PolicyInput {
    policyId: string;
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLICY_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,59}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const policyInclude = {
    provider: {
        select: {
            id: true,
            nameEn: true,
            nameAr: true,
            logoUrl: true,
        },
    },
} satisfies Prisma.InsurancePolicyInclude;

type PolicyWithProvider = Prisma.InsurancePolicyGetPayload<{
    include: typeof policyInclude;
}>;

type PortalSession = Awaited<ReturnType<typeof requirePortalSession>>;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function invalid<T>(
    error: string,
    code = "INVALID_INPUT",
): PolicyActionResult<T> {
    return { success: false, error, code };
}

function unauthorized<T>(): PolicyActionResult<T> {
    return invalid(
        "Your session has expired. Sign in and try again.",
        "UNAUTHORIZED",
    );
}

function databaseError<T>(
    action: string,
    error: unknown,
): PolicyActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return invalid(DUPLICATE_NUMBER_MESSAGE, "DUPLICATE_POLICY_NUMBER");
            case "P2003":
                return invalid(
                    "This policy is linked to other records or a selected payer is no longer available.",
                    "INVALID_RELATION",
                );
            case "P2025":
                return invalid(
                    "The requested record could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
        }
    }

    return invalid(
        "The operation could not be completed. Please try again.",
        "DATABASE_ERROR",
    );
}

async function authorize(): Promise<PortalSession | null> {
    try {
        return await requirePortalSession("admin");
    } catch (error) {
        console.error("[policies] Authorization failed", error);
        return null;
    }
}

function actorIdOf(session: PortalSession): string | null {
    const id = (session as unknown as { userId?: string }).userId;

    return typeof id === "string" && validUuid(id) ? id : null;
}

async function getOrganizationClinicIds(
    organizationId: string,
): Promise<string[]> {
    const clinics = await prisma.clinic.findMany({
        where: { organizationId },
        select: { id: true },
    });

    return clinics.map((clinic) => clinic.id);
}

/** Today's calendar date in Riyadh as YYYY-MM-DD (contracts expire on a calendar date). */
function todayInRiyadh(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function isoDate(date: Date | null): string | null {
    return date ? date.toISOString().slice(0, 10) : null;
}

function isExpiredDate(date: Date | null): boolean {
    const iso = isoDate(date);

    return iso !== null && iso < todayInRiyadh();
}

function parseDecimal(
    value: unknown,
    max: Prisma.Decimal.Value,
): Prisma.Decimal | null {
    const normalized = String(value ?? "").trim();

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) return null;

    try {
        const decimal = new Prisma.Decimal(normalized);

        if (!decimal.isFinite() || decimal.isNegative() || decimal.greaterThan(max)) {
            return null;
        }

        return decimal.toDecimalPlaces(2);
    } catch {
        return null;
    }
}

function parseDateOnly(
    value: unknown,
): { ok: true; date: Date | null } | { ok: false } {
    const text = cleanText(value);

    if (!text) return { ok: true, date: null };
    if (!DATE_PATTERN.test(text)) return { ok: false };

    const date = new Date(`${text}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
        return { ok: false };
    }

    const year = date.getUTCFullYear();

    if (year < 2000 || year > 2100) return { ok: false };

    return { ok: true, date };
}

function mapPolicy(policy: PolicyWithProvider): PolicyRow {
    return {
        id: policy.id,
        clinicId: policy.clinicId,
        providerId: policy.providerId,
        providerNameEn: policy.provider.nameEn,
        providerNameAr: policy.provider.nameAr,
        providerLogoUrl: policy.provider.logoUrl,
        nameEn: policy.nameEn,
        nameAr: policy.nameAr,
        policyNumber: policy.policyNumber,
        copayType: policy.copayType,
        copayValue: policy.copayValue.toString(),
        maxPatientShare:
            policy.maxPatientShare === null
                ? null
                : policy.maxPatientShare.toString(),
        expiryDate: isoDate(policy.expiryDate),
        isActive: policy.isActive,
        createdAt: policy.createdAt.toISOString(),
    };
}

type ParsedPolicyInput = {
    providerId: string;
    nameEn: string;
    /** undefined = leave untouched (update only). */
    nameAr: string | null | undefined;
    policyNumber: string;
    copayType: PolicyCopayType;
    copayValue: Prisma.Decimal;
    maxPatientShare: Prisma.Decimal | null;
    expiryDate: Date | null;
    isActive: boolean;
};

function parsePolicyInput(
    input: PolicyInput,
):
    | { data: ParsedPolicyInput }
    | { error: string; code: string } {
    if (!input || typeof input !== "object") {
        return { error: "Invalid request.", code: "INVALID_INPUT" };
    }

    const providerId = cleanText(input.providerId);

    if (!validUuid(providerId)) {
        return { error: "Select a valid insurance payer.", code: "INVALID_PAYER" };
    }

    const nameEn = cleanText(input.nameEn).replace(/\s+/g, " ");

    if (nameEn.length < 2 || nameEn.length > 120 || /[<>]/.test(nameEn)) {
        return {
            error: "Enter a valid plan / tier name (2–120 characters).",
            code: "INVALID_NAME",
        };
    }

    let nameAr: string | null | undefined;

    if (input.nameAr === undefined) {
        nameAr = undefined;
    } else {
        const text = cleanText(input.nameAr).replace(/\s+/g, " ");

        if (text.length > 120 || /[<>]/.test(text)) {
            return { error: "The Arabic plan name is invalid.", code: "INVALID_NAME_AR" };
        }

        nameAr = text.length > 0 ? text : null;
    }

    const policyNumber = cleanText(input.policyNumber).toUpperCase();

    if (!policyNumber) {
        return {
            error: "The policy / contract number is required.",
            code: "POLICY_NUMBER_REQUIRED",
        };
    }

    if (!POLICY_NUMBER_PATTERN.test(policyNumber)) {
        return {
            error:
                "Enter a valid policy / contract number (3–60 characters: letters, digits, . _ / -).",
            code: "INVALID_POLICY_NUMBER",
        };
    }

    if (input.copayType !== "PERCENTAGE" && input.copayType !== "FIXED_AMOUNT") {
        return { error: "Select a valid co-pay type.", code: "INVALID_COPAY_TYPE" };
    }

    const copayType =
        input.copayType === "PERCENTAGE"
            ? PolicyCopayType.PERCENTAGE
            : PolicyCopayType.FIXED_AMOUNT;

    const copayValue = parseDecimal(
        input.copayValue,
        copayType === PolicyCopayType.PERCENTAGE ? 100 : MAX_MONEY,
    );

    if (!copayValue) {
        return {
            error:
                copayType === PolicyCopayType.PERCENTAGE
                    ? "Co-pay percentage must be between 0 and 100."
                    : "Enter a valid fixed co-pay amount in SAR.",
            code: "INVALID_COPAY_VALUE",
        };
    }

    let maxPatientShare: Prisma.Decimal | null = null;

    if (copayType === PolicyCopayType.PERCENTAGE) {
        const rawMax = String(input.maxPatientShare ?? "").trim();

        if (rawMax.length > 0) {
            maxPatientShare = parseDecimal(rawMax, MAX_MONEY);

            if (!maxPatientShare || maxPatientShare.isZero()) {
                return {
                    error: "Maximum patient share must be a valid SAR amount greater than 0.",
                    code: "INVALID_MAX_SHARE",
                };
            }
        }
    }

    const expiry = parseDateOnly(input.expiryDate);

    if (!expiry.ok) {
        return { error: "Enter a valid contract expiry date.", code: "INVALID_EXPIRY" };
    }

    if (typeof input.isActive !== "boolean") {
        return { error: "The requested status is invalid.", code: "INVALID_STATUS" };
    }

    if (input.isActive && isExpiredDate(expiry.date)) {
        return {
            error: "This contract has expired. Extend the expiry date before activating it.",
            code: "POLICY_EXPIRED",
        };
    }

    return {
        data: {
            providerId,
            nameEn,
            nameAr,
            policyNumber,
            copayType,
            copayValue,
            maxPatientShare,
            expiryDate: expiry.date,
            isActive: input.isActive,
        },
    };
}

async function findProvider(
    organizationId: string,
    clinicIds: string[],
    providerId: string,
) {
    if (clinicIds.length === 0) return null;

    return prisma.insuranceProvider.findFirst({
        where: {
            id: providerId,
            organizationId,
            clinicId: { in: clinicIds },
        },
        select: { id: true, clinicId: true, isActive: true },
    });
}

/** True when another policy of the same payer already uses this policy number. */
async function policyNumberTaken(
    organizationId: string,
    providerId: string,
    policyNumber: string,
    excludeId?: string,
): Promise<boolean> {
    const found = await prisma.insurancePolicy.findFirst({
        where: {
            organizationId,
            providerId,
            policyNumber,
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
    });

    return found !== null;
}

/** Best-effort audit trail; a logging failure must never fail the user's action. */
async function writeAudit(
    session: PortalSession,
    args: {
        clinicId: string;
        actionType: AuditActionType;
        recordId: string;
        metadata: Prisma.InputJsonValue;
    },
): Promise<void> {
    const userId = actorIdOf(session);

    if (!userId) return;

    try {
        let ipAddress: string | null = null;
        let userAgent: string | null = null;

        try {
            const requestHeaders = await headers();

            ipAddress =
                requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
            userAgent = requestHeaders.get("user-agent");
        } catch {
            // headers() is unavailable outside a request scope — ignore.
        }

        await prisma.auditLog.create({
            data: {
                organizationId: session.organizationId,
                clinicId: args.clinicId,
                userId,
                actionType: args.actionType,
                targetTable: "insurance_policies",
                recordId: args.recordId,
                ipAddress,
                userAgent,
                metadata: args.metadata,
            },
        });
    } catch (error) {
        console.error("[policies] audit log failed", error);
    }
}

/* ------------------------------------------------------------------ */
/* read                                                                */
/* ------------------------------------------------------------------ */

export async function getPoliciesAction(): Promise<
    PolicyActionResult<GetPoliciesData>
> {
    const session = await authorize();

    if (!session) return unauthorized();

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return { success: true, data: { policies: [], providers: [] } };
        }

        const [providers, policies] = await Promise.all([
            prisma.insuranceProvider.findMany({
                where: {
                    organizationId: session.organizationId,
                    clinicId: { in: clinicIds },
                },
                select: {
                    id: true,
                    clinicId: true,
                    nameEn: true,
                    nameAr: true,
                    logoUrl: true,
                    isActive: true,
                },
                orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
            }),
            prisma.insurancePolicy.findMany({
                where: {
                    organizationId: session.organizationId,
                    clinicId: { in: clinicIds },
                },
                include: policyInclude,
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                take: MAX_POLICIES,
            }),
        ]);

        return {
            success: true,
            data: {
                policies: policies.map(mapPolicy),
                providers,
            },
        };
    } catch (error) {
        console.error("[getPoliciesAction]", error);

        return invalid(
            "Unable to load policies. Please refresh the page and try again.",
            "FETCH_POLICIES_FAILED",
        );
    }
}

/* ------------------------------------------------------------------ */
/* create (also used by the "Duplicate" workflow)                      */
/* ------------------------------------------------------------------ */

export async function createPolicyAction(
    input: CreatePolicyInput,
): Promise<PolicyActionResult<{ policy: PolicyRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const parsed = parsePolicyInput(input);

    if (!("data" in parsed)) return invalid(parsed.error, parsed.code);

    const requestedId = cleanText(input.id);

    if (requestedId && !validUuid(requestedId)) {
        return invalid("The policy identifier is invalid.", "INVALID_ID");
    }

    const data = parsed.data;

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);
        const provider = await findProvider(
            session.organizationId,
            clinicIds,
            data.providerId,
        );

        if (!provider) {
            return invalid(
                "The selected payer was not found in your organization.",
                "PAYER_NOT_FOUND",
            );
        }

        if (!provider.isActive) {
            return invalid("The selected payer is inactive.", "PAYER_INACTIVE");
        }

        if (
            await policyNumberTaken(
                session.organizationId,
                provider.id,
                data.policyNumber,
            )
        ) {
            return invalid(DUPLICATE_NUMBER_MESSAGE, "DUPLICATE_POLICY_NUMBER");
        }

        const created = await prisma.insurancePolicy.create({
            data: {
                ...(requestedId ? { id: requestedId } : {}),
                organizationId: session.organizationId,
                clinicId: provider.clinicId,
                providerId: provider.id,
                nameEn: data.nameEn,
                nameAr: data.nameAr ?? null,
                policyNumber: data.policyNumber,
                copayType: data.copayType,
                copayValue: data.copayValue,
                maxPatientShare: data.maxPatientShare,
                expiryDate: data.expiryDate,
                isActive: data.isActive,
            },
            include: policyInclude,
        });

        void writeAudit(session, {
            clinicId: created.clinicId,
            actionType: AuditActionType.CREATE,
            recordId: created.id,
            metadata: {
                policyNumber: created.policyNumber,
                providerId: created.providerId,
                copayType: created.copayType,
                isActive: created.isActive,
            },
        });

        return { success: true, data: { policy: mapPolicy(created) } };
    } catch (error) {
        return databaseError("createPolicyAction", error);
    }
}

/* ------------------------------------------------------------------ */
/* update                                                              */
/* ------------------------------------------------------------------ */

export async function updatePolicyAction(
    input: UpdatePolicyInput,
): Promise<PolicyActionResult<{ policy: PolicyRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const policyId = cleanText(input?.policyId);

    if (!validUuid(policyId)) {
        return invalid("The selected policy is invalid.", "INVALID_POLICY");
    }

    const parsed = parsePolicyInput(input);

    if (!("data" in parsed)) return invalid(parsed.error, parsed.code);

    const data = parsed.data;

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const existing = await prisma.insurancePolicy.findFirst({
            where: {
                id: policyId,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true, providerId: true },
        });

        if (!existing) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const provider = await findProvider(
            session.organizationId,
            clinicIds,
            data.providerId,
        );

        if (!provider) {
            return invalid(
                "The selected payer was not found in your organization.",
                "PAYER_NOT_FOUND",
            );
        }

        if (!provider.isActive && provider.id !== existing.providerId) {
            return invalid("The selected payer is inactive.", "PAYER_INACTIVE");
        }

        if (
            await policyNumberTaken(
                session.organizationId,
                provider.id,
                data.policyNumber,
                existing.id,
            )
        ) {
            return invalid(DUPLICATE_NUMBER_MESSAGE, "DUPLICATE_POLICY_NUMBER");
        }

        const updated = await prisma.insurancePolicy.update({
            where: {
                id: existing.id,
                organizationId: session.organizationId,
            },
            data: {
                clinicId: provider.clinicId,
                providerId: provider.id,
                nameEn: data.nameEn,
                ...(data.nameAr !== undefined ? { nameAr: data.nameAr } : {}),
                policyNumber: data.policyNumber,
                copayType: data.copayType,
                copayValue: data.copayValue,
                maxPatientShare: data.maxPatientShare,
                expiryDate: data.expiryDate,
                isActive: data.isActive,
            },
            include: policyInclude,
        });

        void writeAudit(session, {
            clinicId: updated.clinicId,
            actionType: AuditActionType.UPDATE,
            recordId: updated.id,
            metadata: {
                policyNumber: updated.policyNumber,
                providerId: updated.providerId,
                copayType: updated.copayType,
                isActive: updated.isActive,
            },
        });

        return { success: true, data: { policy: mapPolicy(updated) } };
    } catch (error) {
        return databaseError("updatePolicyAction", error);
    }
}

/* ------------------------------------------------------------------ */
/* toggle status                                                       */
/* ------------------------------------------------------------------ */

export async function setPolicyActiveStatusAction(
    policyId: string,
    isActive: boolean,
): Promise<PolicyActionResult<{ policy: PolicyRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(policyId);

    if (!validUuid(id)) {
        return invalid("The selected policy is invalid.", "INVALID_POLICY");
    }

    if (typeof isActive !== "boolean") {
        return invalid("The requested status is invalid.", "INVALID_STATUS");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const existing = await prisma.insurancePolicy.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true, expiryDate: true },
        });

        if (!existing) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        if (isActive && isExpiredDate(existing.expiryDate)) {
            return invalid(
                "This contract has expired. Extend the expiry date before activating it.",
                "POLICY_EXPIRED",
            );
        }

        const updated = await prisma.insurancePolicy.update({
            where: {
                id: existing.id,
                organizationId: session.organizationId,
            },
            data: { isActive },
            include: policyInclude,
        });

        void writeAudit(session, {
            clinicId: updated.clinicId,
            actionType: AuditActionType.UPDATE,
            recordId: updated.id,
            metadata: {
                policyNumber: updated.policyNumber,
                change: "status",
                isActive: updated.isActive,
            },
        });

        return { success: true, data: { policy: mapPolicy(updated) } };
    } catch (error) {
        return databaseError("setPolicyActiveStatusAction", error);
    }
}

/* ------------------------------------------------------------------ */
/* delete                                                              */
/* ------------------------------------------------------------------ */

export async function deletePolicyAction(
    policyId: string,
): Promise<PolicyActionResult<{ id: string }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(policyId);

    if (!validUuid(id)) {
        return invalid("The selected policy is invalid.", "INVALID_POLICY");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const existing = await prisma.insurancePolicy.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true, policyNumber: true },
        });

        if (!existing) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const linkedPatients = await prisma.patient.count({
            where: {
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
                insurancePolicyId: existing.id,
            },
        });

        if (linkedPatients > 0) {
            return invalid(
                "This policy is assigned to patients. Deactivate it instead of deleting it.",
                "POLICY_IN_USE",
            );
        }

        await prisma.insurancePolicy.delete({
            where: {
                id: existing.id,
                organizationId: session.organizationId,
            },
        });

        void writeAudit(session, {
            clinicId: existing.clinicId,
            actionType: AuditActionType.DELETE,
            recordId: existing.id,
            metadata: { policyNumber: existing.policyNumber },
        });

        return { success: true, data: { id: existing.id } };
    } catch (error) {
        return databaseError("deletePolicyAction", error);
    }
}