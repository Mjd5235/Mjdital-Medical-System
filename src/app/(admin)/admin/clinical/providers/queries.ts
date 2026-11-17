// ============================================================================
// FILE: app/admin/clinical/providers/queries.ts
// Server-only data layer. Called directly from the Server Component (page.tsx)
// so the first paint already contains the data: no client-side fetch waterfall.
// ============================================================================

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import type {
    DoctorFormOptions,
    DoctorRow,
    DoctorsSnapshot,
} from "./types";

export const doctorInclude = {
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

export type DoctorWithRelations = Prisma.DoctorGetPayload<{
    include: typeof doctorInclude;
}>;

export function mapDoctor(doctor: DoctorWithRelations): DoctorRow {
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
        clinicNameAr: doctor.clinic.nameAr,
        commissionRate: doctor.commissionRate.toString(),
        isActive: doctor.isActive,
        mustChangePassword,
        accountStatus: !doctor.isActive
            ? "INACTIVE"
            : !doctor.user
                ? "NO_ACCOUNT"
                : mustChangePassword || !doctor.user.isActive
                    ? "INVITED"
                    : "ACTIVE",
        createdAt: doctor.createdAt.toISOString(),
        services: doctor.services,
    };
}

export async function getOrganizationClinicIds(
    organizationId: string,
): Promise<string[]> {
    const clinics = await prisma.clinic.findMany({
        where: { organizationId },
        select: { id: true },
    });

    return clinics.map((clinic) => clinic.id);
}

export async function fetchOrganizationDoctors(
    organizationId: string,
): Promise<DoctorRow[]> {
    const clinicIds = await getOrganizationClinicIds(organizationId);

    if (clinicIds.length === 0) return [];

    // IMPORTANT: clinicId is required by the Doctor tenant middleware.
    const rows = await prisma.doctor.findMany({
        where: {
            organizationId,
            clinicId: { in: clinicIds },
        },
        include: doctorInclude,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    return rows.map(mapDoctor);
}

export async function fetchDoctorFormOptions(
    organizationId: string,
): Promise<DoctorFormOptions> {
    const [clinics, services] = await Promise.all([
        prisma.clinic.findMany({
            where: {
                organizationId,
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
                organizationId,
                isActive: true,
                clinic: {
                    is: {
                        organizationId,
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

    return { clinics, services };
}

/**
 * One authenticated call that loads everything the page needs, in parallel.
 * Used by the Server Component for the first render and by the
 * `getDoctorsSnapshotAction` server action for background re-syncs.
 */
export async function getDoctorsSnapshot(): Promise<DoctorsSnapshot> {
    const session = await requirePortalSession("admin");

    const [doctors, options] = await Promise.all([
        fetchOrganizationDoctors(session.organizationId),
        fetchDoctorFormOptions(session.organizationId),
    ]);

    return { doctors, options };
}