import "server-only";

import { portalAllowsRole } from "@/lib/auth/roles";
import { verifyPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session-token";
import { prisma, prismaBase } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/services/audit.service";
import type { Portal } from "@/lib/i18n/get-locale";

export type LoginFailureCode =
  | "invalid_credentials"
  | "inactive"
  | "unauthorized_portal"
  | "misconfigured";

export type LoginResult =
  | { ok: true; session: SessionUser }
  | { ok: false; code: LoginFailureCode };

type AuthUserRecord = {
  id: string;
  clinicId: string;
  email: string;
  passwordHash: string;
  fullNameAr: string;
  fullNameEn: string;
  role: SessionUser["role"];
  isActive: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function authenticatePortalUser(input: {
  email: string;
  password: string;
  portal: Portal;
  ipAddress?: string;
  userAgent?: string;
}): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  if (!email || !input.password) {
    return { ok: false, code: "invalid_credentials" };
  }

  let user: AuthUserRecord | null;

  try {
    user = await prismaBase.user.findFirst({
      where: { email },
      select: {
        id: true,
        clinicId: true,
        email: true,
        passwordHash: true,
        fullNameAr: true,
        fullNameEn: true,
        role: true,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("Failed to look up user for authentication", error);
    return { ok: false, code: "misconfigured" };
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { ok: false, code: "invalid_credentials" };
  }

  if (!user.isActive) {
    return { ok: false, code: "inactive" };
  }

  if (!isUuid(user.clinicId) || !isUuid(user.id)) {
    return { ok: false, code: "misconfigured" };
  }

  if (!portalAllowsRole(input.portal, user.role)) {
    return { ok: false, code: "unauthorized_portal" };
  }

  try {
    await prisma.user.update({
      where: { id: user.id, clinicId: user.clinicId },
      data: { lastLoginAt: new Date() },
    });
  } catch (error) {
    console.error("Failed to persist last login timestamp", error);
  }

  try {
    await writeAuditLog({
      clinicId: user.clinicId,
      userId: user.id,
      actionType: "READ",
      targetTable: "users",
      recordId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { event: "portal_login", portal: input.portal },
    });
  } catch (error) {
    console.error("Failed to persist login audit", error);
  }

  return {
    ok: true,
    session: {
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
      fullNameAr: user.fullNameAr,
      fullNameEn: user.fullNameEn,
    },
  };
}
