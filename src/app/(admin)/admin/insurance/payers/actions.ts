"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

/**
 * Location: app/(admin)/admin/insurance/payers/actions.ts
 * (same folder as page.tsx — adjust only the folder, not the imports below).
 *
 * Tenant isolation rules used by every action in this file:
 *  1. The organization always comes from the authenticated portal session,
 *     never from client input.
 *  2. Every query is filtered by `organizationId` AND by `clinicId IN (clinics of
 *     that organization)` so the tenant middleware is always satisfied.
 *  3. Records are re-read with the same scope before being mutated.
 *
 * Required migration for the new columns:
 *   npx prisma migrate dev --name add_insurance_payer_nphies_tax_fields
 */

const MANAGEMENT_PATH = "/admin/insurance/payers";
const DEFAULT_PAGE_SIZE = 4;
const MAX_PAGE_SIZE = 100;

/** ZATCA VAT numbers: 15 digits, starting and ending with 3. */
const TAX_NUMBER_PATTERN = /^3\d{13}3$/;
const NPHIES_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const COMPANY_NAME_PATTERN =
    /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.,&'’()\-/]*$/u;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PayerField =
    | "nameAr"
    | "nameEn"
    | "nphiesPayerId"
    | "taxNumber";

export type PayerFieldErrors = Partial<Record<PayerField, string>>;

export interface PayerActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    fieldErrors?: PayerFieldErrors;
}

export interface PayerRow {
    id: string;
    nameAr: string;
    nameEn: string;
    nphiesPayerId: string | null;
    taxNumber: string | null;
    logoUrl: string | null;
    isActive: boolean;
    patientCount: number;
    createdAt: string;
}

export type PayerStatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export interface GetPayersInput {
    search?: string;
    status?: PayerStatusFilter;
    page?: number;
    pageSize?: number;
}

export interface GetPayersData {
    payers: PayerRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface PayerFormInput {
    nameAr: string;
    nameEn: string;
    nphiesPayerId: string;
    taxNumber: string;
    isActive?: boolean;
}

export interface UpdatePayerInput extends PayerFormInput {
    payerId: string;
}

const payerSelect = {
    id: true,
    clinicId: true,
    nameAr: true,
    nameEn: true,
    nphiesPayerId: true,
    taxNumber: true,
    logoUrl: true,
    isActive: true,
    createdAt: true,
    _count: {
        select: {
            patients: true,
        },
    },
} satisfies Prisma.InsuranceProviderSelect;

type PayerRecord = Prisma.InsuranceProviderGetPayload<{
    select: typeof payerSelect;
}>;

interface ParsedPayer {
    nameAr: string;
    nameEn: string;
    nphiesPayerId: string;
    taxNumber: string;
    isActive: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

/** Converts Arabic-Indic and Persian digits to Latin digits. */
function normalizeDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (digit) =>
            String(digit.charCodeAt(0) - 0x0660),
        )
        .replace(/[\u06F0-\u06F9]/g, (digit) =>
            String(digit.charCodeAt(0) - 0x06f0),
        );
}

function failure<T>(
    error: string,
    code = "INVALID_INPUT",
    fieldErrors?: PayerFieldErrors,
): PayerActionResult<T> {
    return { success: false, error, code, ...(fieldErrors ? { fieldErrors } : {}) };
}

function mapPayer(record: PayerRecord): PayerRow {
    return {
        id: record.id,
        nameAr: record.nameAr,
        nameEn: record.nameEn,
        nphiesPayerId: record.nphiesPayerId,
        taxNumber: record.taxNumber,
        logoUrl: record.logoUrl,
        isActive: record.isActive,
        patientCount: record._count.patients,
        createdAt: record.createdAt.toISOString(),
    };
}

async function authorize() {
    try {
        return await requirePortalSession("admin");
    } catch (error) {
        console.error("[payers] Authorization failed", error);
        return null;
    }
}

type PortalSession = NonNullable<Awaited<ReturnType<typeof authorize>>>;

function unauthorized<T>(): PayerActionResult<T> {
    return failure(
        "Your session has expired. Sign in and try again.",
        "UNAUTHORIZED",
    );
}

function notFound<T>(): PayerActionResult<T> {
    return failure(
        "The requested payer could not be found. Refresh and try again.",
        "RECORD_NOT_FOUND",
    );
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

/**
 * InsuranceProvider rows are stored against a clinic of the organization
 * (required by the schema), while uniqueness is enforced per organization.
 * New payers are attached to the session clinic when available, otherwise to
 * the organization's first active clinic.
 */
async function resolveWriteClinicId(
    session: PortalSession,
): Promise<string | null> {
    const clinics = await prisma.clinic.findMany({
        where: { organizationId: session.organizationId },
        select: { id: true, isActive: true },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });

    if (clinics.length === 0) return null;

    const sessionClinicId = (session as unknown as { clinicId?: string })
        .clinicId;

    const preferred = clinics.find(
        (clinic) => clinic.id === sessionClinicId && clinic.isActive,
    );

    if (preferred) return preferred.id;

    const firstActive = clinics.find((clinic) => clinic.isActive);

    return (firstActive ?? clinics[0]).id;
}

function parsePayerInput(
    input: unknown,
):
    | { ok: true; value: ParsedPayer }
    | { ok: false; fieldErrors: PayerFieldErrors } {
    const source = (
        input && typeof input === "object" ? input : {}
    ) as Partial<Record<keyof PayerFormInput, unknown>>;

    const fieldErrors: PayerFieldErrors = {};

    let nameAr = cleanText(source.nameAr).slice(0, 120);
    let nameEn = cleanText(source.nameEn).slice(0, 120);

    // The schema requires both names. When only one is provided the other one
    // falls back to it, so a payer can be created with a single name.
    if (!nameAr && !nameEn) {
        fieldErrors.nameEn = "Enter the insurance company name.";
        fieldErrors.nameAr = "Enter the insurance company name.";
    } else {
        if (!nameAr) nameAr = nameEn;
        if (!nameEn) nameEn = nameAr;

        if (!COMPANY_NAME_PATTERN.test(nameAr)) {
            fieldErrors.nameAr = "The Arabic name contains invalid characters.";
        }

        if (!COMPANY_NAME_PATTERN.test(nameEn)) {
            fieldErrors.nameEn = "The English name contains invalid characters.";
        }
    }

    const nphiesPayerId = cleanText(source.nphiesPayerId)
        .replace(/\s+/g, "")
        .toUpperCase();

    if (!nphiesPayerId) {
        fieldErrors.nphiesPayerId = "The NPHIES Payer ID is required.";
    } else if (!NPHIES_ID_PATTERN.test(nphiesPayerId)) {
        fieldErrors.nphiesPayerId =
            "Use 2–40 letters, digits, dots, dashes or underscores (e.g. NPH-BUPA-01).";
    }

    const taxNumber = normalizeDigits(cleanText(source.taxNumber)).replace(
        /[\s-]/g,
        "",
    );

    if (!taxNumber) {
        fieldErrors.taxNumber = "The tax registration number is required.";
    } else if (!TAX_NUMBER_PATTERN.test(taxNumber)) {
        fieldErrors.taxNumber =
            "Enter a valid 15-digit ZATCA number starting and ending with 3.";
    }

    let isActive = true;

    if (source.isActive !== undefined) {
        if (typeof source.isActive !== "boolean") {
            return {
                ok: false,
                fieldErrors: { ...fieldErrors },
            };
        }

        isActive = source.isActive;
    }

    if (Object.keys(fieldErrors).length > 0) {
        return { ok: false, fieldErrors };
    }

    return {
        ok: true,
        value: { nameAr, nameEn, nphiesPayerId, taxNumber, isActive },
    };
}

async function findConflicts(
    organizationId: string,
    clinicIds: string[],
    value: ParsedPayer,
    excludeId?: string,
): Promise<PayerFieldErrors> {
    const rows = await prisma.insuranceProvider.findMany({
        where: {
            organizationId,
            clinicId: { in: clinicIds },
            ...(excludeId ? { id: { not: excludeId } } : {}),
            OR: [
                { nameEn: { equals: value.nameEn, mode: "insensitive" } },
                { nphiesPayerId: value.nphiesPayerId },
                { taxNumber: value.taxNumber },
            ],
        },
        select: {
            nameEn: true,
            nphiesPayerId: true,
            taxNumber: true,
        },
    });

    const errors: PayerFieldErrors = {};

    for (const row of rows) {
        if (row.nameEn.toLowerCase() === value.nameEn.toLowerCase()) {
            errors.nameEn = "A payer with this English name already exists.";
        }

        if (row.nphiesPayerId === value.nphiesPayerId) {
            errors.nphiesPayerId = "This NPHIES Payer ID is already registered.";
        }

        if (row.taxNumber === value.taxNumber) {
            errors.taxNumber =
                "This tax registration number is already registered.";
        }
    }

    return errors;
}

function duplicateFieldErrors(
    error: Prisma.PrismaClientKnownRequestError,
): PayerFieldErrors {
    const target = error.meta?.target;
    const text = Array.isArray(target)
        ? target.join(",")
        : typeof target === "string"
            ? target
            : "";

    if (/nphies/i.test(text)) {
        return { nphiesPayerId: "This NPHIES Payer ID is already registered." };
    }

    if (/tax/i.test(text)) {
        return {
            taxNumber: "This tax registration number is already registered.",
        };
    }

    return { nameEn: "A payer with this English name already exists." };
}

function databaseError<T>(action: string, error: unknown): PayerActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002": {
                const fieldErrors = duplicateFieldErrors(error);

                return failure(
                    Object.values(fieldErrors)[0] ??
                    "This payer is already registered.",
                    "DUPLICATE_RECORD",
                    fieldErrors,
                );
            }
            case "P2003":
                return failure(
                    "This payer is still referenced by other records.",
                    "HAS_RELATED_RECORDS",
                );
            case "P2025":
                return notFound();
        }
    }

    return failure(
        "The operation could not be completed. Please try again.",
        "DATABASE_ERROR",
    );
}

/* -------------------------------------------------------------------------- */
/* Fetch                                                                      */
/* -------------------------------------------------------------------------- */

export async function getPayersAction(
    input: GetPayersInput = {},
): Promise<PayerActionResult<GetPayersData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    try {
        const requestedPage =
            Number.isInteger(input.page) && Number(input.page) > 0
                ? Number(input.page)
                : 1;

        const pageSize =
            Number.isInteger(input.pageSize) &&
                Number(input.pageSize) >= 1 &&
                Number(input.pageSize) <= MAX_PAGE_SIZE
                ? Number(input.pageSize)
                : DEFAULT_PAGE_SIZE;

        const search = cleanText(input.search).slice(0, 120);
        const status: PayerStatusFilter =
            input.status === "ACTIVE" || input.status === "INACTIVE"
                ? input.status
                : "ALL";

        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) {
            return {
                success: true,
                data: {
                    payers: [],
                    total: 0,
                    page: 1,
                    pageSize,
                    totalPages: 0,
                },
            };
        }

        const where: Prisma.InsuranceProviderWhereInput = {
            organizationId: session.organizationId,
            clinicId: { in: clinicIds },
            ...(status === "ACTIVE" ? { isActive: true } : {}),
            ...(status === "INACTIVE" ? { isActive: false } : {}),
            ...(search
                ? {
                    OR: [
                        { nameEn: { contains: search, mode: "insensitive" } },
                        { nameAr: { contains: search, mode: "insensitive" } },
                        {
                            nphiesPayerId: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                        { taxNumber: { contains: normalizeDigits(search) } },
                    ],
                }
                : {}),
        };

        const total = await prisma.insuranceProvider.count({ where });
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(requestedPage, Math.max(1, totalPages));

        const rows =
            total === 0
                ? []
                : await prisma.insuranceProvider.findMany({
                    where,
                    select: payerSelect,
                    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                });

        return {
            success: true,
            data: {
                payers: rows.map(mapPayer),
                total,
                page,
                pageSize,
                totalPages,
            },
        };
    } catch (error) {
        console.error("[getPayersAction]", error);

        return failure(
            "Unable to load insurance payers. Please refresh the page and try again.",
            "FETCH_PAYERS_FAILED",
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createPayerAction(
    input: PayerFormInput,
): Promise<PayerActionResult<{ payer: PayerRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const parsed = parsePayerInput(input);

    if (!parsed.ok) {
        return failure(
            Object.values(parsed.fieldErrors)[0] ??
            "Review the highlighted fields and try again.",
            "VALIDATION_FAILED",
            parsed.fieldErrors,
        );
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        const clinicId = await resolveWriteClinicId(session);

        if (!clinicId || clinicIds.length === 0) {
            return failure(
                "Create at least one clinic before adding insurance payers.",
                "NO_CLINIC_AVAILABLE",
            );
        }

        const conflicts = await findConflicts(
            session.organizationId,
            clinicIds,
            parsed.value,
        );

        if (Object.keys(conflicts).length > 0) {
            return failure(
                Object.values(conflicts)[0] ?? "This payer already exists.",
                "DUPLICATE_RECORD",
                conflicts,
            );
        }

        const created = await prisma.insuranceProvider.create({
            data: {
                organizationId: session.organizationId,
                clinicId,
                nameAr: parsed.value.nameAr,
                nameEn: parsed.value.nameEn,
                nphiesPayerId: parsed.value.nphiesPayerId,
                taxNumber: parsed.value.taxNumber,
                isActive: parsed.value.isActive,
            },
            select: payerSelect,
        });

        revalidatePath(MANAGEMENT_PATH);

        return { success: true, data: { payer: mapPayer(created) } };
    } catch (error) {
        return databaseError("createPayerAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

export async function updatePayerAction(
    input: UpdatePayerInput,
): Promise<PayerActionResult<{ payer: PayerRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const payerId = cleanText(input?.payerId);

    if (!validUuid(payerId)) {
        return failure("The selected payer is invalid.", "INVALID_PAYER");
    }

    const parsed = parsePayerInput(input);

    if (!parsed.ok) {
        return failure(
            Object.values(parsed.fieldErrors)[0] ??
            "Review the highlighted fields and try again.",
            "VALIDATION_FAILED",
            parsed.fieldErrors,
        );
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) return notFound();

        const existing = await prisma.insuranceProvider.findFirst({
            where: {
                id: payerId,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true },
        });

        if (!existing) return notFound();

        const conflicts = await findConflicts(
            session.organizationId,
            clinicIds,
            parsed.value,
            existing.id,
        );

        if (Object.keys(conflicts).length > 0) {
            return failure(
                Object.values(conflicts)[0] ?? "This payer already exists.",
                "DUPLICATE_RECORD",
                conflicts,
            );
        }

        const updated = await prisma.insuranceProvider.update({
            where: {
                id: existing.id,
                organizationId: session.organizationId,
                clinicId: existing.clinicId,
            },
            data: {
                nameAr: parsed.value.nameAr,
                nameEn: parsed.value.nameEn,
                nphiesPayerId: parsed.value.nphiesPayerId,
                taxNumber: parsed.value.taxNumber,
                ...(input.isActive !== undefined
                    ? { isActive: parsed.value.isActive }
                    : {}),
            },
            select: payerSelect,
        });

        revalidatePath(MANAGEMENT_PATH);

        return { success: true, data: { payer: mapPayer(updated) } };
    } catch (error) {
        return databaseError("updatePayerAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/* Toggle status                                                              */
/* -------------------------------------------------------------------------- */

export async function setPayerActiveStatusAction(
    payerId: string,
    isActive: boolean,
): Promise<PayerActionResult<{ payer: PayerRow }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(payerId);

    if (!validUuid(id)) {
        return failure("The selected payer is invalid.", "INVALID_PAYER");
    }

    if (typeof isActive !== "boolean") {
        return failure("The requested status is invalid.", "INVALID_STATUS");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) return notFound();

        const existing = await prisma.insuranceProvider.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true },
        });

        if (!existing) return notFound();

        const updated = await prisma.insuranceProvider.update({
            where: {
                id: existing.id,
                organizationId: session.organizationId,
                clinicId: existing.clinicId,
            },
            data: { isActive },
            select: payerSelect,
        });

        revalidatePath(MANAGEMENT_PATH);

        return { success: true, data: { payer: mapPayer(updated) } };
    } catch (error) {
        return databaseError("setPayerActiveStatusAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deletePayerAction(
    payerId: string,
): Promise<PayerActionResult<{ id: string }>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(payerId);

    if (!validUuid(id)) {
        return failure("The selected payer is invalid.", "INVALID_PAYER");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) return notFound();

        const result = await prisma.$transaction(
            async (tx) => {
                const payer = await tx.insuranceProvider.findFirst({
                    where: {
                        id,
                        organizationId: session.organizationId,
                        clinicId: { in: clinicIds },
                    },
                    select: { id: true, clinicId: true },
                });

                if (!payer) {
                    return { status: "not-found" as const };
                }

                // Patients reference payers with ON DELETE SET NULL, which would
                // silently strip their insurance. Block deletion instead.
                const patientCount = await tx.patient.count({
                    where: {
                        organizationId: session.organizationId,
                        clinicId: { in: clinicIds },
                        insuranceProviderId: payer.id,
                    },
                });

                if (patientCount > 0) {
                    return {
                        status: "has-patients" as const,
                        patientCount,
                    };
                }

                await tx.insuranceProvider.delete({
                    where: {
                        id: payer.id,
                        organizationId: session.organizationId,
                        clinicId: payer.clinicId,
                    },
                });

                return { status: "deleted" as const, id: payer.id };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (result.status === "not-found") return notFound();

        if (result.status === "has-patients") {
            return failure(
                `This payer is assigned to ${result.patientCount} patient${result.patientCount === 1 ? "" : "s"
                } and cannot be deleted. Deactivate it instead.`,
                "HAS_PATIENTS",
            );
        }

        revalidatePath(MANAGEMENT_PATH);

        return { success: true, data: { id: result.id } };
    } catch (error) {
        return databaseError("deletePayerAction", error);
    }
}