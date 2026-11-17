// ============================================================================
// FILE: app/admin/clinical/providers/types.ts
// Shared types (server + client). Contains no runtime code.
// ============================================================================

import type { DoctorProfessionalRank, IdentityType } from "@prisma/client";

/* ------------------------------ Server contracts ------------------------------ */

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

export interface DoctorFormOptions {
    clinics: DoctorClinicOption[];
    services: DoctorServiceOption[];
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
    clinicNameAr: string;
    commissionRate: string;
    isActive: boolean;
    mustChangePassword: boolean;
    accountStatus: "ACTIVE" | "INVITED" | "INACTIVE" | "NO_ACCOUNT";
    createdAt: string;
    services: Array<{
        id: string;
        nameEn: string;
        nameAr: string;
        code: string;
    }>;
}

export interface DoctorsSnapshot {
    doctors: DoctorRow[];
    options: DoctorFormOptions;
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

export interface SetDoctorActiveStatusResultData {
    doctor: DoctorRow;
}

/* ------------------------------ Client-only shapes ---------------------------- */

export type DoctorListItem = Omit<DoctorRow, "services"> & {
    services: Array<{ id: string; name: string }>;
    searchText: string;
};

export type FormErrors = Partial<
    Record<
        | "email"
        | "firstName"
        | "lastName"
        | "temporaryPassword"
        | "nationalId"
        | "scfhsLicenseNumber"
        | "professionalRank"
        | "specialty"
        | "clinicId"
        | "serviceIds"
        | "commissionRate",
        string
    >
>;

export type Notice = {
    kind: "success" | "error";
    message: string;
};

export type ToastItem = Notice & { id: number };

export type ModalState = { mode: "create" } | { mode: "edit"; doctor: DoctorRow } | null;

export type DropdownOption = {
    value: string;
    label: string;
};