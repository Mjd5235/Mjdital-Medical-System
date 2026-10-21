import { prisma } from "@/lib/db/prisma";
import type { AuditActionType } from "@prisma/client";

type WriteAuditInput = {
  clinicId: string;
  userId: string;
  actionType: AuditActionType;
  targetTable: string;
  recordId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function writeAuditLog(input: WriteAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
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

export async function listAuditLogs(clinicId: string, take = 50) {
  try {
    return await prisma.auditLog.findMany({
      where: { clinicId },
      orderBy: { timestamp: "desc" },
      take,
    });
  } catch (error) {
    console.error("Failed to list audit logs", error);
    throw new Error("Unable to load audit logs");
  }
}
