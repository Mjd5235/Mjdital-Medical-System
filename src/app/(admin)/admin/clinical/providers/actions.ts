"use server";

import {
    DoctorProfessionalRank,
    IdentityType,
    Prisma,
    UserRole,
} from "@prisma/client";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma, prismaBase } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";

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
    specialtyAr: string;
    nationalId: string;
    identityType: IdentityType;
    scfhsLicenseNumber: string;
    professionalRank: DoctorProfessionalRank;
    clinicId: string;
    clinicName: string;
    commissionRate: string;
    isActive: boolean;
    mustChangePassword: boolean;
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
    specialtyAr?: string;
    clinicId: string;
    serviceIds: string[];
    commissionRate: string | number;
    /** Optional. When empty the server generates a secure temporary password. */
    temporaryPassword?: string;
}

export interface UpdateDoctorInput extends CreateDoctorInput {
    doctorId: string;
}

export interface CreateDoctorResultData {
    doctor: DoctorRow;
    emailSent: boolean;
    /** Plain-text password, only returned when the server had to generate one. */
    generatedPassword: string | null;
}

export interface UpdateDoctorResultData {
    doctor: DoctorRow;
    /** Plain-text password, only returned when the server had to generate one. */
    generatedPassword: string | null;
}

export interface RegeneratePasswordResultData {
    email: string;
    /** Plain-text (NOT hashed) temporary password for the admin to copy. */
    temporaryPassword: string;
}

const VALID_RANKS = new Set<string>(Object.values(DoctorProfessionalRank));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIONAL_ID_PATTERN = /^[12]\d{9}$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./-]{2,49}$/;
const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;

const PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SYMBOLS = "!@#$%&*?";

const doctorInclude = {
    clinic: {
        select: { nameEn: true, nameAr: true },
    },
    user: {
        select: { email: true, isActive: true, mustChangePassword: true },
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
} satisfies Prisma.DoctorInclude;

type DoctorWithRelations = Prisma.DoctorGetPayload<{
    include: typeof doctorInclude;
}>;

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function pickFrom(set: string): string {
    return set[randomInt(set.length)] as string;
}

function generateTemporaryPassword(length = 14): string {
    const all = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SYMBOLS;
    const chars = [
        pickFrom(PASSWORD_UPPER),
        pickFrom(PASSWORD_LOWER),
        pickFrom(PASSWORD_DIGITS),
        pickFrom(PASSWORD_SYMBOLS),
    ];

    while (chars.length < length) {
        chars.push(pickFrom(all));
    }

    for (let index = chars.length - 1; index > 0; index--) {
        const swap = randomInt(index + 1);
        [chars[index], chars[swap]] = [chars[swap] as string, chars[index] as string];
    }

    return chars.join("");
}

function isAcceptablePassword(value: string): boolean {
    return (
        value.length >= 8 &&
        value.length <= 128 &&
        !/\s/.test(value) &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /\d/.test(value)
    );
}

function validCommissionRate(value: unknown): Prisma.Decimal | null {
    const normalized = String(value ?? "").trim();

    if (!/^(?:\d{1,2})(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/.test(normalized)) {
        return null;
    }

    try {
        const rate = new Prisma.Decimal(normalized);

        if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) {
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

function mappedTransactionError<T>(error: unknown): DoctorActionResult<T> | null {
    if (!(error instanceof Error)) return null;

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
                "A user with this email already exists.",
                "DUPLICATE_EMAIL",
            );
        default:
            return null;
    }
}

function getBaseUrl(): string {
    const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;

    if (!configured) {
        throw new Error("APP_URL is not configured.");
    }

    const url = new URL(configured);

    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
        throw new Error("APP_URL must use HTTPS in production.");
    }

    return url.origin;
}

function mapDoctor(doctor: DoctorWithRelations): DoctorRow {
    const nameParts = doctor.fullNameEn.split(/\s+/);
    const mustChangePassword = Boolean(doctor.user?.mustChangePassword);

    return {
        id: doctor.id,
        userId: doctor.userId,
        email: doctor.user?.email ?? null,
        firstName: nameParts[0] ?? doctor.fullNameEn,
        lastName: nameParts.slice(1).join(" "),
        fullName: doctor.fullNameEn,
        specialty: doctor.specialtyEn,
        specialtyAr: doctor.specialtyAr,
        nationalId: doctor.nationalId,
        identityType: doctor.identityType,
        scfhsLicenseNumber: doctor.scfhsLicenseNumber,
        professionalRank: doctor.professionalRank,
        clinicId: doctor.clinicId,
        clinicName: doctor.clinic.nameEn,
        commissionRate: doctor.commissionRate.toString(),
        isActive: doctor.isActive,
        mustChangePassword,
        accountStatus: !doctor.user
            ? "NO_ACCOUNT"
            : mustChangePassword || !doctor.user.isActive
                ? "INVITED"
                : "ACTIVE",
        createdAt: doctor.createdAt.toISOString(),
        services: doctor.services,
    };
}

type ParsedDoctorInput = {
    email: string;
    firstName: string;
    lastName: string;
    fullNameEn: string;
    nationalId: string;
    license: string;
    specialty: string;
    specialtyAr: string;
    clinicId: string;
    rank: DoctorProfessionalRank;
    serviceIds: string[];
    commissionRate: Prisma.Decimal;
    temporaryPassword: string;
};

function parseDoctorInput(
    input: CreateDoctorInput,
): { ok: true; value: ParsedDoctorInput } | { ok: false; error: string; code: string } {
    const email = cleanText(input?.email).toLowerCase();
    const firstName = cleanText(input?.firstName);
    const lastName = cleanText(input?.lastName);
    const nationalId = cleanText(input?.nationalId);
    const license = cleanText(input?.scfhsLicenseNumber).toUpperCase();
    const specialty = cleanText(input?.specialty);
    const specialtyAr = cleanText(input?.specialtyAr) || specialty;
    const clinicId = cleanText(input?.clinicId);
    const rank = input?.professionalRank;
    const serviceIds = Array.isArray(input?.serviceIds)
        ? [...new Set(input.serviceIds.map(cleanText))]
        : [];
    const commissionRate = validCommissionRate(input?.commissionRate);
    const temporaryPassword =
        typeof input?.temporaryPassword === "string" ? input.temporaryPassword : "";

    const fail = (error: string, code: string) =>
        ({ ok: false, error, code }) as const;

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return fail("Enter a valid doctor email address.", "INVALID_EMAIL");
    }

    if (!firstName || !PERSON_NAME_PATTERN.test(firstName) || firstName.length > 80) {
        return fail("Enter a valid first name.", "INVALID_FIRST_NAME");
    }

    if (!lastName || !PERSON_NAME_PATTERN.test(lastName) || lastName.length > 80) {
        return fail("Enter a valid last name.", "INVALID_LAST_NAME");
    }

    if (temporaryPassword && !isAcceptablePassword(temporaryPassword)) {
        return fail(
            "The temporary password must be 8–128 characters with uppercase, lowercase and a number, and no spaces.",
            "INVALID_PASSWORD",
        );
    }

    if (!NATIONAL_ID_PATTERN.test(nationalId)) {
        return fail(
            "Enter a valid 10-digit Saudi national ID or Iqama number.",
            "INVALID_NATIONAL_ID",
        );
    }

    if (!LICENSE_PATTERN.test(license)) {
        return fail("Enter a valid SCFHS license number.", "INVALID_LICENSE");
    }

    if (!VALID_RANKS.has(rank)) {
        return fail("Select a valid professional rank.", "INVALID_RANK");
    }

    if (!specialty || specialty.length > 120 || specialtyAr.length > 120) {
        return fail("Enter a valid medical specialty.", "INVALID_SPECIALTY");
    }

    if (!validUuid(clinicId)) {
        return fail("Select a valid clinic.", "INVALID_CLINIC");
    }

    if (serviceIds.length === 0) {
        return fail("Select at least one service.", "SERVICES_REQUIRED");
    }

    if (serviceIds.some((id) => !validUuid(id))) {
        return fail("One or more selected services are invalid.", "INVALID_SERVICE");
    }

    if (!commissionRate) {
        return fail(
            "Enter a commission rate between 0 and 100, with up to two decimal places.",
            "INVALID_COMMISSION",
        );
    }

    return {
        ok: true,
        value: {
            email,
            firstName,
            lastName,
            fullNameEn: `${firstName} ${lastName}`.trim(),
            nationalId,
            license,
            specialty,
            specialtyAr,
            clinicId,
            rank,
            serviceIds,
            commissionRate,
            temporaryPassword,
        },
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

        if (clinicFilter && !validUuid(clinicFilter)) {
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
            clinicId: clinicFilter ? clinicFilter : { in: clinicIds },
            ...(status === "ACTIVE" ? { isActive: true } : {}),
            ...(status === "INACTIVE" ? { isActive: false } : {}),
            ...(status === "INVITED"
                ? { user: { is: { mustChangePassword: true } } }
                : {}),
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
                include: doctorInclude,
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
): Promise<DoctorActionResult<CreateDoctorResultData>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[createDoctorAction] Authorization failed", error);
        return invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
    }

    const parsed = parseDoctorInput(input);

    if (!parsed.ok) {
        return invalid(parsed.error, parsed.code);
    }

    const v = parsed.value;

    try {
        const plainPassword = v.temporaryPassword || generateTemporaryPassword();
        const generatedPassword = v.temporaryPassword ? null : plainPassword;
        const passwordHash = await hashPassword(plainPassword);

        const created = await prisma.$transaction(
            async (tx) => {
                const clinic = await tx.clinic.findFirst({
                    where: {
                        id: v.clinicId,
                        organizationId: session.organizationId,
                        isActive: true,
                    },
                    select: { id: true },
                });

                if (!clinic) {
                    throw new Error("CLINIC_NOT_AVAILABLE");
                }

                const availableServices = await tx.service.findMany({
                    where: {
                        id: { in: v.serviceIds },
                        organizationId: session.organizationId,
                        clinicId: clinic.id,
                        isActive: true,
                    },
                    select: { id: true },
                });

                if (availableServices.length !== v.serviceIds.length) {
                    throw new Error("INVALID_CLINIC_SERVICES");
                }

                const existingUser = await tx.user.findUnique({
                    where: { email: v.email },
                    select: { id: true },
                });

                if (existingUser) {
                    throw new Error("DOCTOR_EMAIL_EXISTS");
                }

                const user = await tx.user.create({
                    data: {
                        organizationId: session.organizationId,
                        email: v.email,
                        passwordHash,
                        fullNameEn: v.fullNameEn,
                        fullNameAr: v.fullNameEn,
                        role: UserRole.DOCTOR,
                        isActive: true,
                        mustChangePassword: true,
                    },
                    select: { id: true },
                });

                const doctor = await tx.doctor.create({
                    data: {
                        organizationId: session.organizationId,
                        clinicId: clinic.id,
                        userId: user.id,
                        fullNameEn: v.fullNameEn,
                        fullNameAr: v.fullNameEn,
                        specialtyEn: v.specialty,
                        specialtyAr: v.specialtyAr,
                        nationalId: v.nationalId,
                        identityType: v.nationalId.startsWith("1")
                            ? IdentityType.NATIONAL_ID
                            : IdentityType.IQAMA,
                        professionalRank: v.rank,
                        scfhsLicenseNumber: v.license,
                        commissionRate: v.commissionRate,
                        isActive: true,
                        services: {
                            connect: availableServices.map((service) => ({
                                id: service.id,
                            })),
                        },
                    },
                    include: doctorInclude,
                });

                return mapDoctor(doctor);
            },
            { maxWait: 10_000, timeout: 20_000 },
        );

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: {
                doctor: created,
                emailSent: false,
                generatedPassword,
            },
        };
    } catch (error) {
        return mappedTransactionError<CreateDoctorResultData>(error) ??
            databaseError("createDoctorAction", error);
    }
}

export async function updateDoctorAction(
    input: UpdateDoctorInput,
): Promise<DoctorActionResult<UpdateDoctorResultData>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[updateDoctorAction] Authorization failed", error);
        return invalid(
            "Your session has expired. Sign in and try again.",
            "UNAUTHORIZED",
        );
    }

    const doctorId = cleanText(input?.doctorId);

    if (!validUuid(doctorId)) {
        return invalid("The selected doctor is invalid.", "INVALID_DOCTOR");
    }

    const parsed = parseDoctorInput(input);

    if (!parsed.ok) {
        return invalid(parsed.error, parsed.code);
    }

    const v = parsed.value;

    try {
        // Resolve the authenticated organization's clinic scope first.
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        // IMPORTANT: clinicId is mandatory for Doctor.findFirst.
        const existing = await prisma.doctor.findFirst({
            where: {
                id: doctorId,
                organizationId: session.organizationId,
                clinicId: {
                    in: clinicIds,
                },
            },
            select: {
                userId: true,
                clinicId: true,
            },
        });

        if (!existing) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        let plainPassword: string | null = v.temporaryPassword || null;
        let generatedPassword: string | null = null;

        if (!plainPassword && !existing.userId) {
            plainPassword = generateTemporaryPassword();
            generatedPassword = plainPassword;
        }

        const passwordHash = plainPassword
            ? await hashPassword(plainPassword)
            : null;

        const updated = await prisma.$transaction(
            async (tx) => {
                const clinic = await tx.clinic.findFirst({
                    where: {
                        id: v.clinicId,
                        organizationId: session.organizationId,
                        ...(v.clinicId === existing.clinicId
                            ? {}
                            : { isActive: true }),
                    },
                    select: {
                        id: true,
                    },
                });

                if (!clinic) {
                    throw new Error("CLINIC_NOT_AVAILABLE");
                }

                const availableServices = await tx.service.findMany({
                    where: {
                        id: {
                            in: v.serviceIds,
                        },
                        organizationId: session.organizationId,
                        clinicId: clinic.id,
                        isActive: true,
                    },
                    select: {
                        id: true,
                    },
                });

                if (availableServices.length !== v.serviceIds.length) {
                    throw new Error("INVALID_CLINIC_SERVICES");
                }

                const emailOwner = await tx.user.findFirst({
                    where: {
                        email: v.email,
                        organizationId: session.organizationId,
                    },
                    select: {
                        id: true,
                    },
                });

                let userId = existing.userId;

                if (userId) {
                    if (emailOwner && emailOwner.id !== userId) {
                        throw new Error("DOCTOR_EMAIL_EXISTS");
                    }

                    await tx.user.update({
                        where: {
                            id: userId,
                        },
                        data: {
                            email: v.email,
                            fullNameEn: v.fullNameEn,
                            fullNameAr: v.fullNameEn,
                            ...(passwordHash
                                ? {
                                    passwordHash,
                                    mustChangePassword: true,
                                }
                                : {}),
                        },
                    });
                } else {
                    if (emailOwner) {
                        throw new Error("DOCTOR_EMAIL_EXISTS");
                    }

                    const user = await tx.user.create({
                        data: {
                            organizationId: session.organizationId,
                            email: v.email,
                            passwordHash: passwordHash as string,
                            fullNameEn: v.fullNameEn,
                            fullNameAr: v.fullNameEn,
                            role: UserRole.DOCTOR,
                            isActive: true,
                            mustChangePassword: true,
                        },
                        select: {
                            id: true,
                        },
                    });

                    userId = user.id;
                }

                // Include the ORIGINAL clinicId in the update filter.
                // This allows moving the doctor to another clinic safely.
                return tx.doctor.update({
                    where: {
                        id: doctorId,
                        organizationId: session.organizationId,
                        clinicId: existing.clinicId,
                    },
                    data: {
                        clinicId: clinic.id,
                        userId,
                        fullNameEn: v.fullNameEn,
                        fullNameAr: v.fullNameEn,
                        specialtyEn: v.specialty,
                        specialtyAr: v.specialtyAr,
                        nationalId: v.nationalId,
                        identityType: v.nationalId.startsWith("1")
                            ? IdentityType.NATIONAL_ID
                            : IdentityType.IQAMA,
                        professionalRank: v.rank,
                        scfhsLicenseNumber: v.license,
                        commissionRate: v.commissionRate,
                        services: {
                            set: availableServices.map((service) => ({
                                id: service.id,
                            })),
                        },
                    },
                    include: doctorInclude,
                });
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: {
                doctor: mapDoctor(updated),
                generatedPassword,
            },
        };
    } catch (error) {
        return (
            mappedTransactionError<UpdateDoctorResultData>(error) ??
            databaseError("updateDoctorAction", error)
        );
    }
}

export async function deleteDoctorAction(
    doctorId: string,
): Promise<DoctorActionResult<{ id: string }>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error("[deleteDoctorAction] Authorization failed", error);

        return invalid(
            "Your session has expired. Sign in and try again.",
            "UNAUTHORIZED",
        );
    }

    const id = cleanText(doctorId);

    if (!validUuid(id)) {
        return invalid(
            "The selected doctor is invalid.",
            "INVALID_DOCTOR",
        );
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const doctor = await prisma.doctor.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: {
                id: true,
                clinicId: true,
                userId: true,
            },
        });

        if (!doctor) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const actorId = (
            session as unknown as { userId?: string }
        ).userId;

        if (
            doctor.userId &&
            actorId &&
            doctor.userId === actorId
        ) {
            return invalid(
                "You cannot delete the account you are currently signed in with.",
                "CANNOT_DELETE_SELF",
            );
        }

        const result = await prismaBase.$transaction(
            async (tx) => {
                // Recheck the doctor inside the transaction.
                // All filters are explicitly scoped to the current tenant.
                const currentDoctor = await tx.doctor.findFirst({
                    where: {
                        id: doctor.id,
                        organizationId: session.organizationId,
                        clinicId: doctor.clinicId,
                    },
                    select: {
                        id: true,
                        clinicId: true,
                        userId: true,
                    },
                });

                if (!currentDoctor) {
                    return {
                        status: "not-found" as const,
                    };
                }

                // Prevent deletion when appointment history exists.
                const appointmentCount = await tx.appointment.count({
                    where: {
                        organizationId: session.organizationId,
                        clinicId: currentDoctor.clinicId,
                        doctorId: currentDoctor.id,
                    },
                });

                if (appointmentCount > 0) {
                    return {
                        status: "has-appointments" as const,
                    };
                }

                if (currentDoctor.userId) {
                    // Explicitly remove this user's audit logs within
                    // the current organization only.
                    //
                    // This operation uses prismaBase intentionally because
                    // the normal Prisma client enforces append-only logs.
                    await tx.auditLog.deleteMany({
                        where: {
                            organizationId: session.organizationId,
                            userId: currentDoctor.userId,
                        },
                    });
                }

                // Delete the professional doctor record.
                await tx.doctor.delete({
                    where: {
                        id: currentDoctor.id,
                        organizationId: session.organizationId,
                        clinicId: currentDoctor.clinicId,
                    },
                });

                if (currentDoctor.userId) {
                    // Delete the associated user account only after
                    // removing its audit logs.
                    await tx.user.delete({
                        where: {
                            id: currentDoctor.userId,
                            organizationId: session.organizationId,
                        },
                    });
                }

                return {
                    status: "deleted" as const,
                    id: currentDoctor.id,
                };
            },
            {
                maxWait: 10_000,
                timeout: 20_000,
            },
        );

        if (result.status === "not-found") {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        if (result.status === "has-appointments") {
            return invalid(
                "This doctor has appointment history and cannot be deleted. Deactivate the account instead.",
                "HAS_APPOINTMENTS",
            );
        }

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: {
                id: result.id,
            },
        };
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2003"
        ) {
            console.error(
                "[deleteDoctorAction] Foreign key constraint:",
                error,
            );

            return invalid(
                "This doctor or user is still referenced by other records and cannot be deleted.",
                "HAS_RELATED_RECORDS",
            );
        }

        console.error("[deleteDoctorAction] Error:", error);

        return databaseError("deleteDoctorAction", error);
    }
}

export async function regenerateTempPasswordAction(
    doctorId: string,
): Promise<DoctorActionResult<RegeneratePasswordResultData>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error(
            "[regenerateTempPasswordAction] Authorization failed",
            error,
        );

        return invalid(
            "Your session has expired. Sign in and try again.",
            "UNAUTHORIZED",
        );
    }

    const id = cleanText(doctorId);

    if (!validUuid(id)) {
        return invalid("The selected doctor is invalid.", "INVALID_DOCTOR");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(
            session.organizationId,
        );

        if (clinicIds.length === 0) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        // IMPORTANT: clinicId is required by the Doctor tenant middleware.
        const doctor = await prisma.doctor.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: {
                    in: clinicIds,
                },
            },
            select: {
                clinicId: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        mustChangePassword: true,
                    },
                },
            },
        });

        if (!doctor) {
            return invalid(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        if (!doctor.user) {
            return invalid(
                "This doctor does not have a user account.",
                "NO_ACCOUNT",
            );
        }

        if (!doctor.user.mustChangePassword) {
            return invalid(
                "A temporary password can only be regenerated for invited accounts that have not set their own password yet.",
                "NOT_INVITED",
            );
        }

        const temporaryPassword = generateTemporaryPassword();

        const passwordHash = await hashPassword(temporaryPassword);

        await prisma.user.update({
            where: {
                id: doctor.user.id,
                organizationId: session.organizationId,
            },
            data: {
                passwordHash,
                mustChangePassword: true,
            },
        });

        revalidatePath(MANAGEMENT_PATH);

        return {
            success: true,
            data: {
                email: doctor.user.email,
                temporaryPassword,
            },
        };
    } catch (error) {
        return databaseError("regenerateTempPasswordAction", error);
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

export async function getDoctorFormOptions(): Promise<
    DoctorActionResult<{
        clinics: DoctorClinicOption[];
        services: DoctorServiceOption[];
    }>
> {
    return getDoctorOptionsAction();
}

async function getOrganizationClinicIds(
    organizationId: string,
): Promise<string[]> {
    const clinics = await prisma.clinic.findMany({
        where: {
            organizationId,
        },
        select: {
            id: true,
        },
    });

    return clinics.map((clinic) => clinic.id);
}