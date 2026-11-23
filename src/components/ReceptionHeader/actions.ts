
"use server";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

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

export async function getCurrentHeaderUserAction(): Promise<HeaderUserResult> {
    try {
        const session = await requirePortalSession("reception");

        const userId = session.userId;
        const organizationId = session.organizationId;

        if (!userId || !organizationId) {
            return {
                success: false,
                error: "Invalid receptionist session.",
                code: "INVALID_SESSION",
            };
        }

        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                organizationId,
                role: "RECEPTIONIST",
                isActive: true,
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
                error: "Receptionist account not found.",
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
        console.error(
            "[getCurrentHeaderUserAction]",
            error,
        );

        return {
            success: false,
            error: "Unable to load receptionist profile.",
            code: "FETCH_USER_FAILED",
        };
    }
}
