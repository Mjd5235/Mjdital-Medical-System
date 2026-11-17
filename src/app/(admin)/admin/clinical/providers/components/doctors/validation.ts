// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/validation.ts
// Synchronous client-side form validation (the server re-validates everything).
// ============================================================================

import { DoctorProfessionalRank } from "@prisma/client";
import type {
    CreateDoctorInput,
    DoctorFormOptions,
    FormErrors,
} from "../../types";
import type { Messages } from "./messages";

export function validateForm(
    data: FormData,
    extras: { clinicId: string; serviceIds: string[]; temporaryPassword: string; isEdit: boolean },
    clinics: DoctorFormOptions["clinics"],
    services: DoctorFormOptions["services"],
    specialties: ReadonlyArray<{ en: string; ar: string }>,
    t: Messages,
): { input?: CreateDoctorInput; errors: FormErrors } {
    const errors: FormErrors = {};

    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const firstName = String(data.get("firstName") ?? "").trim();
    const lastName = String(data.get("lastName") ?? "").trim();
    const nationalId = String(data.get("nationalId") ?? "").trim();
    const scfhsLicenseNumber = String(data.get("scfhsLicenseNumber") ?? "").trim();
    const professionalRank = String(data.get("professionalRank") ?? "");
    const specialty = String(data.get("specialty") ?? "").trim();
    const commissionText = String(data.get("commissionRate") ?? "").trim();
    const commissionRate = Number(commissionText);
    const { clinicId, temporaryPassword, isEdit } = extras;

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = t.invalidEmail;
    }

    if (firstName.length < 1 || firstName.length > 100 || /[<>]/.test(firstName)) {
        errors.firstName = t.invalidName;
    }

    if (lastName.length < 1 || lastName.length > 100 || /[<>]/.test(lastName)) {
        errors.lastName = t.invalidName;
    }

    if (
        (!isEdit && temporaryPassword.length === 0) ||
        (temporaryPassword.length > 0 &&
            (temporaryPassword.length < 8 ||
                temporaryPassword.length > 128 ||
                /\s/.test(temporaryPassword) ||
                !/[a-z]/.test(temporaryPassword) ||
                !/[A-Z]/.test(temporaryPassword) ||
                !/\d/.test(temporaryPassword)))
    ) {
        errors.temporaryPassword = t.invalidPassword;
    }

    if (!/^[12]\d{9}$/.test(nationalId)) {
        errors.nationalId = t.invalidNational;
    }

    if (
        scfhsLicenseNumber.length < 3 ||
        scfhsLicenseNumber.length > 50 ||
        !/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(scfhsLicenseNumber)
    ) {
        errors.scfhsLicenseNumber = t.invalidLicense;
    }

    if (
        !Object.values(DoctorProfessionalRank).includes(
            professionalRank as DoctorProfessionalRank,
        )
    ) {
        errors.professionalRank = t.invalidRank;
    }

    const matchedSpecialty = specialties.find((item) => item.en === specialty);

    if (!matchedSpecialty) {
        errors.specialty = t.invalidSpecialty;
    }

    if (!clinics.some((clinic) => clinic.id === clinicId)) {
        errors.clinicId = t.invalidClinic;
    }

    const validServiceIds = new Set(
        services.filter((service) => service.clinicId === clinicId).map((service) => service.id),
    );
    const serviceIds = [...new Set(extras.serviceIds)].filter((id) => validServiceIds.has(id));

    if (serviceIds.length === 0) {
        errors.serviceIds = t.invalidServices;
    }

    if (
        commissionText === "" ||
        !Number.isFinite(commissionRate) ||
        commissionRate < 0 ||
        commissionRate > 100 ||
        !/^\d{1,3}(?:\.\d{1,2})?$/.test(commissionText)
    ) {
        errors.commissionRate = t.invalidCommission;
    }

    if (Object.keys(errors).length > 0) {
        return { errors };
    }

    return {
        errors,
        input: {
            email,
            firstName,
            lastName,
            nationalId,
            scfhsLicenseNumber,
            professionalRank: professionalRank as DoctorProfessionalRank,
            specialty,
            specialtyAr: matchedSpecialty?.ar ?? specialty,
            clinicId,
            serviceIds,
            commissionRate,
            temporaryPassword,
        },
    };
}