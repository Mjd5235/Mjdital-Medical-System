import { isUserRole, type UserRole } from "@/lib/auth/roles";

export const SESSION_COOKIE = "mjdital_session";

export type SessionUser = {
  userId: string;
  clinicId: string;
  role: UserRole;
  fullNameAr: string;
  fullNameEn: string;
};

type SessionPayload = SessionUser & {
  exp: number;
};

function sessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function utf8ToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToUtf8(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function sign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function signaturesMatch(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index)! ^ right.charCodeAt(index)!;
  }
  return result === 0;
}

export async function createSessionToken(
  user: SessionUser,
  maxAgeSeconds: number,
): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) {
    return null;
  }

  if (!isUuid(user.clinicId) || !isUuid(user.userId)) {
    return null;
  }

  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + maxAgeSeconds * 1000,
  };
  const encoded = utf8ToBase64Url(JSON.stringify(payload));
  const signature = await sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function parseSessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const secret = sessionSecret();
  if (!secret) {
    return null;
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = await sign(encoded, secret);
  const matches = await signaturesMatch(signature, expected);
  if (!matches) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlToUtf8(encoded)) as Partial<SessionPayload>;

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.clinicId !== "string" ||
      !isUuid(parsed.userId) ||
      !isUuid(parsed.clinicId) ||
      typeof parsed.role !== "string" ||
      !isUserRole(parsed.role) ||
      typeof parsed.fullNameAr !== "string" ||
      typeof parsed.fullNameEn !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      clinicId: parsed.clinicId,
      role: parsed.role,
      fullNameAr: parsed.fullNameAr,
      fullNameEn: parsed.fullNameEn,
    };
  } catch {
    return null;
  }
}
