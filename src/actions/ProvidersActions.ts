// src/actions/doctorsActions.ts
"use server";

import {
    DoctorProfessionalRank,
    IdentityType,
    Prisma,
    UserRole,
} from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

const MANAGEMENT_PATH = "/admin/clinical/providers";
const TOKEN_EXPIRY_HOURS = 24;
const PAGE_SIZE = 10;

export interface DoctorActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface DoctorClinicOption {
    id: string;
    nameEn: string;
    nameAr: string;
    isActive: boolean;
}

export interface DoctorServiceOption {
    id: string;
    clinicId: string;
    nameEn: string;
    nameAr: string;
    code: string;
    isActive: boolean;
}

export interface DoctorRow {
    id: string;
    userId: string | null;
    email: string | null;
    firstName: string;
    lastName: string;
    fullName: string;
    specialty: string;
    nationalId: string;
    scfhsLicenseNumber: string;
    professionalRank: DoctorProfessionalRank;
    clinicId: string;
    clinicName: string;
    commissionRate: string;
    isActive: boolean;
    accountStatus: "ACTIVE" | "INVITED" | "NO_ACCOUNT";
    createdAt: string;
    services: Array<{
        id: string;
        nameEn: string;
        nameAr: string;
        code: string;
    }>;
}

export interface GetDoctorsInput {
    clinicId?: string;
    search?: string;
    status?: "ALL" | "ACTIVE" | "INACTIVE" | "INVITED";
    page?: number;
    pageSize?: number;
}

export interface GetDoctorsData {
    doctors: DoctorRow[];
    clinics: DoctorClinicOption[];
    services: DoctorServiceOption[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface CreateDoctorInput {
    email: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    scfhsLicenseNumber: string;
    professionalRank: DoctorProfessionalRank;
    specialty: string;
    clinicId: string;
    serviceIds: string[];
    commissionRate: string | number;
}

const VALID_RANKS = new Set<string>(Object.values(DoctorProfessionalRank));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]{2,49}$/;
const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function validCommissionRate(value: unknown): Prisma.Decimal | null {
    const normalized = String(value ?? "").trim();

    if (!/^(?:\d{1,2})(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/.test(normalized)) {
        return null;
    }

    try {
        const rate = new Prisma.Decimal(normalized);

        if (
            !rate.isFinite() ||
            rate.isNegative() ||
            rate.greaterThan(100)
        ) {
            return null;
        }

        return rate.toDecimalPlaces(2);
    } catch {
        return null;
    }
}

function invalid<T>(
    error: string,
    code = "INVALID_INPUT",
): DoctorActionResult<T> {
    return { success: false, error, code };
}

function databaseError<T>(
    action: string,
    error: unknown,
): DoctorActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002":
                return invalid(
                    "The email, national ID, or SCFHS license number is already registered.",
                    "DUPLICATE_RECORD",
                );
            case "P2003":
                return invalid(
                    "A selected clinic or service is no longer available.",
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

function getBaseUrl(): string {
    const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

    if (!configured) {
        throw new Error("APP_URL is not configured.");
    }

    const url = new URL(configured);

    if (
        process.env.NODE_ENV === "production" &&
        url.protocol !== "https:"
    ) {
        throw new Error("APP_URL must use HTTPS in production.");
    }

    return url.origin;
}

function mapDoctor(
    doctor: {
        id: string;
        userId: string | null;
        fullNameEn: string;
        fullNameAr: string;
        specialtyEn: string;
        nationalId: string;
        scfhsLicenseNumber: string;
        professionalRank: DoctorProfessionalRank;
        clinicId: string;
        commissionRate: Prisma.Decimal;
        isActive: boolean;
        createdAt: Date;
        clinic: { nameEn: string; nameAr: string };
        user: { email: string; isActive: boolean } | null;
        services: Array<{
            id: string;
            nameEn: string;
            nameAr: string;
            code: string;
        }>;
    },
): DoctorRow {
    const nameParts = doctor.fullNameEn.split(/\s+/);

    return {
        id: doctor.id,
        userId: doctor.userId,
        email: doctor.user?.email ?? null,
        firstName: nameParts[0] ?? doctor.fullNameEn,
        lastName: nameParts.slice(1).join(" "),
        fullName: doctor.fullNameEn,
        specialty: doctor.specialtyEn,
        nationalId: doctor.nationalId,
        scfhsLicenseNumber: doctor.scfhsLicenseNumber,
        professionalRank: doctor.professionalRank,
        clinicId: doctor.clinicId,
        clinicName: doctor.clinic.nameEn,
        commissionRate: doctor.commissionRate.toString(),
        isActive: doctor.isActive,
        accountStatus: !doctor.user ? "NO_ACCOUNT" : doctor.user.isActive ? "ACTIVE" : "INVITED",
        createdAt: doctor.createdAt.toISOString(),
        services: doctor.services,
    };
}

export async function getDoctorsAction(
    input: GetDoctorsInput = {},
): Promise<DoctorActionResult<GetDoctorsData>> {
    try {
        const session = await requirePortalSession("admin");

        const requestedPage =
            Number.isInteger(input.page) && Number(input.page) > 0
                ? Number(input.page)
                : 1;

        const pageSize =
            Number.isInteger(input.pageSize) &&
                Number(input.pageSize) >= 1 &&
                Number(input.pageSize) <= 100
                ? Number(input.pageSize)
                : PAGE_SIZE;

        const search = cleanText(input.search).slice(0, 120);
        const status = input.status ?? "ALL";
        const clinicFilter = cleanText(input.clinicId);

        if (
            clinicFilter &&
            !validUuid(clinicFilter)
        ) {
            return invalid("Select a valid clinic.", "INVALID_CLINIC");
        }

        const clinics = await prisma.clinic.findMany({
            where: {
                organizationId: session.organizationId,
            },
            select: {
                id: true,
                nameEn: true,
                nameAr: true,
                isActive: true,
            },
            orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
        });

        const clinicsInScope = clinicFilter
            ? clinics.filter((clinic) => clinic.id === clinicFilter)
            : clinics;

        if (clinicFilter && clinicsInScope.length === 0) {
            return invalid(
                "The selected clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        const services = await prisma.service.findMany({
            where: {
                organizationId: session.organizationId,
                clinic: {
                    is: {
                        organizationId: session.organizationId,
                    },
                },
                ...(clinicFilter ? { clinicId: clinicFilter } : {}),
            },
            select: {
                id: true,
                clinicId: true,
                nameEn: true,
                nameAr: true,
                code: true,
                isActive: true,
            },
            orderBy: { nameEn: "asc" },
        });

        const clinicIds = clinicsInScope.map((clinic) => clinic.id);

        if (clinicIds.length === 0) {
            return {
                success: true,
                data: {
                    doctors: [],
                    clinics,
                    services,
                    total: 0,
                    page: 1,
                    pageSize,
                    totalPages: 0,
                },
            };
        }

        const where: Prisma.DoctorWhereInput = {
            organizationId: session.organizationId,
            clinicId: clinicFilter
                ? clinicFilter
                : { in: clinicIds },
            ...(status === "ACTIVE" ? { isActive: true } : {}),
            ...(status === "INACTIVE" ? { isActive: false } : {}),
            ...(search
                ? {
                    OR: [
                        { fullNameEn: { contains: search, mode: "insensitive" } },
                        { fullNameAr: { contains: search, mode: "insensitive" } },
                        { nationalId: { contains: search } },
                        {
                            scfhsLicenseNumber: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                        {
                            user: {
                                is: {
                                    email: {
                                        contains: search,
                                        mode: "insensitive",
                                    },
                                },
                            },
                        },
                    ],
                }
                : {}),
        };

        const [total, rows] = await prisma.$transaction([
            prisma.doctor.count({ where }),
            prisma.doctor.findMany({
                where,
                include: {
                    clinic: {
                        select: { nameEn: true, nameAr: true },
                    },
                    user: {
                        select: { email: true, isActive: true },
                    },
                    services: {
                        select: {
                            id: true,
                            nameEn: true,
                            nameAr: true,
                            code: true,
                        },
                        orderBy: { nameEn: "asc" },
                    },
                },
                orderBy: [{ createdAt: "desc" }, { id: "asc" }],
                skip: (requestedPage - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return {
            success: true,
            data: {
                doctors: rows.map(mapDoctor),
                clinics,
                services,
                total,
                page: requestedPage,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    } catch (error) {
        console.error("[getDoctorsAction]", error);

        return {
            success: false,
            error: "Unable to load doctors. Please refresh the page and try again.",
            code: "FETCH_DOCTORS_FAILED",
        };
    }
}

export async function createDoctorAction(
    input: CreateDoctorInput,
): Promise<DoctorActionResult<{ doctor: DoctorRow; emailSent: boolean }>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[createDoctorAction] Authorization failed", error);
        return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
    }

    const email = cleanText(input?.email).toLowerCase();
    const firstName = cleanText(input?.firstName);
    const lastName = cleanText(input?.lastName);
    const nationalId = cleanText(input?.nationalId);
    const license = cleanText(input?.scfhsLicenseNumber).toUpperCase();
    const specialty = cleanText(input?.specialty);
    const clinicId = cleanText(input?.clinicId);
    const rank = input?.professionalRank;
    const serviceIds = Array.isArray(input?.serviceIds)
        ? [...new Set(input.serviceIds.map(cleanText))]
        : [];
    const commissionRate = validCommissionRate(input?.commissionRate);

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return invalid("Enter a valid doctor email address.", "INVALID_EMAIL");
    }

    if (
        !firstName ||
        !PERSON_NAME_PATTERN.test(firstName) ||
        firstName.length > 80
    ) {
        return invalid("Enter a valid first name.", "INVALID_FIRST_NAME");
    }

    if (
        !lastName ||
        !PERSON_NAME_PATTERN.test(lastName) ||
        lastName.length > 80
    ) {
        return invalid("Enter a valid last name.", "INVALID_LAST_NAME");
    }

    if (!NATIONAL_ID_PATTERN.test(nationalId)) {
        return invalid(
            "Enter a valid 10-digit Saudi national ID or Iqama number.",
            "INVALID_NATIONAL_ID",
        );
    }

    if (!LICENSE_PATTERN.test(license)) {
        return invalid(
            "Enter a valid SCFHS license number.",
            "INVALID_LICENSE",
        );
    }

    if (!VALID_RANKS.has(rank)) {
        return invalid("Select a valid professional rank.", "INVALID_RANK");
    }

    if (!specialty || specialty.length > 120) {
        return invalid("Enter a valid medical specialty.", "INVALID_SPECIALTY");
    }

    if (!validUuid(clinicId)) {
        return invalid("Select a valid clinic.", "INVALID_CLINIC");
    }

    if (serviceIds.length === 0) {
        return invalid("Select at least one service.", "SERVICES_REQUIRED");
    }

    if (serviceIds.some((id) => !validUuid(id))) {
        return invalid("One or more selected services are invalid.", "INVALID_SERVICE");
    }

    if (!commissionRate) {
        return invalid(
            "Enter a commission rate between 0 and 100, with up to two decimal places.",
            "INVALID_COMMISSION",
        );
    }

    const fullNameEn = `${firstName} ${lastName}`.trim();

    try {
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(
            Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
        );

        const created = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinic.findFirst({
                where: {
                    id: clinicId,
                    organizationId: session.organizationId,
                    isActive: true,
                },
                select: {
                    id: true,
                    nameEn: true,
                    nameAr: true,
                    specialty: true,
                },
            });

            if (!clinic) {
                throw new Error("CLINIC_NOT_AVAILABLE");
            }

            const availableServices = await tx.service.findMany({
                where: {
                    id: { in: serviceIds },
                    organizationId: session.organizationId,
                    clinicId: clinic.id,
                    isActive: true,
                },
                select: { id: true },
            });

            if (availableServices.length !== serviceIds.length) {
                throw new Error("INVALID_CLINIC_SERVICES");
            }

            const existingUser = await tx.user.findFirst({
                where: {
                    email,
                    organizationId: session.organizationId,
                },
                select: { id: true },
            });

            if (existingUser) {
                throw new Error("DOCTOR_EMAIL_EXISTS");
            }

            const passwordHash = scryptSync(
                randomBytes(48).toString("hex"),
                randomBytes(32),
                64,
            ).toString("hex");

            const user = await tx.user.create({
                data: {
                    organizationId: session.organizationId,
                    email,
                    passwordHash,
                    fullNameEn,
                    fullNameAr: fullNameEn,
                    role: UserRole.DOCTOR,
                    isActive: false,
                },
                select: {
                    id: true,
                    email: true,
                },
            });

            const doctor = await tx.doctor.create({
                data: {
                    organizationId: session.organizationId,
                    clinicId: clinic.id,
                    userId: user.id,
                    fullNameEn,
                    fullNameAr: fullNameEn,
                    specialtyEn: specialty,
                    specialtyAr: specialty,
                    nationalId,
                    identityType: nationalId.startsWith("1")
                        ? IdentityType.NATIONAL_ID
                        : IdentityType.IQAMA,
                    professionalRank: rank,
                    scfhsLicenseNumber: license,
                    commissionRate,
                    isActive: true,
                    services: {
                        connect: availableServices.map((service) => ({
                            id: service.id,
                        })),
                    },
                },
                include: {
                    clinic: {
                        select: { nameEn: true, nameAr: true },
                    },
                    user: {
                        select: { email: true, isActive: true },
                    },
                    services: {
                        select: {
                            id: true,
                            nameEn: true,
                            nameAr: true,
                            code: true,
                        },
                    },
                },
            });

            await tx.doctorOnboardingToken.create({
                data: {
                    organizationId: session.organizationId,
                    userId: user.id,
                    tokenHash,
                    expiresAt,
                },
            });

            return {
                doctor: mapDoctor(doctor),
                email: user.email,
            };
        }, {
            maxWait: 10_000,
            timeout: 20_000,
        });

        let emailSent = false;

        try {
            const apiKey = process.env.RESEND_API_KEY;
            const from = process.env.RESEND_FROM_EMAIL;

            if (!apiKey || !from) {
                throw new Error("Resend email configuration is missing.");
            }

            const resend = new Resend(apiKey);
            const setupUrl = new URL("/auth/setup-password", getBaseUrl());
            setupUrl.searchParams.set("token", token);

            const result = await resend.emails.send({
                from,
                to: created.email,
                subject: "Set up your doctor account",
                html: `
                    <!doctype html>
                    <html lang="en">
                    <body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6">
                      <h2>Welcome to the healthcare portal</h2>
                      <p>Your doctor account has been created. Use the secure link below to set your password and activate your account.</p>
                      <p><a href="${setupUrl.toString()}" style="display:inline-block;padding:12px 20px;background:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px">Set up your password</a></p>
                      <p>This link expires in ${TOKEN_EXPIRY_HOURS} hours and can only be used once.</p>
                      <p>If you were not expecting this invitation, please contact your clinic administrator.</p>
                    </body>
                    </html>
                `,
            });

            if (result.error) {
                console.error("[createDoctorAction] Email provider error", result.error);
            } else {
                emailSent = true;
            }
        } catch (emailError) {
            console.error("[createDoctorAction] Invitation email failed", emailError);
        }

        revalidatePath(MANAGEMENT_PATH);


        return {
            success: true,
            data: {
                doctor: created.doctor,
                emailSent,
            },
            ...(emailSent
                ? {}
                : {
                    error: "The doctor was created, but the invitation email could not be sent. Resend the invitation after checking the email configuration.",
                    code: "INVITATION_EMAIL_FAILED",
                }),
        };
    } catch (error) {
        if (error instanceof Error) {
            switch (error.message) {
                case "CLINIC_NOT_AVAILABLE":
                    return invalid(
                        "The selected clinic is inactive or unavailable.",
                        "CLINIC_NOT_AVAILABLE",
                    );
                case "INVALID_CLINIC_SERVICES":
                    return invalid(
                        "Select only active services belonging to the selected clinic.",
                        "INVALID_CLINIC_SERVICES",
                    );
                case "DOCTOR_EMAIL_EXISTS":
                    return invalid(
                        "A user with this email already exists in your organization.",
                        "DUPLICATE_EMAIL",
                    );
            }
        }

        return databaseError("createDoctorAction", error);
    }
}

export async function getDoctorOptionsAction(): Promise<
    DoctorActionResult<{
        clinics: DoctorClinicOption[];
        services: DoctorServiceOption[];
    }>
> {
    try {
        const session = await requirePortalSession("admin");

        const [clinics, services] = await Promise.all([
            prisma.clinic.findMany({
                where: {
                    organizationId: session.organizationId,
                    isActive: true,
                },
                select: {
                    id: true,
                    nameEn: true,
                    nameAr: true,
                    isActive: true,
                },
                orderBy: { nameEn: "asc" },
            }),
            prisma.service.findMany({
                where: {
                    organizationId: session.organizationId,
                    isActive: true,
                    clinic: {
                        is: {
                            organizationId: session.organizationId,
                            isActive: true,
                        },
                    },
                },
                select: {
                    id: true,
                    clinicId: true,
                    nameEn: true,
                    nameAr: true,
                    code: true,
                    isActive: true,
                },
                orderBy: { nameEn: "asc" },
            }),
        ]);

        return {
            success: true,
            data: { clinics, services },
        };
    } catch (error) {
        return databaseError("getDoctorOptionsAction", error);
    }
}
export async function getDoctorFormOptions(): Promise<DoctorActionResult<{ clinics: DoctorClinicOption[]; services: DoctorServiceOption[] }>> {
    return getDoctorOptionsAction();
}
