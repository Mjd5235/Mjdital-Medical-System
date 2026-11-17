// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/constants.ts
// ============================================================================

import type { DoctorProfessionalRank } from "@prisma/client";
import type { DoctorFormOptions } from "../../types";

export const PAGE_SIZE = 4;
export const TOAST_MS = 8000;
export const MAX_TOASTS = 3;
export const OPTIONS_STALE_MS = 60_000;
export const TEMP_ID_PREFIX = "tmp-";

export const EMPTY_OPTIONS: DoctorFormOptions = { clinics: [], services: [] };

export const SPECIALTIES: ReadonlyArray<{ en: string; ar: string }> = [
    { en: "Cardiology", ar: "أمراض القلب" },
    { en: "Pediatrics", ar: "طب الأطفال" },
    { en: "Dermatology", ar: "الأمراض الجلدية" },
    { en: "Orthopedics", ar: "جراحة العظام" },
    { en: "Internal Medicine", ar: "الطب الباطني" },
    { en: "General Practice", ar: "الطب العام" },
    { en: "Obstetrics & Gynecology", ar: "النساء والولادة" },
    { en: "Ophthalmology", ar: "طب العيون" },
    { en: "Ear, Nose & Throat (ENT)", ar: "الأنف والأذن والحنجرة" },
    { en: "Neurology", ar: "طب الأعصاب" },
    { en: "Psychiatry", ar: "الطب النفسي" },
    { en: "Dentistry", ar: "طب الأسنان" },
    { en: "Urology", ar: "المسالك البولية" },
    { en: "Radiology", ar: "الأشعة" },
    { en: "Endocrinology", ar: "الغدد الصماء والسكري" },
    { en: "Gastroenterology", ar: "الجهاز الهضمي" },
    { en: "Pulmonology", ar: "أمراض الصدر" },
    { en: "Nephrology", ar: "أمراض الكلى" },
    { en: "Oncology", ar: "الأورام" },
    { en: "Emergency Medicine", ar: "طب الطوارئ" },
    { en: "Physiotherapy", ar: "العلاج الطبيعي" },
    { en: "General Surgery", ar: "الجراحة العامة" },
];

export const rankLabels: Record<DoctorProfessionalRank, { en: string; ar: string }> = {
    CONSULTANT: { en: "Consultant", ar: "استشاري" },
    SPECIALIST: { en: "Specialist", ar: "أخصائي" },
    RESIDENT: { en: "Resident", ar: "طبيب مقيم" },
    GENERAL_PRACTITIONER: { en: "General Practitioner", ar: "طبيب عام" },
    REGISTRAR: { en: "Registrar", ar: "مسجل" },
};