
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/services/audit.service";

type SignAppointmentInput = {
  organizationId: string;
  clinicId: string;
  actorUserId: string;
  appointmentId: string;
  ipAddress?: string;
};

export async function signAndCompleteAppointment(
  input: SignAppointmentInput,
) {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: {
        organizationId: input.organizationId,
        clinicId: input.clinicId,
        id: input.appointmentId,
      },
    });

    if (!appointment) {
      throw new Error("Appointment not found for this clinic");
    }

    if (
      appointment.isLocked ||
      appointment.status === "COMPLETED"
    ) {
      throw new Error("Completed medical notes are immutable");
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "COMPLETED",
        isLocked: true,
        signedAt: new Date(),
        signedByUserId: input.actorUserId,
        completedAt: new Date(),
      },
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      clinicId: input.clinicId,
      userId: input.actorUserId,
      actionType: "UPDATE",
      targetTable: "appointments",
      recordId: updated.id,
      ipAddress: input.ipAddress,
      metadata: { event: "sign_and_complete" },
    });

    return updated;
  } catch (error) {
    console.error("Failed to complete appointment", error);
    throw error instanceof Error
      ? error
      : new Error("Unable to complete appointment");
  }
}
