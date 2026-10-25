
import { redirect } from "next/navigation";
import { portalAllowsRole } from "@/lib/auth/roles";
import { homePathForRole, portalLoginPath } from "@/lib/auth/safe-path";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { prismaBase } from "@/lib/db/prisma";
import type { Portal } from "@/lib/i18n/get-locale";

export type VerifiedSession = SessionUser & {
  email: string;
  isActive: true;
};

export async function requirePortalSession(
  portal: Portal,
): Promise<VerifiedSession> {
  const session = await getSession();
  const loginPath = portalLoginPath(portal);

  if (!session || !session.organizationId) {
    redirect(loginPath);
  }

  if (!portalAllowsRole(portal, session.role)) {
    redirect(homePathForRole(session.role));
  }

  const user = await prismaBase.user.findFirst({
    where: {
      id: session.userId,
      organizationId: session.organizationId,
    },
    select: {
      email: true,
      role: true,
      isActive: true,
      organizationId: true,
    },
  });

  if (
    !user ||
    !user.isActive ||
    user.organizationId !== session.organizationId ||
    user.role !== session.role ||
    !portalAllowsRole(portal, user.role)
  ) {
    redirect(loginPath);
  }

  return {
    ...session,
    email: user.email,
    isActive: true,
  };
}

export function assertClinicAccess(
  session: SessionUser,
  clinicId: string,
): void {
  // Organization membership alone does not prove access to every clinic.
  // Verify the clinic's organization and the user's clinic-level permissions
  // wherever this helper is used.
  if (!session.organizationId || !clinicId) {
    throw new Error("Clinic scope mismatch");
  }
}
