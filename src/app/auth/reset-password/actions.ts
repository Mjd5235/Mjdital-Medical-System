// app/auth/reset-password/actions.ts
"use server";

import { cookies } from "next/headers";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { homePathForRole } from "@/lib/auth/safe-path";
import {
    parseSessionToken,
    SESSION_COOKIE,
    type SessionUser,
} from "@/lib/auth/session-token";

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
    | "RATE_LIMITED"
    | "DATABASE_ERROR";

export interface ResetPasswordResult {
    success: boolean;
    error?: string;
    code?: ResetPasswordCode;
    /** Portal home path for the user's role (set on success / already completed). */
    redirectTo?: string;
}

export interface ResetPasswordInput {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const MAX_BYTES = 256;

/* ------------------------------------------------------------------ */
/* Best-effort brute-force protection for the temporary password.      */
/* (Per server instance; use a shared store such as Redis if you run   */
/* many instances.)                                                    */
/* ------------------------------------------------------------------ */
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const failedAttempts = new Map<
    string,
    { count: number; resetAt: number }
>();

function pruneAttempts(now: number): void {
    if (failedAttempts.size < 500) return;

    for (const [key, entry] of failedAttempts) {
        if (entry.resetAt <= now) failedAttempts.delete(key);
    }
}

function isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = failedAttempts.get(key);

    if (!entry) return false;

    if (entry.resetAt <= now) {
        failedAttempts.delete(key);
        return false;
    }

    return entry.count >= MAX_FAILED_ATTEMPTS;
}

function registerFailure(key: string): void {
    const now = Date.now();
    const entry = failedAttempts.get(key);

    pruneAttempts(now);

    if (!entry || entry.resetAt <= now) {
        failedAttempts.set(key, {
            count: 1,
            resetAt: now + ATTEMPT_WINDOW_MS,
        });
        return;
    }

    entry.count += 1;
}

function clearFailures(key: string): void {
    failedAttempts.delete(key);
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

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
    redirectTo?: string,
): ResetPasswordResult {
    return {
        success: false,
        error,
        code,
        ...(redirectTo ? { redirectTo } : {}),
    };
}

async function readSession(): Promise<SessionUser | null> {
    try {
        const store = await cookies();

        return await parseSessionToken(
            store.get(SESSION_COOKIE)?.value,
        );
    } catch {
        return null;
    }
}

/**
 * Universal first-login password reset (Admin, Receptionist, Doctor).
 *
 * Success: the new password hash replaces the temporary one (so the temporary
 * password stops working), mustChangePassword -> false, isActive -> true,
 * lastLogin is updated, and the portal home path for the user's role is
 * returned so the client can navigate there.
 */
export async function resetPasswordAction(
    input: ResetPasswordInput,
): Promise<ResetPasswordResult> {
    const session = await readSession();

    if (!session || !session.organizationId || !session.userId) {
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

    const { currentPassword, newPassword, confirmPassword } = input;

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

    const attemptKey = `${session.organizationId}:${session.userId}`;

    if (isRateLimited(attemptKey)) {
        return failure(
            "Too many incorrect attempts. Please wait a few minutes and try again.",
            "RATE_LIMITED",
        );
    }

    try {
        const account = await prisma.user.findFirst({
            where: {
                id: session.userId,
                organizationId: session.organizationId,
            },
            select: {
                id: true,
                role: true,
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

        if (!account) {
            return failure(
                "Your account is unavailable.",
                "ACCOUNT_UNAVAILABLE",
            );
        }

        const roleHome = homePathForRole(account.role);

        if (!account.mustChangePassword) {
            // Password already permanent: a disabled account must not be
            // re-enabled through this flow; an active one just moves on.
            if (!account.isActive) {
                return failure(
                    "Your account has been disabled. Please contact your administrator.",
                    "ACCOUNT_UNAVAILABLE",
                );
            }

            return failure(
                "Your password has already been updated.",
                "ALREADY_COMPLETED",
                roleHome,
            );
        }

        const validCurrentPassword = await Promise.resolve(
            verifyPassword(currentPassword, account.passwordHash),
        );

        if (!validCurrentPassword) {
            registerFailure(attemptKey);

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

        const data: Prisma.UserUpdateInput = {
            passwordHash: newPasswordHash,
            mustChangePassword: false,
            isActive: true,
            lastLoginAt: new Date(),
        };

        // A pending doctor is activated together with the user record.
        if (account.role === UserRole.DOCTOR && account.doctor) {
            data.doctor = { update: { isActive: true } };
        }

        try {
            // The extra filters make the update atomic: it only applies while
            // the temporary password is still the one we just verified.
            await prisma.user.update({
                where: {
                    id: account.id,
                    organizationId: session.organizationId,
                    mustChangePassword: true,
                    passwordHash: account.passwordHash,
                },
                data,
                select: { id: true },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2025"
            ) {
                return failure(
                    "Your account was changed during this request. Please refresh and try again.",
                    "CONCURRENT_UPDATE",
                );
            }

            throw error;
        }

        clearFailures(attemptKey);

        return {
            success: true,
            redirectTo: roleHome,
        };
    } catch (error) {
        console.error("[resetPasswordAction]", error);

        return failure(
            "Unable to update your password. Please try again.",
            "DATABASE_ERROR",
        );
    }
}