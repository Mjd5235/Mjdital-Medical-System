// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/utils.ts
// Pure helpers (formatting, password generation, clipboard, optimistic rows).
// ============================================================================

import { IdentityType } from "@prisma/client";
import type { Locale } from "@/lib/i18n/types";
import type {
    CreateDoctorInput,
    DoctorFormOptions,
    DoctorListItem,
    DoctorRow,
} from "../../types";
import { SPECIALTIES, TEMP_ID_PREFIX } from "./constants";

export function specialtyLabel(
    doctor: Pick<DoctorRow, "specialty" | "specialtyAr">,
    locale: Locale,
): string {
    if (locale === "en") return doctor.specialty;

    const known = SPECIALTIES.find((item) => item.en === doctor.specialty);
    return known?.ar ?? (doctor.specialtyAr || doctor.specialty);
}

// Rows keep their object identity until they change, so the localized list item
// (and its pre-computed search text) is only rebuilt for rows that actually changed.
const listItemCache = new WeakMap<DoctorRow, { locale: Locale; item: DoctorListItem }>();

export function toListItem(doctor: DoctorRow, locale: Locale): DoctorListItem {
    const cached = listItemCache.get(doctor);

    if (cached && cached.locale === locale) return cached.item;

    const clinicName =
        locale === "ar" ? doctor.clinicNameAr || doctor.clinicName : doctor.clinicName;
    const specialty = specialtyLabel(doctor, locale);
    const services = doctor.services.map((service) => ({
        id: service.id,
        name: locale === "ar" ? service.nameAr : service.nameEn,
    }));

    const searchText = [
        doctor.fullName,
        doctor.email ?? "",
        doctor.nationalId,
        doctor.scfhsLicenseNumber,
        specialty,
        clinicName,
        ...services.map((service) => service.name),
    ]
        .join(" ")
        .toLocaleLowerCase(locale);

    const item: DoctorListItem = {
        ...doctor,
        clinicName,
        specialty,
        services,
        searchText,
    };

    listItemCache.set(doctor, { locale, item });

    return item;
}

export function displayName(name: string, locale: Locale): string {
    if (/^(dr\.?|د\.?)\s/i.test(name)) return name;
    return locale === "ar" ? `د. ${name}` : `Dr. ${name}`;
}

export function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export function maskIdentity(value: string): string {
    return value.length > 4 ? `${value.slice(0, 2)}•••••${value.slice(-4)}` : value;
}

export function pageWindow(current: number, total: number): number[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, index) => index + 1);
    }

    const start = Math.min(Math.max(1, current - 2), total - 4);
    return Array.from({ length: 5 }, (_, index) => start + index);
}

/* ------------------------------ Password + clipboard ------------------------------ */

function randomIndex(max: number): number {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    let value: number;

    do {
        crypto.getRandomValues(buffer);
        value = buffer[0] as number;
    } while (value >= limit);

    return value % max;
}

export function generatePassword(length = 14): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const digits = "23456789";
    const symbols = "!@#$%&*?";
    const all = upper + lower + digits + symbols;
    const pick = (set: string) => set[randomIndex(set.length)] as string;

    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

    while (chars.length < length) {
        chars.push(pick(all));
    }

    for (let index = chars.length - 1; index > 0; index--) {
        const swap = randomIndex(index + 1);
        [chars[index], chars[swap]] = [chars[swap] as string, chars[index] as string];
    }

    return chars.join("");
}

export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to legacy copy
    }

    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

/* ------------------------------ Optimistic-UI helpers ------------------------------ */

export function makeTempId(): string {
    const random =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${TEMP_ID_PREFIX}${random}`;
}

export function isTempId(id: string): boolean {
    return id.startsWith(TEMP_ID_PREFIX);
}

// Mirrors the status rules used by the server (mapDoctor in queries.ts).
export function deriveAccountStatus(
    isActive: boolean,
    hasUser: boolean,
    mustChangePassword: boolean,
): DoctorRow["accountStatus"] {
    if (!isActive) return "INACTIVE";
    if (!hasUser) return "NO_ACCOUNT";
    return mustChangePassword ? "INVITED" : "ACTIVE";
}

// Builds the row that is shown instantly, before the server confirms the change.
export function buildOptimisticRow(
    input: CreateDoctorInput,
    base: DoctorRow | null,
    id: string,
    options: DoctorFormOptions,
): DoctorRow {
    const clinic = options.clinics.find((item) => item.id === input.clinicId);
    const fallbackClinic = base && base.clinicId === input.clinicId ? base : null;

    const services: DoctorRow["services"] = [];

    for (const serviceId of input.serviceIds) {
        const found =
            options.services.find((item) => item.id === serviceId) ??
            base?.services.find((item) => item.id === serviceId);

        if (found) {
            services.push({
                id: found.id,
                nameEn: found.nameEn,
                nameAr: found.nameAr,
                code: found.code,
            });
        }
    }

    services.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

    const isActive = base?.isActive ?? true;
    const mustChangePassword = input.temporaryPassword
        ? true
        : (base?.mustChangePassword ?? true);

    return {
        id,
        userId: base?.userId ?? null,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: `${input.firstName} ${input.lastName}`.trim(),
        specialty: input.specialty,
        specialtyAr: input.specialtyAr ?? input.specialty,
        nationalId: input.nationalId,
        identityType: input.nationalId.startsWith("1")
            ? IdentityType.NATIONAL_ID
            : IdentityType.IQAMA,
        scfhsLicenseNumber: input.scfhsLicenseNumber,
        professionalRank: input.professionalRank,
        clinicId: input.clinicId,
        clinicName: clinic?.nameEn ?? fallbackClinic?.clinicName ?? "",
        clinicNameAr: clinic?.nameAr ?? fallbackClinic?.clinicNameAr ?? "",
        commissionRate: String(input.commissionRate),
        isActive,
        mustChangePassword,
        accountStatus: deriveAccountStatus(isActive, true, mustChangePassword),
        createdAt: base?.createdAt ?? new Date().toISOString(),
        services,
    };
}