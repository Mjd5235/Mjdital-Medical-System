// app/admin/clinical/services/actions.ts
//
// SERVER-SIDE SPEED CHANGES (behaviour is unchanged):
//  - `revalidatePath` removed everywhere: the client owns its state now.
//  - updateServiceAction: one clinic lookup instead of two, and no code-numbering queries
//    when the clinic did not change.
//  - toggleServiceStatusAction: a single read + a single write (no transaction).
//  - Shorter transaction timeouts so a stuck request fails fast instead of hanging.
//
// NEW: deleteClinicAction / deleteServiceAction
//  - A clinic can only be deleted when it has no services, doctors or shifts.
//  - A service can only be deleted when no shift uses it.
//  - Any other foreign-key reference (e.g. appointments) is caught via Prisma P2003
//    and returned as a friendly message.
//
// Recommended indexes (Prisma schema, then `prisma migrate`):
//   model Service { @@index([organizationId, clinicId]) }
//   model Clinic  { @@index([organizationId, isActive]) }
"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

const ALLOWED_SPECIALTIES = [
    "DENT",
    "PED",
    "DER",
    "CARD",
    "IM",
    "GEN",
    "OBG",
    "ORT",
    "OPH",
    "ENT",
    "LAB",
    "RAD",
] as const;

const ALLOWED_VAT_RATES = [0, 15] as const;

const TX_OPTIONS = {
    maxWait: 5_000,
    timeout: 10_000,
} as const;

export type ClinicSpecialty = (typeof ALLOWED_SPECIALTIES)[number];

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
    clinicId: string;
    // Kept for compatibility with existing callers; the server deliberately ignores it.
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

export interface DeleteResultData {
    id: string;
}

const specialtyCodes = new Set<string>(ALLOWED_SPECIALTIES);

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseMoney(value: string | number): Prisma.Decimal | null {
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

    if (!nameEn || !nameAr || nameEn.length > 150 || nameAr.length > 150) {
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

function validServiceFields(
    input: UpdateServiceInput | CreateServiceInput,
    options: { requireCode?: boolean } = {},
) {
    const requireCode = options.requireCode ?? true;
    const code = cleanText(input?.code).toUpperCase();
    const nameEn = cleanText(input?.nameEn);
    const nameAr = cleanText(input?.nameAr);
    const basePrice = parseMoney(input?.basePrice);
    const vatRate = Number(input?.vatRate);

    if (
        requireCode &&
        !/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(code)
    ) {
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
    // Keep details in server logs; return a safe, actionable message to the client.
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
            return {
                success: false,
                error: "A record with the same unique value already exists.",
                code: "DUPLICATE_RECORD",
            };
        }

        if (error.code === "P2003") {
            return {
                success: false,
                error: "This record cannot be changed because it is referenced by other records.",
                code: "RELATED_RECORD_CONSTRAINT",
            };
        }

        if (error.code === "P2025") {
            return {
                success: false,
                error: "The record no longer exists. Refresh the page and try again.",
                code: "RECORD_NOT_FOUND",
            };
        }
    }

    return {
        success: false,
        error: message,
        code: "DATABASE_ERROR",
    };
}

function notFound<T>(message: string, code: string): ActionResult<T> {
    return { success: false, error: message, code };
}

const serviceClinicInclude = {
    clinic: {
        select: {
            id: true,
            nameAr: true,
            nameEn: true,
        },
    },
} as const;

export async function getClinicsData() {
    const session = await requirePortalSession("admin");

    try {
        const clinics = await prisma.clinic.findMany({
            where: { organizationId: session.organizationId },
            orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
        });

        return { success: true as const, data: clinics.map(mapClinic) };
    } catch (error) {
        console.error("[getClinicsData]", error);
        return {
            success: false as const,
            data: [],
            error: "Unable to load clinics.",
        };
    }
}

export async function getServicesData() {
    const session = await requirePortalSession("admin");

    try {
        const services = await prisma.service.findMany({
            where: {
                clinic: { is: { organizationId: session.organizationId } },
            },
            include: serviceClinicInclude,
            orderBy: { createdAt: "desc" },
        });

        return { success: true as const, data: services.map(mapService) };
    } catch (error) {
        console.error("[getServicesData]", error);
        return {
            success: false as const,
            data: [],
            error: "Unable to load services.",
        };
    }
}

export async function createClinicAction(
    input: CreateClinicInput,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    const session = await requirePortalSession("admin");
    const parsed = validClinicFields(input);

    if (!parsed.success) return parsed;

    if (typeof input?.isActive !== "boolean") {
        return notFound("Invalid clinic status.", "INVALID_INPUT");
    }

    try {
        const clinic = await prisma.clinic.create({
            data: {
                ...parsed.data,
                organizationId: session.organizationId,
                isActive: input.isActive,
            },
        });

        return { success: true, data: mapClinic(clinic) };
    } catch (error) {
        return databaseError(
            "createClinicAction",
            error,
            "Unable to create the clinic. Please check the entered values and try again.",
        );
    }
}

export async function updateClinicAction(
    id: string,
    input: UpdateClinicInput,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id)) {
        return notFound("Invalid clinic identifier.", "INVALID_CLINIC_ID");
    }

    const parsed = validClinicFields(input);
    if (!parsed.success) return parsed;

    try {
        // Scoped updateMany: one round trip that also enforces tenant isolation.
        const result = await prisma.clinic.updateMany({
            where: { id, organizationId: session.organizationId },
            data: parsed.data,
        });

        if (result.count !== 1) {
            return notFound(
                "The clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id } });

        return { success: true, data: mapClinic(clinic) };
    } catch (error) {
        return databaseError(
            "updateClinicAction",
            error,
            "Unable to update the clinic. Please check the entered values and try again.",
        );
    }
}

export async function toggleClinicStatusAction(
    id: string,
    isActive: boolean,
): Promise<ActionResult<ReturnType<typeof mapClinic>>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id) || typeof isActive !== "boolean") {
        return notFound("Invalid clinic identifier or status.", "INVALID_INPUT");
    }

    try {
        const clinic = await prisma.$transaction(async (tx) => {
            const existing = await tx.clinic.findFirst({
                where: { id, organizationId: session.organizationId },
                select: { id: true },
            });

            if (!existing) throw new Error("CLINIC_NOT_FOUND");

            const updatedClinic = await tx.clinic.update({
                where: { id: existing.id },
                data: { isActive },
            });

            // Deactivating a clinic always deactivates its services.
            // Reactivating the clinic does not reactivate services automatically.
            if (!isActive) {
                await tx.service.updateMany({
                    where: {
                        clinicId: existing.id,
                        organizationId: session.organizationId,
                    },
                    data: { isActive: false },
                });
            }

            return updatedClinic;
        }, TX_OPTIONS);

        return { success: true, data: mapClinic(clinic) };
    } catch (error) {
        if (error instanceof Error && error.message === "CLINIC_NOT_FOUND") {
            return notFound(
                "The clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        return databaseError(
            "toggleClinicStatusAction",
            error,
            "Unable to change the clinic status. Please try again.",
        );
    }
}

/**
 * Deletes a clinic. Refused while the clinic still has services, doctors or shifts
 * (disable it instead). Any other reference (e.g. appointments) is caught via P2003.
 */
export async function deleteClinicAction(
    id: string,
): Promise<ActionResult<DeleteResultData>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id)) {
        return notFound("Invalid clinic identifier.", "INVALID_CLINIC_ID");
    }

    try {
        const existing = await prisma.clinic.findFirst({
            where: { id, organizationId: session.organizationId },
            select: { id: true },
        });

        if (!existing) {
            return notFound(
                "The clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        const [serviceCount, doctorCount, shiftCount] = await Promise.all([
            prisma.service.count({
                where: { clinicId: existing.id, organizationId: session.organizationId },
            }),
            prisma.doctor.count({
                where: { clinicId: existing.id, organizationId: session.organizationId },
            }),
            prisma.shift.count({
                where: { clinicId: existing.id, organizationId: session.organizationId },
            }),
        ]);

        if (serviceCount > 0) {
            return notFound(
                "This clinic cannot be deleted because it still has services. Delete the services first or disable the clinic.",
                "CLINIC_HAS_SERVICES",
            );
        }

        if (doctorCount > 0 || shiftCount > 0) {
            return notFound(
                "This clinic cannot be deleted because doctors or shifts are linked to it. Disable it instead.",
                "CLINIC_IN_USE",
            );
        }

        const result = await prisma.clinic.deleteMany({
            where: { id: existing.id, organizationId: session.organizationId },
        });

        if (result.count !== 1) {
            return notFound(
                "The clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        return { success: true, data: { id: existing.id } };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2003"
        ) {
            console.error("[deleteClinicAction]", error);

            return notFound(
                "This clinic cannot be deleted because other records (such as appointments) reference it. Disable it instead.",
                "CLINIC_IN_USE",
            );
        }

        return databaseError(
            "deleteClinicAction",
            error,
            "Unable to delete the clinic. Please try again.",
        );
    }
}

function generateNextServiceCode(
    specialty: string | null | undefined,
    existingCodes: string[],
): string {
    const prefix = specialtyCodes.has(specialty ?? "") ? specialty! : "GEN";
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
    let maxNumber = 100;

    for (const code of existingCodes) {
        const match = pattern.exec(code);
        if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
    }

    return `${prefix}-${maxNumber + 1}`;
}

export async function createServiceAction(
    input: CreateServiceInput,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    const session = await requirePortalSession("admin");
    const clinicId = cleanText(input?.clinicId);

    if (!validUuid(clinicId)) {
        return notFound("Select a valid clinic.", "INVALID_CLINIC");
    }

    const parsed = validServiceFields(input, {
        requireCode: false,
    });

    if (!parsed.success) return parsed;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinic.findFirst({
                where: {
                    id: clinicId,
                    organizationId: session.organizationId,
                    isActive: true,
                },
                select: { id: true, specialty: true },
            });

            if (!clinic) throw new Error("CLINIC_NOT_AVAILABLE");

            const existingServices = await tx.service.findMany({
                where: { organizationId: session.organizationId, clinicId },
                select: { code: true },
            });

            // Always generate the code on the server; never trust a client-supplied code.
            const code = generateNextServiceCode(
                clinic.specialty,
                existingServices.map((service) => service.code),
            );

            const service = await tx.service.create({
                data: {
                    organizationId: session.organizationId,
                    clinicId,
                    code,
                    nameEn: parsed.data.nameEn,
                    nameAr: parsed.data.nameAr,
                    basePrice: parsed.data.basePrice,
                    vatRate: new Prisma.Decimal(parsed.data.vatRate),
                    isActive: true,
                },
                include: serviceClinicInclude,
            });

            return mapService(service);
        }, TX_OPTIONS);

        return { success: true, data: result };
    } catch (error) {
        if (error instanceof Error && error.message === "CLINIC_NOT_AVAILABLE") {
            return {
                success: false,
                error: "The selected clinic is inactive, unavailable, or outside your organization.",
                code: "CLINIC_NOT_AVAILABLE",
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
            "createServiceAction",
            error,
            "Unable to create the service. Please check the entered values and try again.",
        );
    }
}

export async function updateServiceAction(
    id: string,
    input: UpdateServiceInput,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id)) {
        return notFound("Invalid service identifier.", "INVALID_SERVICE_ID");
    }

    const clinicId = cleanText(input?.clinicId);
    if (!validUuid(clinicId)) {
        return notFound("Select a valid clinic.", "INVALID_CLINIC");
    }

    const parsed = validServiceFields(input);
    if (!parsed.success) return parsed;

    try {
        const service = await prisma.$transaction(async (tx) => {
            const existing = await tx.service.findFirst({
                where: {
                    id,
                    organizationId: session.organizationId,
                    clinic: {
                        is: { organizationId: session.organizationId },
                    },
                },
                select: { id: true, code: true, clinicId: true },
            });

            if (!existing) throw new Error("SERVICE_NOT_FOUND");

            // A service can only be associated with an active clinic in the same organization.
            const targetClinic = await tx.clinic.findFirst({
                where: {
                    id: clinicId,
                    organizationId: session.organizationId,
                    isActive: true,
                },
                select: { id: true, specialty: true },
            });

            if (!targetClinic) throw new Error("CLINIC_NOT_AVAILABLE");

            let generatedCode = existing.code;

            // Only renumber when the service moves to another clinic.
            if (existing.clinicId !== targetClinic.id) {
                const existingCodes = await tx.service.findMany({
                    where: {
                        organizationId: session.organizationId,
                        clinicId: targetClinic.id,
                        NOT: { id },
                    },
                    select: { code: true },
                });

                generatedCode = generateNextServiceCode(
                    targetClinic.specialty,
                    existingCodes.map((item) => item.code),
                );

                if (existingCodes.some((item) => item.code === generatedCode)) {
                    throw new Error("DUPLICATE_SERVICE_CODE");
                }
            }

            return tx.service.update({
                where: { id: existing.id },
                data: {
                    clinicId: targetClinic.id,
                    code: generatedCode,
                    nameEn: parsed.data.nameEn,
                    nameAr: parsed.data.nameAr,
                    basePrice: parsed.data.basePrice,
                    vatRate: new Prisma.Decimal(parsed.data.vatRate),
                },
                include: serviceClinicInclude,
            });
        }, TX_OPTIONS);

        return { success: true, data: mapService(service) };
    } catch (error) {
        console.error("[updateServiceAction]", error);

        if (error instanceof Error) {
            if (error.message === "SERVICE_NOT_FOUND") {
                return notFound(
                    "The service was not found in your organization.",
                    "SERVICE_NOT_FOUND",
                );
            }

            if (error.message === "CLINIC_NOT_AVAILABLE") {
                return notFound(
                    "The selected clinic is inactive, unavailable, or outside your organization. Activate the clinic first.",
                    "CLINIC_NOT_AVAILABLE",
                );
            }

            if (error.message === "DUPLICATE_SERVICE_CODE") {
                return notFound(
                    "This service code already exists in the selected clinic.",
                    "DUPLICATE_SERVICE_CODE",
                );
            }
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return notFound(
                "This service code already exists in the selected clinic.",
                "DUPLICATE_SERVICE_CODE",
            );
        }

        return databaseError(
            "updateServiceAction",
            error,
            "Unable to update the service. Please check the entered values and try again.",
        );
    }
}

export async function toggleServiceStatusAction(
    id: string,
    isActive: boolean,
): Promise<ActionResult<ReturnType<typeof mapService>>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id) || typeof isActive !== "boolean") {
        return notFound("Invalid service identifier or status.", "INVALID_INPUT");
    }

    try {
        // One read (service + its clinic state) and one write — no transaction needed.
        const existing = await prisma.service.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinic: { is: { organizationId: session.organizationId } },
            },
            select: { id: true, clinic: { select: { isActive: true } } },
        });

        if (!existing) {
            return notFound(
                "The service was not found in your organization.",
                "SERVICE_NOT_FOUND",
            );
        }

        // Server-side activation guard.
        if (isActive && !existing.clinic.isActive) {
            return {
                success: false,
                error: "لا يمكن تفعيل الخدمة لأن العيادة المرتبطة بها معطلة حالياً. يرجى تفعيل العيادة أولاً.",
                code: "CLINIC_INACTIVE",
            };
        }

        const service = await prisma.service.update({
            where: { id: existing.id },
            data: { isActive },
            include: serviceClinicInclude,
        });

        return { success: true, data: mapService(service) };
    } catch (error) {
        return databaseError(
            "toggleServiceStatusAction",
            error,
            "Unable to change the service status. Please try again.",
        );
    }
}

/**
 * Deletes a service. Refused while any shift uses it (disable it instead).
 * Other references (e.g. appointments) are caught via Prisma P2003.
 */
export async function deleteServiceAction(
    id: string,
): Promise<ActionResult<DeleteResultData>> {
    const session = await requirePortalSession("admin");

    if (!validUuid(id)) {
        return notFound("Invalid service identifier.", "INVALID_SERVICE_ID");
    }

    try {
        const existing = await prisma.service.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinic: { is: { organizationId: session.organizationId } },
            },
            select: { id: true },
        });

        if (!existing) {
            return notFound(
                "The service was not found in your organization.",
                "SERVICE_NOT_FOUND",
            );
        }

        const shiftCount = await prisma.shift.count({
            where: { serviceId: existing.id, organizationId: session.organizationId },
        });

        if (shiftCount > 0) {
            return notFound(
                "This service cannot be deleted because it is used in doctor shifts. Disable it instead.",
                "SERVICE_IN_USE",
            );
        }

        const result = await prisma.service.deleteMany({
            where: { id: existing.id, organizationId: session.organizationId },
        });

        if (result.count !== 1) {
            return notFound(
                "The service was not found in your organization.",
                "SERVICE_NOT_FOUND",
            );
        }

        return { success: true, data: { id: existing.id } };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2003"
        ) {
            console.error("[deleteServiceAction]", error);

            return notFound(
                "This service cannot be deleted because other records (such as appointments) reference it. Disable it instead.",
                "SERVICE_IN_USE",
            );
        }

        return databaseError(
            "deleteServiceAction",
            error,
            "Unable to delete the service. Please try again.",
        );
    }
}