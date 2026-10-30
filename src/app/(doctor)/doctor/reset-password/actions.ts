
"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import {
    hashPassword,
    verifyPassword,
} from "@/lib/auth/password";

export type ResetPasswordCode =
    | "INVALID_INPUT"
    | "INVALID_CURRENT_PASSWORD"
    | "PASSWORD_REQUIREMENTS"
    | "PASSWORD_MISMATCH"
    | "PASSWORD_REUSED"
    | "UNAUTHORIZED"
    | "ACCOUNT_UNAVAILABLE"
    | "ALREADY_COMPLETED"
    | "CONCURRENT_UPDATE"
    | "DATABASE_ERROR";

export interface ResetPasswordResult {
    success: boolean;
    error?: string;
    code?: ResetPasswordCode;
}

export interface ResetPasswordInput {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const MAX_BYTES = 256;

function isAcceptableLength(password: string): boolean {
    return (
        password.length >= MIN_LENGTH &&
        password.length <= MAX_LENGTH &&
        Buffer.byteLength(password, "utf8") <= MAX_BYTES
    );
}

function meetsPasswordPolicy(password: string): boolean {
    return (
        isAcceptableLength(password) &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

function failure(
    error: string,
    code: ResetPasswordCode,
): ResetPasswordResult {
    return {
        success: false,
        error,
        code,
    };
}

export async function resetDoctorPasswordAction(
    input: ResetPasswordInput,
): Promise<ResetPasswordResult> {
    let session: Awaited<
        ReturnType<typeof requirePortalSession>
    >;

    try {
        session = await requirePortalSession("doctor");
    } catch {
        return failure(
            "Your session has expired. Please sign in again.",
            "UNAUTHORIZED",
        );
    }

    if (!input || typeof input !== "object") {
        return failure(
            "Invalid password reset request.",
            "INVALID_INPUT",
        );
    }

    const {
        currentPassword,
        newPassword,
        confirmPassword,
    } = input;

    if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        typeof confirmPassword !== "string"
    ) {
        return failure(
            "All password fields are required.",
            "INVALID_INPUT",
        );
    }

    if (
        currentPassword.length === 0 ||
        currentPassword.length > MAX_LENGTH ||
        Buffer.byteLength(currentPassword, "utf8") > MAX_BYTES
    ) {
        return failure(
            "Enter a valid temporary password.",
            "INVALID_INPUT",
        );
    }

    if (!meetsPasswordPolicy(newPassword)) {
        return failure(
            "The new password must contain 12–128 characters, uppercase and lowercase letters, a number, and a special character (maximum 256 UTF-8 bytes).",
            "PASSWORD_REQUIREMENTS",
        );
    }

    if (newPassword !== confirmPassword) {
        return failure(
            "The new password and confirmation do not match.",
            "PASSWORD_MISMATCH",
        );
    }

    if (currentPassword === newPassword) {
        return failure(
            "Your new password must be different from your temporary password.",
            "PASSWORD_REUSED",
        );
    }

    try {
        const account = await prisma.user.findFirst({
            where: {
                id: session.userId,
                organizationId: session.organizationId,
                role: UserRole.DOCTOR,
            },
            select: {
                id: true,
                passwordHash: true,
                mustChangePassword: true,
                isActive: true,
                doctor: {
                    select: {
                        isActive: true,
                    },
                },
            },
        });

        if (
            !account ||
            !account.isActive ||
            !account.doctor?.isActive
        ) {
            return failure(
                "Your doctor account is unavailable.",
                "ACCOUNT_UNAVAILABLE",
            );
        }

        if (!account.mustChangePassword) {
            return failure(
                "Your password has already been updated.",
                "ALREADY_COMPLETED",
            );
        }

        const validCurrentPassword = await Promise.resolve(
            verifyPassword(currentPassword, account.passwordHash),
        );

        if (!validCurrentPassword) {
            return failure(
                "The current temporary password is incorrect.",
                "INVALID_CURRENT_PASSWORD",
            );
        }

        const isSamePassword = await Promise.resolve(
            verifyPassword(newPassword, account.passwordHash),
        );

        if (isSamePassword) {
            return failure(
                "Choose a password different from your temporary password.",
                "PASSWORD_REUSED",
            );
        }

        const newPasswordHash = await Promise.resolve(
            hashPassword(newPassword),
        );

        const updated = await prisma.user.updateMany({
            where: {
                id: account.id,
                organizationId: session.organizationId,
                role: UserRole.DOCTOR,
                isActive: true,
                mustChangePassword: true,
                passwordHash: account.passwordHash,
                doctor: {
                    is: {
                        isActive: true,
                    },
                },
            },
            data: {
                passwordHash: newPasswordHash,
                mustChangePassword: false,
            },
        });

        if (updated.count !== 1) {
            return failure(
                "Your account was changed during this request. Please refresh and try again.",
                "CONCURRENT_UPDATE",
            );
        }
    } catch (error) {
        console.error("[resetDoctorPasswordAction]", error);

        return failure(
            "Unable to update your password. Please try again.",
            "DATABASE_ERROR",
        );
    }

    redirect("/doctor/dashboard");
}
