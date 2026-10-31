// app/admin/clinical/schedules/actions.ts
"use server";

import { AppointmentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const SCHEDULES_PATH = "/admin/clinical/schedules";
const MAX_SHIFTS = 2000;
const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 240;
const MINUTES_IN_DAY = 24 * 60;
const FALLBACK_TIMEZONE = "Asia/Riyadh";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export interface ShiftActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface ShiftClinicOption {
    id: string;
    nameEn: string;
    nameAr: string;
    isActive: boolean;
}

export interface ShiftServiceOption {
    id: string;
    clinicId: string;
    nameEn: string;
    nameAr: string;
    code: string;
    isActive: boolean;
}

export interface ShiftDoctorOption {
    id: string;
    clinicId: string;
    fullNameEn: string;
    fullNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    isActive: boolean;
    serviceIds: string[];
}

export interface ShiftRow {
    id: string;
    doctorId: string;
    doctorNameEn: string;
    doctorNameAr: string;
    specialtyEn: string;
    specialtyAr: string;
    clinicId: string;
    clinicNameEn: string;
    clinicNameAr: string;
    serviceId: string;
    serviceNameEn: string;
    serviceNameAr: string;
    /** 0 = Sunday ... 6 = Saturday */
    daysOfWeek: number[];
    /** "HH:mm" (24h) */
    startTime: string;
    endTime: string;
    startMinute: number;
    endMinute: number;
    slotDurationMinutes: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ShiftInput {
    doctorId: string;
    clinicId: string;
    serviceId: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    isActive?: boolean;
}

export interface UpdateShiftInput extends ShiftInput {
    shiftId: string;
}

export interface GetShiftsInput {
    doctorId?: string;
    clinicId?: string;
    /** 0 = Sunday ... 6 = Saturday */
    dayOfWeek?: number;
    status?: "ALL" | "ACTIVE" | "PAUSED";
}

export interface ShiftOptionsData {
    clinics: ShiftClinicOption[];
    services: ShiftServiceOption[];
    doctors: ShiftDoctorOption[];
}

export interface ShiftsPageData extends ShiftOptionsData {
    shifts: ShiftRow[];
}

export interface ShiftMutationData {
    shift: ShiftRow;
}

export interface DeleteShiftData {
    id: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Includes                                 */
/* -------------------------------------------------------------------------- */

const shiftInclude = {
    doctor: {
        select: {
            fullNameEn: true,
            fullNameAr: true,
            specialtyEn: true,
            specialtyAr: true,
        },
    },
    clinic: {
        select: {
            nameEn: true,
            nameAr: true,
            timezone: true,
        },
    },
    service: {
        select: {
            nameEn: true,
            nameAr: true,
        },
    },
} satisfies Prisma.ShiftInclude;

type ShiftWithRelations = Prisma.ShiftGetPayload<{
    include: typeof shiftInclude;
}>;

/** Transaction client type that also works with extended / middleware clients. */
type TxClient = Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function pad(value: number): string {
    return value.toString().padStart(2, "0");
}

function minutesToTime(total: number): string {
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function parseTime(value: string): number | null {
    const match = TIME_PATTERN.exec(value);

    if (!match) return null;

    return Number(match[1]) * 60 + Number(match[2]);
}

function failure<T>(error: string, code = "INVALID_INPUT"): ShiftActionResult<T> {
    return { success: false, error, code };
}

function databaseError<T>(action: string, error: unknown): ShiftActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2003":
                return failure(
                    "A selected doctor, clinic or service is no longer available.",
                    "INVALID_RELATION",
                );
            case "P2025":
                return failure(
                    "The requested shift could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
            case "P2034":
                return failure(
                    "Another change was made at the same time. Please try again.",
                    "WRITE_CONFLICT",
                );
        }
    }

    return failure(
        "The operation could not be completed. Please try again.",
        "DATABASE_ERROR",
    );
}

const TRANSACTION_ERRORS: Record<string, { message: string; code: string }> = {
    CLINIC_NOT_AVAILABLE: {
        message: "The selected clinic is inactive or unavailable.",
        code: "CLINIC_NOT_AVAILABLE",
    },
    DOCTOR_NOT_AVAILABLE: {
        message:
            "The selected doctor is inactive, unavailable, or does not belong to the selected clinic.",
        code: "DOCTOR_NOT_AVAILABLE",
    },
    SERVICE_NOT_AVAILABLE: {
        message:
            "The selected service is inactive or does not belong to the selected clinic.",
        code: "SERVICE_NOT_AVAILABLE",
    },
    SERVICE_NOT_ASSIGNED: {
        message: "The selected service is not assigned to this doctor.",
        code: "SERVICE_NOT_ASSIGNED",
    },
    SHIFT_OVERLAP: {
        message:
            "This doctor already has an active shift that overlaps the selected days and times.",
        code: "SHIFT_OVERLAP",
    },
    SHIFT_NOT_FOUND: {
        message: "The requested shift could not be found. Refresh and try again.",
        code: "RECORD_NOT_FOUND",
    },
};

function mappedTransactionError<T>(error: unknown): ShiftActionResult<T> | null {
    if (!(error instanceof Error)) return null;

    const mapped = TRANSACTION_ERRORS[error.message];

    return mapped ? failure(mapped.message, mapped.code) : null;
}

async function authorize() {
    try {
        return await requirePortalSession("admin");
    } catch (error) {
        console.error("[shifts] Authorization failed", error);
        return null;
    }
}

function unauthorized<T>(): ShiftActionResult<T> {
    return failure("Your session has expired. Sign in and try again.", "UNAUTHORIZED");
}

async function getOrganizationClinicIds(organizationId: string): Promise<string[]> {
    const clinics = await prisma.clinic.findMany({
        where: { organizationId },
        select: { id: true },
    });

    return clinics.map((clinic) => clinic.id);
}

function mapShift(shift: ShiftWithRelations): ShiftRow {
    return {
        id: shift.id,
        doctorId: shift.doctorId,
        doctorNameEn: shift.doctor.fullNameEn,
        doctorNameAr: shift.doctor.fullNameAr,
        specialtyEn: shift.doctor.specialtyEn,
        specialtyAr: shift.doctor.specialtyAr,
        clinicId: shift.clinicId,
        clinicNameEn: shift.clinic.nameEn,
        clinicNameAr: shift.clinic.nameAr,
        serviceId: shift.serviceId,
        serviceNameEn: shift.service.nameEn,
        serviceNameAr: shift.service.nameAr,
        daysOfWeek: [...shift.daysOfWeek].sort((a, b) => a - b),
        startTime: minutesToTime(shift.startMinute),
        endTime: minutesToTime(shift.endMinute),
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
        slotDurationMinutes: shift.slotDurationMinutes,
        isActive: shift.isActive,
        createdAt: shift.createdAt.toISOString(),
        updatedAt: shift.updatedAt.toISOString(),
    };
}

function localDayAndMinute(
    date: Date,
    timeZone: string,
): { day: number; minute: number } {
    const build = (zone: string) =>
        new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(date);

    let parts: Intl.DateTimeFormatPart[];

    try {
        parts = build(timeZone || FALLBACK_TIMEZONE);
    } catch {
        parts = build(FALLBACK_TIMEZONE);
    }

    const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

    return {
        day: WEEKDAY_INDEX[weekday] ?? 0,
        minute: hour * 60 + minute,
    };
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

type ParsedShiftInput = {
    doctorId: string;
    clinicId: string;
    serviceId: string;
    days: number[];
    startMinute: number;
    endMinute: number;
    slot: number;
    isActive: boolean;
};

function parseShiftInput(
    input: ShiftInput,
): { ok: true; value: ParsedShiftInput } | { ok: false; error: string; code: string } {
    const fail = (error: string, code: string) => ({ ok: false, error, code }) as const;

    const doctorId = cleanText(input?.doctorId);
    const clinicId = cleanText(input?.clinicId);
    const serviceId = cleanText(input?.serviceId);

    if (!validUuid(doctorId)) return fail("Select a valid doctor.", "INVALID_DOCTOR");
    if (!validUuid(clinicId)) return fail("Select a valid clinic.", "INVALID_CLINIC");
    if (!validUuid(serviceId)) return fail("Select a valid service.", "INVALID_SERVICE");

    const rawDays: unknown[] = Array.isArray(input?.daysOfWeek) ? input.daysOfWeek : [];
    const days = [...new Set(rawDays)];

    if (
        days.length === 0 ||
        days.length > 7 ||
        days.some(
            (day) => typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6,
        )
    ) {
        return fail("Select at least one valid day of the week.", "INVALID_DAYS");
    }

    const startMinute = parseTime(cleanText(input?.startTime));
    const endMinute = parseTime(cleanText(input?.endTime));

    if (startMinute === null || endMinute === null) {
        return fail("Enter valid start and end times (HH:mm).", "INVALID_TIME");
    }

    if (endMinute <= startMinute || endMinute > MINUTES_IN_DAY) {
        return fail("The end time must be after the start time.", "INVALID_TIME_RANGE");
    }

    const slot = Number(input?.slotDurationMinutes);

    if (!Number.isInteger(slot) || slot < MIN_SLOT_MINUTES || slot > MAX_SLOT_MINUTES) {
        return fail(
            `Slot duration must be a whole number between ${MIN_SLOT_MINUTES} and ${MAX_SLOT_MINUTES} minutes.`,
            "INVALID_SLOT",
        );
    }

    if (endMinute - startMinute < slot) {
        return fail("The shift must be long enough for at least one slot.", "SLOT_TOO_LONG");
    }

    return {
        ok: true,
        value: {
            doctorId,
            clinicId,
            serviceId,
            days: (days as number[]).sort((a, b) => a - b),
            startMinute,
            endMinute,
            slot,
            isActive: input?.isActive !== false,
        },
    };
}

/* -------------------------------------------------------------------------- */
/*                            Transactional guards                            */
/* -------------------------------------------------------------------------- */

async function assertShiftReferences(
    tx: TxClient,
    organizationId: string,
    v: { doctorId: string; clinicId: string; serviceId: string; isActive: boolean },
): Promise<void> {
    // Paused shifts may keep references to deactivated entities; active ones may not.
    const activeOnly = v.isActive ? { isActive: true } : {};

    const clinic = await tx.clinic.findFirst({
        where: { id: v.clinicId, organizationId, ...activeOnly },
        select: { id: true },
    });

    if (!clinic) throw new Error("CLINIC_NOT_AVAILABLE");

    // clinicId is always part of the filter (tenant isolation).
    const doctor = await tx.doctor.findFirst({
        where: { id: v.doctorId, organizationId, clinicId: clinic.id, ...activeOnly },
        select: { id: true, services: { select: { id: true } } },
    });

    if (!doctor) throw new Error("DOCTOR_NOT_AVAILABLE");

    const service = await tx.service.findFirst({
        where: { id: v.serviceId, organizationId, clinicId: clinic.id, ...activeOnly },
        select: { id: true },
    });

    if (!service) throw new Error("SERVICE_NOT_AVAILABLE");

    if (!doctor.services.some((item) => item.id === service.id)) {
        throw new Error("SERVICE_NOT_ASSIGNED");
    }
}

async function assertNoOverlap(
    tx: TxClient,
    organizationId: string,
    v: {
        doctorId: string;
        clinicId: string;
        days: number[];
        startMinute: number;
        endMinute: number;
        isActive: boolean;
    },
    excludeShiftId?: string,
): Promise<void> {
    if (!v.isActive) return;

    const conflict = await tx.shift.findFirst({
        where: {
            organizationId,
            clinicId: v.clinicId,
            doctorId: v.doctorId,
            isActive: true,
            ...(excludeShiftId ? { id: { not: excludeShiftId } } : {}),
            daysOfWeek: { hasSome: v.days },
            startMinute: { lt: v.endMinute },
            endMinute: { gt: v.startMinute },
        },
        select: { id: true },
    });

    if (conflict) throw new Error("SHIFT_OVERLAP");
}

async function countAffectedAppointments(shift: {
    organizationId: string;
    clinicId: string;
    doctorId: string;
    daysOfWeek: number[];
    startMinute: number;
    endMinute: number;
    timezone: string;
}): Promise<number> {
    const upcoming = await prisma.appointment.findMany({
        where: {
            organizationId: shift.organizationId,
            clinicId: shift.clinicId,
            doctorId: shift.doctorId,
            scheduledAt: { gte: new Date() },
            status: {
                in: [
                    AppointmentStatus.SCHEDULED,
                    AppointmentStatus.CONFIRMED,
                    AppointmentStatus.WAITING,
                ],
            },
        },
        select: { scheduledAt: true },
        take: 1000,
    });

    return upcoming.filter((appointment) => {
        const { day, minute } = localDayAndMinute(appointment.scheduledAt, shift.timezone);

        return (
            shift.daysOfWeek.includes(day) &&
            minute >= shift.startMinute &&
            minute < shift.endMinute
        );
    }).length;
}

const SERIALIZABLE_OPTIONS = {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 20_000,
} as const;

/* -------------------------------------------------------------------------- */
/*                                    Reads                                   */
/* -------------------------------------------------------------------------- */

async function loadOptions(
    organizationId: string,
): Promise<{ options: ShiftOptionsData; clinicIds: string[] }> {
    const clinics = await prisma.clinic.findMany({
        where: { organizationId },
        select: { id: true, nameEn: true, nameAr: true, isActive: true },
        orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
    });

    const clinicIds = clinics.map((clinic) => clinic.id);

    if (clinicIds.length === 0) {
        return { options: { clinics, services: [], doctors: [] }, clinicIds };
    }

    const [services, doctors] = await Promise.all([
        prisma.service.findMany({
            where: { organizationId, clinicId: { in: clinicIds } },
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
        prisma.doctor.findMany({
            where: { organizationId, clinicId: { in: clinicIds } },
            select: {
                id: true,
                clinicId: true,
                fullNameEn: true,
                fullNameAr: true,
                specialtyEn: true,
                specialtyAr: true,
                isActive: true,
                services: { select: { id: true } },
            },
            orderBy: { fullNameEn: "asc" },
        }),
    ]);

    return {
        clinicIds,
        options: {
            clinics,
            services,
            doctors: doctors.map((doctor) => ({
                id: doctor.id,
                clinicId: doctor.clinicId,
                fullNameEn: doctor.fullNameEn,
                fullNameAr: doctor.fullNameAr,
                specialtyEn: doctor.specialtyEn,
                specialtyAr: doctor.specialtyAr,
                isActive: doctor.isActive,
                serviceIds: doctor.services.map((service) => service.id),
            })),
        },
    };
}

async function queryShifts(
    organizationId: string,
    clinicIds: string[],
    filters: GetShiftsInput = {},
): Promise<ShiftRow[]> {
    if (clinicIds.length === 0) return [];

    const where: Prisma.ShiftWhereInput = {
        organizationId,
        clinicId: filters.clinicId ? filters.clinicId : { in: clinicIds },
        ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
        ...(filters.status === "ACTIVE" ? { isActive: true } : {}),
        ...(filters.status === "PAUSED" ? { isActive: false } : {}),
        ...(typeof filters.dayOfWeek === "number"
            ? { daysOfWeek: { has: filters.dayOfWeek } }
            : {}),
    };

    const rows = await prisma.shift.findMany({
        where,
        include: shiftInclude,
        orderBy: [{ startMinute: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: MAX_SHIFTS,
    });

    return rows.map(mapShift);
}

export async function getShiftsPageDataAction(): Promise<ShiftActionResult<ShiftsPageData>> {
    try {
        const session = await requirePortalSession("admin");
        const { options, clinicIds } = await loadOptions(session.organizationId);
        const shifts = await queryShifts(session.organizationId, clinicIds);

        return { success: true, data: { ...options, shifts } };
    } catch (error) {
        console.error("[getShiftsPageDataAction]", error);

        return failure(
            "Unable to load shifts. Please refresh the page and try again.",
            "FETCH_SHIFTS_FAILED",
        );
    }
}

export async function getShiftOptionsAction(): Promise<ShiftActionResult<ShiftOptionsData>> {
    try {
        const session = await requirePortalSession("admin");
        const { options } = await loadOptions(session.organizationId);

        return { success: true, data: options };
    } catch (error) {
        console.error("[getShiftOptionsAction]", error);

        return failure("Unable to load shift options.", "FETCH_OPTIONS_FAILED");
    }
}

export async function getShiftsAction(
    input: GetShiftsInput = {},
): Promise<ShiftActionResult<{ shifts: ShiftRow[] }>> {
    try {
        const session = await requirePortalSession("admin");

        const doctorId = cleanText(input?.doctorId);
        const clinicId = cleanText(input?.clinicId);

        if (doctorId && !validUuid(doctorId)) {
            return failure("Select a valid doctor.", "INVALID_DOCTOR");
        }

        if (clinicId && !validUuid(clinicId)) {
            return failure("Select a valid clinic.", "INVALID_CLINIC");
        }

        if (
            input?.dayOfWeek !== undefined &&
            (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6)
        ) {
            return failure("Select a valid day of the week.", "INVALID_DAYS");
        }

        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicId && !clinicIds.includes(clinicId)) {
            return failure(
                "The selected clinic was not found in your organization.",
                "CLINIC_NOT_FOUND",
            );
        }

        const shifts = await queryShifts(session.organizationId, clinicIds, {
            doctorId: doctorId || undefined,
            clinicId: clinicId || undefined,
            dayOfWeek: input?.dayOfWeek,
            status: input?.status ?? "ALL",
        });

        return { success: true, data: { shifts } };
    } catch (error) {
        console.error("[getShiftsAction]", error);

        return failure("Unable to load shifts. Please try again.", "FETCH_SHIFTS_FAILED");
    }
}

/* -------------------------------------------------------------------------- */
/*                                  Mutations                                 */
/* -------------------------------------------------------------------------- */

export async function createShiftAction(
    input: ShiftInput,
): Promise<ShiftActionResult<ShiftMutationData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const parsed = parseShiftInput(input);

    if (!parsed.ok) return failure(parsed.error, parsed.code);

    const v = parsed.value;

    try {
        const created = await prisma.$transaction(async (tx) => {
            await assertShiftReferences(tx, session.organizationId, v);
            await assertNoOverlap(tx, session.organizationId, v);

            return tx.shift.create({
                data: {
                    organizationId: session.organizationId,
                    clinicId: v.clinicId,
                    doctorId: v.doctorId,
                    serviceId: v.serviceId,
                    daysOfWeek: v.days,
                    startMinute: v.startMinute,
                    endMinute: v.endMinute,
                    slotDurationMinutes: v.slot,
                    isActive: v.isActive,
                },
                include: shiftInclude,
            });
        }, SERIALIZABLE_OPTIONS);

        revalidatePath(SCHEDULES_PATH);

        return { success: true, data: { shift: mapShift(created) } };
    } catch (error) {
        return (
            mappedTransactionError<ShiftMutationData>(error) ??
            databaseError("createShiftAction", error)
        );
    }
}

export async function updateShiftAction(
    input: UpdateShiftInput,
): Promise<ShiftActionResult<ShiftMutationData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const shiftId = cleanText(input?.shiftId);

    if (!validUuid(shiftId)) {
        return failure("The selected shift is invalid.", "INVALID_SHIFT");
    }

    const parsed = parseShiftInput(input);

    if (!parsed.ok) return failure(parsed.error, parsed.code);

    const v = parsed.value;

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        const existing = await prisma.shift.findFirst({
            where: {
                id: shiftId,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: { id: true, clinicId: true },
        });

        if (!existing) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const updated = await prisma.$transaction(async (tx) => {
            await assertShiftReferences(tx, session.organizationId, v);
            await assertNoOverlap(tx, session.organizationId, v, existing.id);

            return tx.shift.update({
                where: {
                    id: existing.id,
                    organizationId: session.organizationId,
                    clinicId: existing.clinicId,
                },
                data: {
                    clinicId: v.clinicId,
                    doctorId: v.doctorId,
                    serviceId: v.serviceId,
                    daysOfWeek: v.days,
                    startMinute: v.startMinute,
                    endMinute: v.endMinute,
                    slotDurationMinutes: v.slot,
                    isActive: v.isActive,
                },
                include: shiftInclude,
            });
        }, SERIALIZABLE_OPTIONS);

        revalidatePath(SCHEDULES_PATH);

        return { success: true, data: { shift: mapShift(updated) } };
    } catch (error) {
        return (
            mappedTransactionError<ShiftMutationData>(error) ??
            databaseError("updateShiftAction", error)
        );
    }
}

/** Flips the shift between Active and Paused. Resuming re-validates conflicts. */
export async function toggleShiftStatusAction(
    shiftId: string,
): Promise<ShiftActionResult<ShiftMutationData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(shiftId);

    if (!validUuid(id)) {
        return failure("The selected shift is invalid.", "INVALID_SHIFT");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const updated = await prisma.$transaction(async (tx) => {
            const shift = await tx.shift.findFirst({
                where: {
                    id,
                    organizationId: session.organizationId,
                    clinicId: { in: clinicIds },
                },
            });

            if (!shift) throw new Error("SHIFT_NOT_FOUND");

            const nextActive = !shift.isActive;

            if (nextActive) {
                const candidate = {
                    doctorId: shift.doctorId,
                    clinicId: shift.clinicId,
                    serviceId: shift.serviceId,
                    days: shift.daysOfWeek,
                    startMinute: shift.startMinute,
                    endMinute: shift.endMinute,
                    isActive: true,
                };

                await assertShiftReferences(tx, session.organizationId, candidate);
                await assertNoOverlap(tx, session.organizationId, candidate, shift.id);
            }

            return tx.shift.update({
                where: {
                    id: shift.id,
                    organizationId: session.organizationId,
                    clinicId: shift.clinicId,
                },
                data: { isActive: nextActive },
                include: shiftInclude,
            });
        }, SERIALIZABLE_OPTIONS);

        revalidatePath(SCHEDULES_PATH);

        return { success: true, data: { shift: mapShift(updated) } };
    } catch (error) {
        return (
            mappedTransactionError<ShiftMutationData>(error) ??
            databaseError("toggleShiftStatusAction", error)
        );
    }
}

/**
 * Clones a shift. The copy is created PAUSED so it can never conflict with its
 * source; the admin edits it and then resumes it.
 */
export async function duplicateShiftAction(
    shiftId: string,
): Promise<ShiftActionResult<ShiftMutationData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(shiftId);

    if (!validUuid(id)) {
        return failure("The selected shift is invalid.", "INVALID_SHIFT");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const created = await prisma.$transaction(async (tx) => {
            const source = await tx.shift.findFirst({
                where: {
                    id,
                    organizationId: session.organizationId,
                    clinicId: { in: clinicIds },
                },
            });

            if (!source) throw new Error("SHIFT_NOT_FOUND");

            await assertShiftReferences(tx, session.organizationId, {
                doctorId: source.doctorId,
                clinicId: source.clinicId,
                serviceId: source.serviceId,
                isActive: false,
            });

            return tx.shift.create({
                data: {
                    organizationId: session.organizationId,
                    clinicId: source.clinicId,
                    doctorId: source.doctorId,
                    serviceId: source.serviceId,
                    daysOfWeek: source.daysOfWeek,
                    startMinute: source.startMinute,
                    endMinute: source.endMinute,
                    slotDurationMinutes: source.slotDurationMinutes,
                    isActive: false,
                },
                include: shiftInclude,
            });
        }, { maxWait: 10_000, timeout: 20_000 });

        revalidatePath(SCHEDULES_PATH);

        return { success: true, data: { shift: mapShift(created) } };
    } catch (error) {
        return (
            mappedTransactionError<ShiftMutationData>(error) ??
            databaseError("duplicateShiftAction", error)
        );
    }
}

/**
 * Deletes a shift. Deletion is refused while upcoming, non-cancelled
 * appointments of the same doctor still fall inside the shift's window.
 */
export async function deleteShiftAction(
    shiftId: string,
): Promise<ShiftActionResult<DeleteShiftData>> {
    const session = await authorize();

    if (!session) return unauthorized();

    const id = cleanText(shiftId);

    if (!validUuid(id)) {
        return failure("The selected shift is invalid.", "INVALID_SHIFT");
    }

    try {
        const clinicIds = await getOrganizationClinicIds(session.organizationId);

        if (clinicIds.length === 0) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const shift = await prisma.shift.findFirst({
            where: {
                id,
                organizationId: session.organizationId,
                clinicId: { in: clinicIds },
            },
            select: {
                id: true,
                organizationId: true,
                clinicId: true,
                doctorId: true,
                daysOfWeek: true,
                startMinute: true,
                endMinute: true,
                clinic: { select: { timezone: true } },
            },
        });

        if (!shift) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        const affected = await countAffectedAppointments({
            organizationId: shift.organizationId,
            clinicId: shift.clinicId,
            doctorId: shift.doctorId,
            daysOfWeek: shift.daysOfWeek,
            startMinute: shift.startMinute,
            endMinute: shift.endMinute,
            timezone: shift.clinic.timezone,
        });

        if (affected > 0) {
            return failure(
                `This shift cannot be deleted because ${affected} upcoming appointment${affected === 1 ? "" : "s"
                } fall within it. Reschedule or cancel them first, or pause the shift instead.`,
                "HAS_UPCOMING_APPOINTMENTS",
            );
        }

        const deleted = await prisma.shift.deleteMany({
            where: {
                id: shift.id,
                organizationId: session.organizationId,
                clinicId: shift.clinicId,
            },
        });

        if (deleted.count !== 1) {
            return failure(
                "The requested shift could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        revalidatePath(SCHEDULES_PATH);

        return { success: true, data: { id: shift.id } };
    } catch (error) {
        return databaseError("deleteShiftAction", error);
    }
}