
import { Prisma, type AuditActionType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type WriteAuditInput = {
  organizationId: string;
  clinicId: string;
  userId: string;
  actionType: AuditActionType;
  targetTable: string;
  recordId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonObject;
};

export async function writeAuditLog(
  input: WriteAuditInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        userId: input.userId,
        actionType: input.actionType,
        targetTable: input.targetTable,
        recordId: input.recordId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
    throw new Error("Unable to persist audit log");
  }
}

export async function listAuditLogs(
  organizationId: string,
  clinicId: string,
  take = 50,
) {
  try {
    return await prisma.auditLog.findMany({
      where: {
        organizationId,
        clinicId,
      },
      orderBy: { timestamp: "desc" },
      take,
    });
  } catch (error) {
    console.error("Failed to list audit logs", error);
    throw new Error("Unable to load audit logs");
  }
}
