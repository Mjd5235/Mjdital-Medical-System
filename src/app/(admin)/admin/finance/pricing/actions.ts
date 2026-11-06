"use server";

/**
 * Pricing & Taxes — Server Actions
 * --------------------------------
 * Tenant isolation
 *   - Every query is scoped by `session.organizationId` (and `clinicId` where the model has it).
 *   - Contract prices can only reference a service and a policy that belong to the SAME clinic and
 *     organization as the session, and the policy/payer must still be active and not expired.
 *
 * ZATCA / medical-tax compliance
 *   - The VAT rate is NEVER accepted from the client. The client only sends a category
 *     (STANDARD | CITIZEN_MEDICAL_EXEMPT) and the server derives 15% / 0%.
 *   - The VAT-inclusive price is recomputed on the server with decimal arithmetic
 *     (ROUND_HALF_UP, 2 dp), so stored amounts can never drift from client-side previews.
 *   - Every create/update/toggle/delete writes an AuditLog entry with before/after amounts.
 *   - Issued invoices keep their own amounts, so changing or deleting a price never rewrites history.
 *
 * Performance
 *   - Actions return the minimal fresh data and do NOT call revalidatePath: the client component
 *     owns its data (optimistic UI) and a revalidation would make each action response heavier.
 */

import { AuditActionType, Prisma, VatCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type PriceListType = "CASH" | "INSURANCE";
export type VatCategoryValue = "STANDARD" | "CITIZEN_MEDICAL_EXEMPT";

export interface PricingActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface PricingClinicOption {
    id: string;
    nameEn: string;
    nameAr: string;
}

export interface PricingPolicyOption {
    id: string;
    clinicId: string;
    providerId: string;
    providerNameEn: string;
    providerNameAr: string;
    nameEn: string;
    nameAr: string | null;
    policyNumber: string;
    expiryDate: string | null;
}

export interface PricingContractPrice {
    id: string;
    serviceId: string;
    policyId: string;
    providerNameEn: string;
    providerNameAr: string;
    policyNameEn: string;
    policyNameAr: string | null;
    policyNumber: string;
    priceExVat: string;
    vatRate: string;
    vatCategory: VatCategoryValue;
    priceInclVat: string;
    isActive: boolean;
}

export interface PricingServiceRow {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    clinicId: string;
    clinicNameEn: string;
    clinicNameAr: string;
    specialty: string | null;
    basePrice: string;
    vatRate: string;
    vatCategory: VatCategoryValue;
    contracts: PricingContractPrice[];
}

export interface PricingData {
    services: PricingServiceRow[];
    clinics: PricingClinicOption[];
    policies: PricingPolicyOption[];
}

export interface SavePriceInput {
    serviceId: string;
    priceType: PriceListType;
    /** Required for INSURANCE when creating. Ignored for CASH. */
    policyId?: string | null;
    /** Price excluding VAT, e.g. "120.00". */
    priceExVat: string | number;
    vatCategory: VatCategoryValue;
}

export interface UpdatePriceInput extends SavePriceInput {
    /** Required for INSURANCE when editing a contract price. Ignored for CASH. */
    priceId?: string | null;
}

export interface SavePriceResult {
    service: PricingServiceRow;
    /** The created / updated contract price (null for CASH). */
    price: PricingContractPrice | null;
}

/* -------------------------------------------------------------------------- */
/*                                 Constants                                  */
/* -------------------------------------------------------------------------- */

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE_PATTERN = /^\d{1,7}(?:\.\d{1,2})?$/;
const STANDARD_VAT_RATE = 15;
const EXEMPT_VAT_RATE = 0;
/** decimal.js ROUND_HALF_UP */
const ROUND_HALF_UP = 4 as const;
const MAX_SERVICES = 2000;
const RIYADH_TIME_ZONE = "Asia/Riyadh";
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

const priceSelect = {
    id: true,
    serviceId: true,
    policyId: true,
    priceExVat: true,
    vatRate: true,
    vatCategory: true,
    priceInclVat: true,
    isActive: true,
    policy: {
        select: {
            nameEn: true,
            nameAr: true,
            policyNumber: true,
            expiryDate: true,
            isActive: true,
            provider: {
                select: { nameEn: true, nameAr: true },
            },
        },
    },
} satisfies Prisma.ServicePriceSelect;

const serviceInclude = {
    clinic: {
        select: { nameEn: true, nameAr: true, specialty: true },
    },
    prices: {
        select: priceSelect,
        orderBy: [{ createdAt: "asc" }],
    },
} satisfies Prisma.ServiceInclude;

type PriceRecord = Prisma.ServicePriceGetPayload<{ select: typeof priceSelect }>;
type ServiceRecord = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function invalid<T>(error: string, code = "INVALID_INPUT"): PricingActionResult<T> {
    return { success: false, error, code };
}

function unauthorized<T>(): PricingActionResult<T> {
    return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
}

/** Current calendar date in Riyadh, as a UTC-midnight Date (matches `@db.Date`). */
function riyadhToday(): Date {
    const iso = new Intl.DateTimeFormat("en-CA", {
        timeZone: RIYADH_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

    return new Date(`${iso}T00:00:00.000Z`);
}

function vatRateFor(category: VatCategory): Prisma.Decimal {
    return new Prisma.Decimal(
        category === VatCategory.CITIZEN_MEDICAL_EXEMPT ? EXEMPT_VAT_RATE : STANDARD_VAT_RATE,
    );
}

function inclusiveOf(priceExVat: Prisma.Decimal, vatRate: Prisma.Decimal): Prisma.Decimal {
    return priceExVat
        .mul(vatRate.div(100).plus(1))
        .toDecimalPlaces(2, ROUND_HALF_UP);
}

function actorIdOf(session: unknown): string | null {
    const id = (session as { userId?: unknown } | null)?.userId;

    return typeof id === "string" && validUuid(id) ? id : null;
}

function auditData(input: {
    organizationId: string;
    clinicId: string;
    userId: string;
    actionType: AuditActionType;
    targetTable: "services" | "service_prices";
    recordId: string;
    metadata: Prisma.InputJsonObject;
}): Prisma.AuditLogUncheckedCreateInput {
    return {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        userId: input.userId,
        actionType: input.actionType,
        targetTable: input.targetTable,
        recordId: input.recordId,
        metadata: input.metadata,
    };
}

function mapPrice(price: PriceRecord): PricingContractPrice {
    return {
        id: price.id,
        serviceId: price.serviceId,
        policyId: price.policyId,
        providerNameEn: price.policy.provider.nameEn,
        providerNameAr: price.policy.provider.nameAr,
        policyNameEn: price.policy.nameEn,
        policyNameAr: price.policy.nameAr,
        policyNumber: price.policy.policyNumber,
        priceExVat: price.priceExVat.toFixed(2),
        vatRate: price.vatRate.toFixed(2),
        vatCategory: price.vatCategory,
        priceInclVat: price.priceInclVat.toFixed(2),
        isActive: price.isActive,
    };
}

function mapService(service: ServiceRecord): PricingServiceRow {
    return {
        id: service.id,
        code: service.code,
        nameEn: service.nameEn,
        nameAr: service.nameAr,
        clinicId: service.clinicId,
        clinicNameEn: service.clinic.nameEn,
        clinicNameAr: service.clinic.nameAr,
        specialty: service.clinic.specialty,
        basePrice: service.basePrice.toFixed(2),
        vatRate: service.vatRate.toFixed(2),
        vatCategory: service.vatCategory,
        contracts: service.prices.map(mapPrice),
    };
}

type ParsedSave = {
    serviceId: string;
    priceType: PriceListType;
    policyId: string | null;
    priceId: string | null;
    priceExVat: Prisma.Decimal;
    vatCategory: VatCategory;
    vatRate: Prisma.Decimal;
    priceInclVat: Prisma.Decimal;
};

function parseSaveInput(
    input: UpdatePriceInput,
    mode: "create" | "update",
): { ok: true; value: ParsedSave } | { ok: false; error: string; code: string } {
    const fail = (error: string, code: string) => ({ ok: false, error, code }) as const;

    const serviceId = cleanText(input?.serviceId);
    const policyId = cleanText(input?.policyId) || null;
    const priceId = cleanText(input?.priceId) || null;
    const priceType = input?.priceType;

    if (!validUuid(serviceId)) {
        return fail("Select a valid medical service.", "INVALID_SERVICE");
    }

    if (priceType !== "CASH" && priceType !== "INSURANCE") {
        return fail("Select a valid price list type.", "INVALID_PRICE_TYPE");
    }

    let vatCategory: VatCategory;

    if (input?.vatCategory === "STANDARD") {
        vatCategory = VatCategory.STANDARD;
    } else if (input?.vatCategory === "CITIZEN_MEDICAL_EXEMPT") {
        vatCategory = VatCategory.CITIZEN_MEDICAL_EXEMPT;
    } else {
        return fail("Select a valid VAT rate.", "INVALID_VAT");
    }

    if (priceType === "INSURANCE") {
        if (mode === "create" && (!policyId || !validUuid(policyId))) {
            return fail("Select an insurance payer & contract.", "INVALID_POLICY");
        }

        if (mode === "update" && (!priceId || !validUuid(priceId))) {
            return fail("The selected contract price is invalid.", "INVALID_PRICE");
        }
    }

    const rawPrice =
        typeof input?.priceExVat === "number"
            ? String(input.priceExVat)
            : cleanText(input?.priceExVat).replace(/,/g, "");

    if (!PRICE_PATTERN.test(rawPrice)) {
        return fail(
            "Enter a valid price with up to two decimal places.",
            "INVALID_PRICE_AMOUNT",
        );
    }

    const priceExVat = new Prisma.Decimal(rawPrice).toDecimalPlaces(2, ROUND_HALF_UP);

    if (!priceExVat.isFinite() || priceExVat.lessThanOrEqualTo(0)) {
        return fail("The price must be greater than zero.", "INVALID_PRICE_AMOUNT");
    }

    const vatRate = vatRateFor(vatCategory);

    return {
        ok: true,
        value: {
            serviceId,
            priceType,
            policyId,
            priceId,
            priceExVat,
            vatCategory,
            vatRate,
            priceInclVat: inclusiveOf(priceExVat, vatRate),
        },
    };
}

function failure<T>(action: string, error: unknown): PricingActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Error) {
        switch (error.message) {
            case "SERVICE_NOT_AVAILABLE":
                return invalid(
                    "The selected service is inactive or no longer available.",
                    "SERVICE_NOT_AVAILABLE",
                );
            case "POLICY_NOT_AVAILABLE":
                return invalid(
                    "The selected contract is inactive, expired, or belongs to another clinic.",
                    "POLICY_NOT_AVAILABLE",
                );
            case "DUPLICATE_PRICE":
                return invalid(
                    "This service already has a price for the selected contract. Edit the existing price instead.",
                    "DUPLICATE_PRICE",
                );
            case "PRICE_NOT_FOUND":
                return invalid(
                    "The requested price could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
            default:
                break;
        }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return invalid(
                    "This service already has a price for the selected contract.",
                    "DUPLICATE_PRICE",
                );
            case "P2003":
                return invalid(
                    "A selected service or contract is no longer available.",
                    "INVALID_RELATION",
                );
            case "P2025":
                return invalid(
                    "The requested record could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
            default:
                break;
        }
    }

    return invalid("The operation could not be completed. Please try again.", "DATABASE_ERROR");
}

/* -------------------------------------------------------------------------- */
/*                                   Reads                                    */
/* -------------------------------------------------------------------------- */

export async function getPricingDataAction(): Promise<PricingActionResult<PricingData>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[getPricingDataAction] Authorization failed", error);
        return unauthorized();
    }

    const organizationId = session.organizationId;

    try {
        const [services, clinics, policies] = await Promise.all([
            prisma.service.findMany({
                where: {
                    organizationId,
                    isActive: true,
                    clinic: { is: { organizationId } },
                },
                include: serviceInclude,
                orderBy: [{ clinic: { nameEn: "asc" } }, { nameEn: "asc" }],
                take: MAX_SERVICES,
            }),
            prisma.clinic.findMany({
                where: { organizationId, isActive: true },
                select: { id: true, nameEn: true, nameAr: true },
                orderBy: { nameEn: "asc" },
            }),
            prisma.insurancePolicy.findMany({
                where: {
                    organizationId,
                    isActive: true,
                    provider: { is: { organizationId, isActive: true } },
                    OR: [{ expiryDate: null }, { expiryDate: { gte: riyadhToday() } }],
                },
                select: {
                    id: true,
                    clinicId: true,
                    providerId: true,
                    nameEn: true,
                    nameAr: true,
                    policyNumber: true,
                    expiryDate: true,
                    provider: { select: { nameEn: true, nameAr: true } },
                },
                orderBy: [{ provider: { nameEn: "asc" } }, { nameEn: "asc" }],
            }),
        ]);

        return {
            success: true,
            data: {
                services: services.map(mapService),
                clinics,
                policies: policies.map((policy) => ({
                    id: policy.id,
                    clinicId: policy.clinicId,
                    providerId: policy.providerId,
                    providerNameEn: policy.provider.nameEn,
                    providerNameAr: policy.provider.nameAr,
                    nameEn: policy.nameEn,
                    nameAr: policy.nameAr,
                    policyNumber: policy.policyNumber,
                    expiryDate: policy.expiryDate
                        ? policy.expiryDate.toISOString().slice(0, 10)
                        : null,
                })),
            },
        };
    } catch (error) {
        return failure("getPricingDataAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

/**
 * CASH      -> sets the service's Base Cash Price + VAT (a service has exactly one cash price).
 * INSURANCE -> creates a contract price for (service, policy); duplicates are rejected.
 */
export async function createServicePriceAction(
    input: SavePriceInput,
): Promise<PricingActionResult<SavePriceResult>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[createServicePriceAction] Authorization failed", error);
        return unauthorized();
    }

    const parsed = parseSaveInput(input, "create");

    if (!parsed.ok) {
        return invalid(parsed.error, parsed.code);
    }

    const v = parsed.value;
    const organizationId = session.organizationId;
    const userId = actorIdOf(session);

    try {
        const { row, createdPriceId } = await prisma.$transaction(async (tx) => {
            const service = await tx.service.findFirst({
                where: {
                    id: v.serviceId,
                    organizationId,
                    isActive: true,
                    clinic: { is: { organizationId, isActive: true } },
                },
                select: {
                    id: true,
                    clinicId: true,
                    basePrice: true,
                    vatRate: true,
                    vatCategory: true,
                },
            });

            if (!service) {
                throw new Error("SERVICE_NOT_AVAILABLE");
            }

            let createdPriceId: string | null = null;

            if (v.priceType === "CASH") {
                await tx.service.update({
                    where: { id: service.id, organizationId },
                    data: {
                        basePrice: v.priceExVat,
                        vatRate: v.vatRate,
                        vatCategory: v.vatCategory,
                    },
                });

                if (userId) {
                    await tx.auditLog.create({
                        data: auditData({
                            organizationId,
                            clinicId: service.clinicId,
                            userId,
                            actionType: AuditActionType.UPDATE,
                            targetTable: "services",
                            recordId: service.id,
                            metadata: {
                                event: "CASH_PRICE_SET",
                                beforePriceExVat: service.basePrice.toFixed(2),
                                afterPriceExVat: v.priceExVat.toFixed(2),
                                beforeVatRate: service.vatRate.toFixed(2),
                                afterVatRate: v.vatRate.toFixed(2),
                                vatCategory: v.vatCategory,
                                priceInclVat: v.priceInclVat.toFixed(2),
                            },
                        }),
                    });
                }
            } else {
                const policyId = v.policyId;

                if (!policyId) {
                    throw new Error("POLICY_NOT_AVAILABLE");
                }

                const policy = await tx.insurancePolicy.findFirst({
                    where: {
                        id: policyId,
                        organizationId,
                        clinicId: service.clinicId,
                        isActive: true,
                        provider: { is: { organizationId, isActive: true } },
                        OR: [{ expiryDate: null }, { expiryDate: { gte: riyadhToday() } }],
                    },
                    select: { id: true },
                });

                if (!policy) {
                    throw new Error("POLICY_NOT_AVAILABLE");
                }

                const existing = await tx.servicePrice.findFirst({
                    where: { organizationId, serviceId: service.id, policyId: policy.id },
                    select: { id: true },
                });

                if (existing) {
                    throw new Error("DUPLICATE_PRICE");
                }

                const created = await tx.servicePrice.create({
                    data: {
                        organizationId,
                        clinicId: service.clinicId,
                        serviceId: service.id,
                        policyId: policy.id,
                        priceExVat: v.priceExVat,
                        vatCategory: v.vatCategory,
                        vatRate: v.vatRate,
                        priceInclVat: v.priceInclVat,
                    },
                    select: { id: true },
                });

                createdPriceId = created.id;

                if (userId) {
                    await tx.auditLog.create({
                        data: auditData({
                            organizationId,
                            clinicId: service.clinicId,
                            userId,
                            actionType: AuditActionType.CREATE,
                            targetTable: "service_prices",
                            recordId: created.id,
                            metadata: {
                                event: "CONTRACT_PRICE_CREATED",
                                serviceId: service.id,
                                policyId: policy.id,
                                priceExVat: v.priceExVat.toFixed(2),
                                vatRate: v.vatRate.toFixed(2),
                                vatCategory: v.vatCategory,
                                priceInclVat: v.priceInclVat.toFixed(2),
                            },
                        }),
                    });
                }
            }

            const row = await tx.service.findFirstOrThrow({
                where: { id: service.id, organizationId },
                include: serviceInclude,
            });

            return { row, createdPriceId };
        }, TX_OPTIONS);

        const service = mapService(row);

        return {
            success: true,
            data: {
                service,
                price: createdPriceId
                    ? (service.contracts.find((contract) => contract.id === createdPriceId) ?? null)
                    : null,
            },
        };
    } catch (error) {
        return failure("createServicePriceAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

/**
 * CASH      -> updates the service's Base Cash Price + VAT.
 * INSURANCE -> updates the amount / VAT of an existing contract price (`priceId`).
 *              The payer contract itself is immutable: delete and re-add to change it.
 */
export async function updateServicePriceAction(
    input: UpdatePriceInput,
): Promise<PricingActionResult<SavePriceResult>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[updateServicePriceAction] Authorization failed", error);
        return unauthorized();
    }

    const parsed = parseSaveInput(input, "update");

    if (!parsed.ok) {
        return invalid(parsed.error, parsed.code);
    }

    const v = parsed.value;
    const organizationId = session.organizationId;
    const userId = actorIdOf(session);

    try {
        const row = await prisma.$transaction(async (tx) => {
            const service = await tx.service.findFirst({
                where: {
                    id: v.serviceId,
                    organizationId,
                    clinic: { is: { organizationId } },
                },
                select: {
                    id: true,
                    clinicId: true,
                    basePrice: true,
                    vatRate: true,
                    vatCategory: true,
                },
            });

            if (!service) {
                throw new Error("SERVICE_NOT_AVAILABLE");
            }

            if (v.priceType === "CASH") {
                await tx.service.update({
                    where: { id: service.id, organizationId },
                    data: {
                        basePrice: v.priceExVat,
                        vatRate: v.vatRate,
                        vatCategory: v.vatCategory,
                    },
                });

                if (userId) {
                    await tx.auditLog.create({
                        data: auditData({
                            organizationId,
                            clinicId: service.clinicId,
                            userId,
                            actionType: AuditActionType.UPDATE,
                            targetTable: "services",
                            recordId: service.id,
                            metadata: {
                                event: "CASH_PRICE_UPDATED",
                                beforePriceExVat: service.basePrice.toFixed(2),
                                afterPriceExVat: v.priceExVat.toFixed(2),
                                beforeVatRate: service.vatRate.toFixed(2),
                                afterVatRate: v.vatRate.toFixed(2),
                                vatCategory: v.vatCategory,
                                priceInclVat: v.priceInclVat.toFixed(2),
                            },
                        }),
                    });
                }
            } else {
                const priceId = v.priceId;

                if (!priceId) {
                    throw new Error("PRICE_NOT_FOUND");
                }

                const existing = await tx.servicePrice.findFirst({
                    where: { id: priceId, serviceId: service.id, organizationId },
                    select: {
                        id: true,
                        priceExVat: true,
                        vatRate: true,
                        vatCategory: true,
                        priceInclVat: true,
                    },
                });

                if (!existing) {
                    throw new Error("PRICE_NOT_FOUND");
                }

                await tx.servicePrice.update({
                    where: { id: existing.id, organizationId },
                    data: {
                        priceExVat: v.priceExVat,
                        vatCategory: v.vatCategory,
                        vatRate: v.vatRate,
                        priceInclVat: v.priceInclVat,
                    },
                });

                if (userId) {
                    await tx.auditLog.create({
                        data: auditData({
                            organizationId,
                            clinicId: service.clinicId,
                            userId,
                            actionType: AuditActionType.UPDATE,
                            targetTable: "service_prices",
                            recordId: existing.id,
                            metadata: {
                                event: "CONTRACT_PRICE_UPDATED",
                                serviceId: service.id,
                                beforePriceExVat: existing.priceExVat.toFixed(2),
                                afterPriceExVat: v.priceExVat.toFixed(2),
                                beforeVatRate: existing.vatRate.toFixed(2),
                                afterVatRate: v.vatRate.toFixed(2),
                                vatCategory: v.vatCategory,
                                beforePriceInclVat: existing.priceInclVat.toFixed(2),
                                afterPriceInclVat: v.priceInclVat.toFixed(2),
                            },
                        }),
                    });
                }
            }

            return tx.service.findFirstOrThrow({
                where: { id: service.id, organizationId },
                include: serviceInclude,
            });
        }, TX_OPTIONS);

        const service = mapService(row);

        return {
            success: true,
            data: {
                service,
                price:
                    v.priceType === "INSURANCE"
                        ? (service.contracts.find((contract) => contract.id === v.priceId) ?? null)
                        : null,
            },
        };
    } catch (error) {
        return failure("updateServicePriceAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Toggle                                   */
/* -------------------------------------------------------------------------- */

/** Activates / deactivates a contract price (soft state change, nothing is deleted). */
export async function toggleServicePriceAction(
    priceId: string,
    isActive: boolean,
): Promise<PricingActionResult<{ price: PricingContractPrice }>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[toggleServicePriceAction] Authorization failed", error);
        return unauthorized();
    }

    const id = cleanText(priceId);

    if (!validUuid(id)) {
        return invalid("The selected contract price is invalid.", "INVALID_PRICE");
    }

    if (typeof isActive !== "boolean") {
        return invalid("The requested status is invalid.", "INVALID_STATUS");
    }

    const organizationId = session.organizationId;
    const userId = actorIdOf(session);

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const existing = await tx.servicePrice.findFirst({
                where: { id, organizationId },
                select: {
                    id: true,
                    clinicId: true,
                    serviceId: true,
                    isActive: true,
                    policy: {
                        select: {
                            isActive: true,
                            expiryDate: true,
                            provider: { select: { isActive: true } },
                        },
                    },
                },
            });

            if (!existing) {
                throw new Error("PRICE_NOT_FOUND");
            }

            if (isActive) {
                const expired =
                    existing.policy.expiryDate !== null &&
                    existing.policy.expiryDate.getTime() < riyadhToday().getTime();

                if (!existing.policy.isActive || !existing.policy.provider.isActive || expired) {
                    throw new Error("POLICY_NOT_AVAILABLE");
                }
            }

            const price = await tx.servicePrice.update({
                where: { id: existing.id, organizationId },
                data: { isActive },
                select: priceSelect,
            });

            if (userId) {
                await tx.auditLog.create({
                    data: auditData({
                        organizationId,
                        clinicId: existing.clinicId,
                        userId,
                        actionType: AuditActionType.UPDATE,
                        targetTable: "service_prices",
                        recordId: existing.id,
                        metadata: {
                            event: isActive ? "CONTRACT_PRICE_ACTIVATED" : "CONTRACT_PRICE_DEACTIVATED",
                            serviceId: existing.serviceId,
                            wasActive: existing.isActive,
                            isActive,
                        },
                    }),
                });
            }

            return price;
        }, TX_OPTIONS);

        return { success: true, data: { price: mapPrice(updated) } };
    } catch (error) {
        return failure("toggleServicePriceAction", error);
    }
}

/* -------------------------------------------------------------------------- */
/*                                   Delete                                   */
/* -------------------------------------------------------------------------- */

/**
 * Deletes a contract price. The Base Cash Price belongs to the service itself and cannot be
 * deleted here (edit it instead). Issued invoices are unaffected: they store their own amounts.
 */
export async function deleteServicePriceAction(
    priceId: string,
): Promise<PricingActionResult<{ id: string; serviceId: string }>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[deleteServicePriceAction] Authorization failed", error);
        return unauthorized();
    }

    const id = cleanText(priceId);

    if (!validUuid(id)) {
        return invalid("The selected contract price is invalid.", "INVALID_PRICE");
    }

    const organizationId = session.organizationId;
    const userId = actorIdOf(session);

    try {
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.servicePrice.findFirst({
                where: { id, organizationId },
                select: {
                    id: true,
                    clinicId: true,
                    serviceId: true,
                    policyId: true,
                    priceExVat: true,
                    vatRate: true,
                    priceInclVat: true,
                },
            });

            if (!existing) {
                throw new Error("PRICE_NOT_FOUND");
            }

            await tx.servicePrice.delete({
                where: { id: existing.id, organizationId },
            });

            if (userId) {
                await tx.auditLog.create({
                    data: auditData({
                        organizationId,
                        clinicId: existing.clinicId,
                        userId,
                        actionType: AuditActionType.DELETE,
                        targetTable: "service_prices",
                        recordId: existing.id,
                        metadata: {
                            event: "CONTRACT_PRICE_DELETED",
                            serviceId: existing.serviceId,
                            policyId: existing.policyId,
                            priceExVat: existing.priceExVat.toFixed(2),
                            vatRate: existing.vatRate.toFixed(2),
                            priceInclVat: existing.priceInclVat.toFixed(2),
                        },
                    }),
                });
            }

            return { id: existing.id, serviceId: existing.serviceId };
        }, TX_OPTIONS);

        return { success: true, data: result };
    } catch (error) {
        return failure("deleteServicePriceAction", error);
    }
}