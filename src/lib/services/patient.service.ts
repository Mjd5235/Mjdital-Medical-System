
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/services/audit.service";
import { buildFileNumber } from "@/lib/validators/file-number";
import { parseSaudiIdentity } from "@/lib/validators/national-id";

type CreatePatientInput = {
  organizationId: string;
  clinicId: string;
  actorUserId: string;
  fullNameAr: string;
  fullNameEn: string;
  nationalId: string;
  ipAddress?: string;
};

export async function nextFileNumber(
  organizationId: string,
  clinicId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MC-${year}-`;

  try {
    const latest = await prisma.patient.findFirst({
      where: {
        organizationId,
        clinicId,
        fileNumber: { startsWith: prefix },
      },
      orderBy: { fileNumber: "desc" },
      select: { fileNumber: true },
    });

    const lastSequence = latest
      ? Number(latest.fileNumber.slice(-4))
      : 0;

    return buildFileNumber(year, lastSequence + 1);
  } catch (error) {
    console.error("Failed to generate file number", error);
    throw new Error("Unable to generate medical file number");
  }
}

export async function createPatient(input: CreatePatientInput) {
  const identity = parseSaudiIdentity(input.nationalId);

  try {
    const fileNumber = await nextFileNumber(
      input.organizationId,
      input.clinicId,
    );

    const patient = await prisma.patient.create({
      data: {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        fileNumber,
        nationalId: identity.nationalId,
        identityType: identity.identityType,
        fullNameAr: input.fullNameAr,
        fullNameEn: input.fullNameEn,
      },
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      clinicId: input.clinicId,
      userId: input.actorUserId,
      actionType: "CREATE",
      targetTable: "patients",
      recordId: patient.id,
      ipAddress: input.ipAddress,
    });

    return patient;
  } catch (error) {
    console.error("Failed to create patient", error);
    throw new Error("Unable to create patient record");
  }
}

export async function getPatientById(
  organizationId: string,
  clinicId: string,
  patientId: string,
) {
  try {
    return await prisma.patient.findFirst({
      where: {
        organizationId,
        clinicId,
        id: patientId,
      },
    });
  } catch (error) {
    console.error("Failed to load patient", error);
    throw new Error("Unable to load patient");
  }
}
