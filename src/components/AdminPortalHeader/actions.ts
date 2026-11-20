// components/AdminPortalHeader/actions.ts
//
// Server action that returns the signed-in user's display profile for the Admin header.
//
// Security notes:
//  - The user is resolved ONLY from the server session (requirePortalSession). No id is accepted from the client.
//  - The query is scoped by BOTH the user id and the session's organizationId (tenant isolation).
//  - `select` is an explicit allow-list: passwordHash, email, mobileNumber, tokens, etc. are never read or returned.
"use server";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export interface HeaderUserProfile {
    fullNameAr: string;
    fullNameEn: string;
    role: UserRole;
    isSuperAdmin: boolean;
}

export interface HeaderUserResult {
    success: boolean;
    data?: HeaderUserProfile;
    error?: string;
    code?: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(source: unknown, path: readonly string[]): string | null {
    let current: unknown = source;

    for (const key of path) {
        if (!isRecord(current)) return null;

        current = current[key];
    }

    return typeof current === "string" && current.trim() !== "" ? current.trim() : null;
}

/**
 * The portal session may expose the user id under different keys depending on the
 * guard implementation. Everything is read defensively (no `any`) and validated.
 */
function resolveSessionUserId(session: unknown): string | null {
    const candidates: ReadonlyArray<readonly string[]> = [
        ["userId"],
        ["user", "id"],
        ["id"],
        ["sub"],
    ];

    for (const path of candidates) {
        const value = readString(session, path);

        if (value && UUID_PATTERN.test(value)) return value;
    }

    return null;
}

function resolveSessionEmail(session: unknown): string | null {
    const candidates: ReadonlyArray<readonly string[]> = [["email"], ["user", "email"]];

    for (const path of candidates) {
        const value = readString(session, path);

        if (value) return value.toLowerCase();
    }

    return null;
}

function resolveOrganizationId(session: unknown): string | null {
    return readString(session, ["organizationId"]);
}

/* -------------------------------------------------------------------------- */
/*                                   Action                                   */
/* -------------------------------------------------------------------------- */

export async function getCurrentHeaderUserAction(): Promise<HeaderUserResult> {
    try {
        const session: unknown = await requirePortalSession("admin");

        const organizationId = resolveOrganizationId(session);

        if (!organizationId) {
            return {
                success: false,
                error: "Your session has expired. Sign in and try again.",
                code: "UNAUTHORIZED",
            };
        }

        const userId = resolveSessionUserId(session);
        const email = userId ? null : resolveSessionEmail(session);

        if (!userId && !email) {
            return {
                success: false,
                error: "Your session has expired. Sign in and try again.",
                code: "UNAUTHORIZED",
            };
        }

        const user = await prisma.user.findFirst({
            where: {
                organizationId,
                isActive: true,
                ...(userId ? { id: userId } : { email: email as string }),
            },
            select: {
                fullNameAr: true,
                fullNameEn: true,
                role: true,
                isSuperAdmin: true,
            },
        });

        if (!user) {
            return {
                success: false,
                error: "The current user could not be found.",
                code: "USER_NOT_FOUND",
            };
        }

        return {
            success: true,
            data: {
                fullNameAr: user.fullNameAr,
                fullNameEn: user.fullNameEn,
                role: user.role,
                isSuperAdmin: user.isSuperAdmin,
            },
        };
    } catch (error) {
        console.error("[getCurrentHeaderUserAction]", error);

        return {
            success: false,
            error: "Unable to load the current user.",
            code: "FETCH_USER_FAILED",
        };
    }
}