import { defaultPortalForRole, type UserRole } from "@/lib/auth/roles";
import type { Portal } from "@/lib/i18n/get-locale";

const PORTAL_HOME: Record<Portal, string> = {
  admin: "/admin/dashboard",
  reception: "/reception/dashboard",
  doctor: "/doctor/dashboard",
};

const PORTAL_LOGIN: Record<Portal, string> = {
  admin: "/admin/login",
  reception: "/reception/login",
  doctor: "/doctor/login",
};

export function portalHomePath(portal: Portal): string {
  return PORTAL_HOME[portal];
}

export function portalLoginPath(portal: Portal): string {
  return PORTAL_LOGIN[portal];
}

export function homePathForRole(role: UserRole): string {
  const portal = defaultPortalForRole(role);
  return portal ? PORTAL_HOME[portal] : "/";
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/admin/login" ||
    pathname === "/doctor/login" ||
    pathname === "/reception/login"
  );
}

export function safeNextPath(portal: Portal, candidate: string | null): string {
  const fallback = portalHomePath(portal);
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }
  if (candidate.includes("://") || candidate.includes("\\")) {
    return fallback;
  }
  if (!candidate.startsWith(`/${portal}/`)) {
    return fallback;
  }
  return candidate;
}
