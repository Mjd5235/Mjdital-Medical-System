export const USER_ROLES = [
  "ADMIN",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "ACCOUNTANT",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PORTAL_ROLES = {
  admin: ["ADMIN"] as const,
  reception: ["RECEPTIONIST"] as const,
  doctor: ["DOCTOR"] as const,
} as const;

export type PortalKey = keyof typeof PORTAL_ROLES;

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export function portalAllowsRole(
  portal: PortalKey,
  role: UserRole,
): boolean {
  return (PORTAL_ROLES[portal] as readonly UserRole[]).includes(role);
}

export function defaultPortalForRole(role: UserRole): PortalKey | null {
  if (role === "ADMIN") {
    return "admin";
  }
  if (role === "RECEPTIONIST") {
    return "reception";
  }
  if (role === "DOCTOR") {
    return "doctor";
  }
  return null;
}
