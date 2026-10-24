
"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";

const MANAGEMENT_PATH = "/admin/clinical/services";

const ALLOWED_SPECIALTIES = [
    "DENT",
    "PED",
    "DER",
    "CARD",
    "IM",
    "GEN",
] as const;

const ALLOWED_VAT_RATES = [0, 15] as const;

export type ClinicSpecialty =
    (typeof ALLOWED_SPECIALTIES)[number];

export interface CreateClinicInput {
    nameEn: string;
    nameAr: string;
    specialty: ClinicSpecialty;
    nphiesCode: string;
    isActive: boolean;
}

export interface UpdateClinicInput {
    nameEn: string;
    nameAr: string;
    specialty: ClinicSpecialty;
    nphiesCode: string;
}

export interface CreateServiceInput {
    clinicId: string;
    code: string;
    nameEn: string;
    nameAr: string;
    basePrice: string | number;
    vatRate: 0 | 15;
}

export interface UpdateServiceInput {
    code: string;
    nameEn: string;
    nameAr: string;
    basePrice: string | number;
    vatRate: 0 | 15;
}

export interface ActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

const specialtyCodes = new Set<string>(ALLOWED_SPECIALTIES);

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
    );
}

function parseMoney(
    value: string | number,
): Prisma.Decimal | null {
    const normalized = String(value).trim();

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
        return null;
    }

    try {
        const amount = new Prisma.Decimal(normalized);

        if (
            !amount.isFinite() ||
            amount.isNegative() ||
            amount.greaterThan("9999999999.99")
        ) {
            return null;
        }

        return amount.toDecimalPlaces(2);
    } catch {
        return null;
    }
}

function mapClinic<
    T extends {
        id: string;
        nameAr: string;
        nameEn: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        specialty?: string | null;
        nphiesCode?: string | null;
    },
>(clinic: T) {
    return {
        id: clinic.id,
        nameAr: clinic.nameAr,
        nameEn: clinic.nameEn,
        specialty: clinic.specialty ?? null,
        nphiesCode: clinic.nphiesCode ?? null,
        isActive: clinic.isActive,
        createdAt: clinic.createdAt.toISOString(),
        updatedAt: clinic.updatedAt.toISOString(),
    };
}

function mapService<
    T extends {
        id: string;
        clinicId: string;
        code: string;
        nameAr: string;
        nameEn: string;
        basePrice: Prisma.Decimal;
        vatRate: Prisma.Decimal;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        clinic: {
            id: string;
            nameAr: string;
            nameEn: string;
        };
    },
>(service: T) {
    const base = new Prisma.Decimal(service.basePrice);
    const rate = new Prisma.Decimal(service.vatRate);

    const vat = base.mul(rate).div(100).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
    );

    const total = base.add(vat).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
    );

    return {
        id: service.id,
        clinicId: service.clinicId,
        clinic: {
            id: service.clinic.id,
            nameAr: service.clinic.nameAr,
            nameEn: service.clinic.nameEn,
        },
        code: service.code,
        nameAr: service.nameAr,
        nameEn: service.nameEn,
        basePrice: base.toFixed(2),
        vatRate: rate.toString(),
        vatAmount: vat.toFixed(2),
        totalPrice: total.toFixed(2),
        isActive: service.isActive,
        createdAt: service.createdAt.toISOString(),
        updatedAt: service.updatedAt.toISOString(),
    };
}

function validClinicFields(input: UpdateClinicInput) {
    const nameEn = cleanText(input?.nameEn);
    const nameAr = cleanText(input?.nameAr);
    const specialty = cleanText(input?.specialty);
    const nphiesCode = cleanText(input?.nphiesCode).toUpperCase();

    if (
        !nameEn ||
        !nameAr ||
        nameEn.length > 150 ||
        nameAr.length > 150
    ) {
        return {
            success: false as const,
            error: "Enter both clinic names, up to 150 characters each.",
            code: "INVALID_CLINIC_NAME",
        };
    }

    if (!specialtyCodes.has(specialty)) {
        return {
            success: false as const,
            error: "Select a valid specialty.",
            code: "INVALID_SPECIALTY",
        };
    }

    if (!/^[A-Z0-9-]{2,30}$/.test(nphiesCode)) {
        return {
            success: false as const,
            error: "Enter a valid clinic code.",
            code: "INVALID_CLINIC_CODE",
        };
    }

    return {
        success: true as const,
        data: {
            nameEn,
            nameAr,
            specialty: specialty as ClinicSpecialty,
            nphiesCode,
        },
    };
}

function validServiceFields(input: UpdateServiceInput) {
    const code = cleanText(input?.code).toUpperCase();
    const nameEn = cleanText(input?.nameEn);
    const nameAr = cleanText(input?.nameAr);
    const basePrice = parseMoney(input?.basePrice);
    const vatRate = Number(input?.vatRate);

    if (!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(code)) {
        return {
            success: false as const,
            error: "Enter a valid service code (2–40 characters).",
            code: "INVALID_SERVICE_CODE",
        };
    }

    if (
        !nameEn ||
        !nameAr ||
        nameEn.length > 200 ||
        nameAr.length > 200
    ) {
        return {
            success: false as const,
            error: "Enter both service names, up to 200 characters each.",
            code: "INVALID_SERVICE_NAME",
        };
    }

    if (!basePrice) {
        return {
            success: false as const,
            error: "Enter a valid non-negative price with up to two decimal places.",
            code: "INVALID_PRICE",
        };
    }

    if (!ALLOWED_VAT_RATES.includes(vatRate as 0 | 15)) {
        return {
            success: false as const,
            error: "Choose either standard VAT (15%) or exempt VAT (0%).",
            code: "INVALID_VAT_RATE",
        };
    }

    return {
        success: true as const,
        data: {
            code,
            nameEn,
            nameAr,
            basePrice,
            vatRate: vatRate as 0 | 15,
        },
    };
}

function databaseError<T>(
    action: string,
    error: unknown,
    message: string,
): ActionResult<T> {
    console.error(`[${action}]`, error);

    return {
        success: false,
        error: message,
        code: "DATABASE_ERROR",
    };
}

/**
 * Fetch all clinics, including inactive clinics.
 */
export async function getClinicsData() {
    try {
        const clinics = await prisma.clinic.findMany({
            orderBy: [
                { isActive: "desc" },
                { nameEn: "asc" },
            ],
        });

        return {
            success: true as const,
            data: clinics.map(mapClinic),
        };
    } catch (error) {
        console.error("[getClinicsData]", error);

        return {
            success: false as const,
            data: [],
            error: "Unable to load clinics.",
        };
    }
}

/**
 * Fetch services and their related clinics.
 */
export async function getServicesData() {
    try {
        const services = await prisma.service.findMany({
            include: {
                clinic: {
                    select: {
                        id: true,
                        nameAr: true,
                        nameEn: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return {
            success: true as const,
            data: services.map(mapService),
        };
    } catch (error) {
        console.error("[getServicesData]", error);

        return {
            success: false as const,
            data: [],
            error: "Unable to load services.",
        };
    }
}

/**
 * Create a clinic.
 */
export async function createClinicAction(
    input: CreateClinicInput,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    const parsed = validClinicFields(input);

    if (!parsed.success) {
        return parsed;
    }

    try {
        const clinic = await prisma.clinic.create({
            data: {
                ...parsed.data,
                isActive: input.isActive === true,
            },
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: mapClinic(clinic),
        };
    } catch (error) {
        return databaseError(
            "createClinicAction",
            error,
            "Unable to create the clinic. Please try again.",
        );
    }
}

/**
 * Update clinic names, specialty, and NPHIES/catalog code.
 * Status is deliberately managed by toggleClinicStatusAction.
 */
export async function updateClinicAction(
    id: string,
    input: UpdateClinicInput,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    if (!validUuid(id)) {
        return {
            success: false,
            error: "Invalid clinic identifier.",
            code: "INVALID_CLINIC_ID",
        };
    }

    const parsed = validClinicFields(input);

    if (!parsed.success) {
        return parsed;
    }

    try {
        const clinic = await prisma.clinic.update({
            where: { id },
            data: parsed.data,
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: mapClinic(clinic),
        };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return {
                success: false,
                error: "The clinic no longer exists.",
                code: "CLINIC_NOT_FOUND",
            };
        }

        return databaseError(
            "updateClinicAction",
            error,
            "Unable to update the clinic. Please try again.",
        );
    }
}

/**
 * Activate or deactivate a clinic.
 */
export async function toggleClinicStatusAction(
    id: string,
    isActive: boolean,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    if (!validUuid(id) || typeof isActive !== "boolean") {
        return {
            success: false,
            error: "Invalid clinic identifier or status.",
            code: "INVALID_INPUT",
        };
    }

    try {
        const clinic = await prisma.clinic.update({
            where: { id },
            data: { isActive },
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: mapClinic(clinic),
        };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return {
                success: false,
                error: "The clinic no longer exists.",
                code: "CLINIC_NOT_FOUND",
            };
        }

        return databaseError(
            "toggleClinicStatusAction",
            error,
            "Unable to change the clinic status.",
        );
    }
}

/**
 * Create a service. New services start active.
 */
export async function createServiceAction(
    input: CreateServiceInput,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    const clinicId = cleanText(input?.clinicId);

    if (!validUuid(clinicId)) {
        return {
            success: false,
            error: "Select a valid clinic.",
            code: "INVALID_CLINIC",
        };
    }

    const parsed = validServiceFields(input);

    if (!parsed.success) {
        return parsed;
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinic.findUnique({
                where: { id: clinicId },
                select: { id: true, isActive: true },
            });

            if (!clinic || !clinic.isActive) {
                throw new Error("CLINIC_NOT_ACTIVE");
            }

            const duplicate = await tx.service.findUnique({
                where: {
                    clinicId_code: {
                        clinicId,
                        code: parsed.data.code,
                    },
                },
                select: { id: true },
            });

            if (duplicate) {
                throw new Error("DUPLICATE_SERVICE_CODE");
            }

            const service = await tx.service.create({
                data: {
                    clinicId,
                    code: parsed.data.code,
                    nameEn: parsed.data.nameEn,
                    nameAr: parsed.data.nameAr,
                    basePrice: parsed.data.basePrice,
                    vatRate: new Prisma.Decimal(parsed.data.vatRate),
                    isActive: true,
                },
                include: {
                    clinic: {
                        select: {
                            id: true,
                            nameAr: true,
                            nameEn: true,
                        },
                    },
                },
            });

            return mapService(service);
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: result,
        };
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "DUPLICATE_SERVICE_CODE") {
                return {
                    success: false,
                    error: "This service code already exists in the selected clinic.",
                    code: "DUPLICATE_SERVICE_CODE",
                };
            }

            if (error.message === "CLINIC_NOT_ACTIVE") {
                return {
                    success: false,
                    error: "The selected clinic is inactive or no longer exists.",
                    code: "CLINIC_NOT_ACTIVE",
                };
            }
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                success: false,
                error: "This service code already exists in the selected clinic.",
                code: "DUPLICATE_SERVICE_CODE",
            };
        }

        return databaseError(
            "createServiceAction",
            error,
            "Unable to create the service. Please try again.",
        );
    }
}

/**
 * Update service information and pricing.
 * The clinic association is intentionally unchanged.
 */
export async function updateServiceAction(
    id: string,
    input: UpdateServiceInput,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    if (!validUuid(id)) {
        return {
            success: false,
            error: "Invalid service identifier.",
            code: "INVALID_SERVICE_ID",
        };
    }

    const parsed = validServiceFields(input);

    if (!parsed.success) {
        return parsed;
    }

    try {
        const service = await prisma.$transaction(async (tx) => {
            const existing = await tx.service.findUnique({
                where: { id },
                select: {
                    id: true,
                    clinicId: true,
                },
            });

            if (!existing) {
                throw new Error("SERVICE_NOT_FOUND");
            }

            const duplicate = await tx.service.findUnique({
                where: {
                    clinicId_code: {
                        clinicId: existing.clinicId,
                        code: parsed.data.code,
                    },
                },
                select: { id: true },
            });

            if (duplicate && duplicate.id !== id) {
                throw new Error("DUPLICATE_SERVICE_CODE");
            }

            return tx.service.update({
                where: { id },
                data: {
                    code: parsed.data.code,
                    nameEn: parsed.data.nameEn,
                    nameAr: parsed.data.nameAr,
                    basePrice: parsed.data.basePrice,
                    vatRate: new Prisma.Decimal(parsed.data.vatRate),
                },
                include: {
                    clinic: {
                        select: {
                            id: true,
                            nameAr: true,
                            nameEn: true,
                        },
                    },
                },
            });
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: mapService(service),
        };
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "SERVICE_NOT_FOUND") {
                return {
                    success: false,
                    error: "The service no longer exists.",
                    code: "SERVICE_NOT_FOUND",
                };
            }

            if (error.message === "DUPLICATE_SERVICE_CODE") {
                return {
                    success: false,
                    error: "This service code already exists in the selected clinic.",
                    code: "DUPLICATE_SERVICE_CODE",
                };
            }
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return {
                success: false,
                error: "The service no longer exists.",
                code: "SERVICE_NOT_FOUND",
            };
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return {
                success: false,
                error: "This service code already exists in the selected clinic.",
                code: "DUPLICATE_SERVICE_CODE",
            };
        }

        return databaseError(
            "updateServiceAction",
            error,
            "Unable to update the service. Please try again.",
        );
    }
}

/**
 * Activate or deactivate a service.
 */
export async function toggleServiceStatusAction(
    id: string,
    isActive: boolean,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    if (!validUuid(id) || typeof isActive !== "boolean") {
        return {
            success: false,
            error: "Invalid service identifier or status.",
            code: "INVALID_INPUT",
        };
    }

    try {
        const service = await prisma.service.update({
            where: { id },
            data: { isActive },
            include: {
                clinic: {
                    select: {
                        id: true,
                        nameAr: true,
                        nameEn: true,
                    },
                },
            },
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: mapService(service),
        };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return {
                success: false,
                error: "The service no longer exists.",
                code: "SERVICE_NOT_FOUND",
            };
        }

        return databaseError(
            "toggleServiceStatusAction",
            error,
            "Unable to change the service status.",
        );
    }
}
