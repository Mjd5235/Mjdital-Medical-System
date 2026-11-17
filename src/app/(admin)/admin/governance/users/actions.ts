"use server";

import { Prisma, UserRole } from "@prisma/client";
import { randomInt } from "node:crypto";
import { prisma, prismaBase } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";

const PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

const MANAGED_ROLES = [UserRole.ADMIN, UserRole.RECEPTIONIST] as const;

export type ManagedRole = (typeof MANAGED_ROLES)[number];
export type UserAccountStatus = "ACTIVE" | "PENDING" | "DISABLED";

export interface UserActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
}

export interface UserRow {
    id: string;
    fullName: string;
    email: string;
    mobileNumber: string | null;
    role: ManagedRole;
    /** Highest tier of the hierarchy. Read-only everywhere in the app. */
    isSuperAdmin: boolean;
    status: UserAccountStatus;
    isActive: boolean;
    mustChangePassword: boolean;
    activatedAt: string | null;
    isCurrentUser: boolean;
    lastLoginAt: string | null;
    createdAt: string;
}

export interface GetUsersInput {
    search?: string;
    role?: "ALL" | ManagedRole;
    status?: "ALL" | UserAccountStatus;
    page?: number;
    pageSize?: number;
}

export interface GetUsersData {
    users: UserRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    /** Privileges of the signed-in user, re-read from the database on every request. */
    viewer: { isSuperAdmin: boolean };
}

export interface CreateUserInput {
    fullName: string;
    email: string;
    mobileNumber: string;
    role: ManagedRole;
    temporaryPassword: string;
}

export interface UpdateUserInput {
    userId: string;
    fullName: string;
    email: string;
    mobileNumber: string;
    role: ManagedRole;
}

export interface ToggleUserStatusInput {
    userId: string;
    /** true = re-activate the account (isActive = true), false = disable it (isActive = false). */
    enabled: boolean;
}

export interface RegenerateTempPasswordData {
    email: string;
    temporaryPassword: string;
    user: UserRow;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERSON_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u;
const SAUDI_MOBILE_PATTERN = /^\+9665\d{8}$/;

const PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SYMBOLS = "!@#$%&*?";

const userSelect = {
    id: true,
    fullNameEn: true,
    email: true,
    mobileNumber: true,
    role: true,
    isSuperAdmin: true,
    isActive: true,
    mustChangePassword: true,
    activatedAt: true,
    lastLoginAt: true,
    createdAt: true,
} satisfies Prisma.UserSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Minimal shape needed by the hierarchy rules. */
interface HierarchyTarget {
    role: UserRole;
    isSuperAdmin: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Hierarchy rules (single source of truth — the client mirrors them)        */
/* -------------------------------------------------------------------------- */

/** Admin and Super Admin accounts are "protected": only a Super Admin may act on them. */
function isProtectedTarget(target: HierarchyTarget): boolean {
    return target.role === UserRole.ADMIN || target.isSuperAdmin;
}

/** Only a Super Admin may create Admin accounts or promote a user to Admin. */
function canAssignRole(actorIsSuperAdmin: boolean, role: ManagedRole): boolean {
    return actorIsSuperAdmin || role !== UserRole.ADMIN;
}

/** Whether the actor may edit / disable / re-activate / delete / reset the password of the target. */
function canManageTarget(actorIsSuperAdmin: boolean, target: HierarchyTarget): boolean {
    return actorIsSuperAdmin || !isProtectedTarget(target);
}

const FORBIDDEN_TARGET_MESSAGE =
    "You do not have permission to manage Admin or Super Admin accounts. Only a Super Admin can.";
const FORBIDDEN_ROLE_MESSAGE =
    "Only a Super Admin can create Admin accounts or promote users to the Admin role.";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function validUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

function isManagedRole(value: unknown): value is ManagedRole {
    return value === UserRole.ADMIN || value === UserRole.RECEPTIONIST;
}

function pickFrom(set: string): string {
    return set[randomInt(set.length)] as string;
}

function isAcceptablePassword(value: string): boolean {
    return (
        value.length >= 8 &&
        value.length <= 128 &&
        !/\s/.test(value) &&
        /[a-z]/.test(value) &&
        /[A-Z]/.test(value) &&
        /\d/.test(value)
    );
}

/**
 * Normalises Saudi mobile numbers to +9665XXXXXXXX.
 * Accepts: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 00 9665XXXXXXXX (spaces/dashes ignored).
 */
function normalizeSaudiMobile(value: string): string | null {
    let digits = value.replace(/[\s\-().]/g, "");

    if (digits.startsWith("+")) digits = digits.slice(1);
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("966")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);

    const normalized = `+966${digits}`;

    return SAUDI_MOBILE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * The ONE place where the lifecycle status is derived (the client mirrors this exact rule).
 *   ACTIVE   : isActive
 *   PENDING  : !isActive && mustChangePassword && activatedAt === null   (never logged in)
 *   DISABLED : !isActive in every other case
 */
function deriveStatus(
    user: Pick<UserRecord, "isActive" | "mustChangePassword" | "activatedAt">,
): UserAccountStatus {
    if (user.isActive) return "ACTIVE";

    return user.mustChangePassword && !user.activatedAt ? "PENDING" : "DISABLED";
}

function mapUser(user: UserRecord, actorId: string | null): UserRow {
    return {
        id: user.id,
        fullName: user.fullNameEn,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.role as ManagedRole,
        isSuperAdmin: user.isSuperAdmin,
        status: deriveStatus(user),
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        activatedAt: user.activatedAt ? user.activatedAt.toISOString() : null,
        isCurrentUser: actorId !== null && user.id === actorId,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
    };
}

function invalid<T>(error: string, code = "INVALID_INPUT"): UserActionResult<T> {
    return { success: false, error, code };
}

function databaseError<T>(action: string, error: unknown): UserActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002": {
                const target = JSON.stringify(error.meta?.target ?? "");

                if (/mobile/i.test(target)) {
                    return invalid(
                        "This mobile number is already assigned to another user.",
                        "DUPLICATE_MOBILE",
                    );
                }

                return invalid("A user with this email already exists.", "DUPLICATE_EMAIL");
            }
            case "P2003":
                return invalid(
                    "This user is still referenced by other records and cannot be deleted. Disable the account instead.",
                    "HAS_RELATED_RECORDS",
                );
            case "P2025":
                return invalid(
                    "The requested user could not be found. Refresh and try again.",
                    "RECORD_NOT_FOUND",
                );
        }
    }

    return invalid("The operation could not be completed. Please try again.", "DATABASE_ERROR");
}

function mappedTransactionError<T>(error: unknown): UserActionResult<T> | null {
    if (!(error instanceof Error)) return null;

    switch (error.message) {
        case "USER_EMAIL_EXISTS":
            return invalid("A user with this email already exists.", "DUPLICATE_EMAIL");
        case "USER_MOBILE_EXISTS":
            return invalid(
                "This mobile number is already assigned to another user.",
                "DUPLICATE_MOBILE",
            );
        case "USER_NOT_FOUND":
            return invalid(
                "The requested user could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        case "LAST_ADMIN":
            return invalid(
                "At least one active administrator must remain. Promote another user first.",
                "LAST_ADMIN",
            );
        case "PENDING_USER":
            return invalid(
                "This account has not been activated yet. It becomes active after the user's first login.",
                "USER_PENDING",
            );
        case "CANNOT_CHANGE_OWN_ROLE":
            return invalid("You cannot change your own role.", "CANNOT_CHANGE_OWN_ROLE");
        case "CANNOT_DISABLE_SELF":
            return invalid(
                "You cannot disable the account you are currently signed in with.",
                "CANNOT_DISABLE_SELF",
            );
        case "CANNOT_DELETE_SELF":
            return invalid(
                "You cannot delete the account you are currently signed in with.",
                "CANNOT_DELETE_SELF",
            );
        case "FORBIDDEN_TARGET":
            return invalid(FORBIDDEN_TARGET_MESSAGE, "FORBIDDEN_TARGET");
        case "FORBIDDEN_ROLE_ASSIGNMENT":
            return invalid(FORBIDDEN_ROLE_MESSAGE, "FORBIDDEN_ROLE_ASSIGNMENT");
        case "SUPER_ADMIN_ROLE_LOCKED":
            return invalid(
                "A Super Admin account always keeps the Admin role.",
                "SUPER_ADMIN_ROLE_LOCKED",
            );
        default:
            return null;
    }
}

/** Security trail for every rejected hierarchy violation (never throws). */
function reportDenied(action: string, actorId: string, detail: string): void {
    console.warn(`[${action}] DENIED actor=${actorId} reason=${detail}`);
}

function reportIfDenied(action: string, actorId: string, error: unknown): void {
    if (error instanceof Error && error.message.startsWith("FORBIDDEN_")) {
        reportDenied(action, actorId, error.message);
    }
}

function forbidden<T>(
    action: string,
    actorId: string,
    code: "FORBIDDEN_TARGET" | "FORBIDDEN_ROLE_ASSIGNMENT",
): UserActionResult<T> {
    reportDenied(action, actorId, code);

    return invalid(
        code === "FORBIDDEN_TARGET" ? FORBIDDEN_TARGET_MESSAGE : FORBIDDEN_ROLE_MESSAGE,
        code,
    );
}

type AuthorizeResult<T> =
    | { ok: true; organizationId: string; actorId: string; actorIsSuperAdmin: boolean }
    | { ok: false; result: UserActionResult<T> };

function resolveActorId(session: unknown): string | null {
    const candidate =
        (session as { userId?: unknown } | null)?.userId ??
        (session as { user?: { id?: unknown } | null } | null)?.user?.id;

    return typeof candidate === "string" && validUuid(candidate) ? candidate : null;
}

/**
 * Portal guard + hierarchy context. Fails CLOSED: if the acting user cannot be resolved to an
 * active Admin of the same organisation in the database, nothing is executed.
 * `isSuperAdmin` is always read from the database, never from the session or the client.
 */
async function authorize<T>(action: string): Promise<AuthorizeResult<T>> {
    let session: Awaited<ReturnType<typeof requirePortalSession>>;

    try {
        session = await requirePortalSession("admin");
    } catch (error) {
        console.error(`[${action}] Authorization failed`, error);

        return {
            ok: false,
            result: invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED"),
        };
    }

    const actorId = resolveActorId(session);

    if (!actorId) {
        console.error(`[${action}] Authorization failed: the session has no resolvable user id.`);

        return {
            ok: false,
            result: invalid("Your session has expired. Sign in and try again.", "UNAUTHORIZED"),
        };
    }

    try {
        const actor = await prisma.user.findFirst({
            where: {
                id: actorId,
                organizationId: session.organizationId,
                role: UserRole.ADMIN,
                isActive: true,
            },
            select: { id: true, isSuperAdmin: true },
        });

        if (!actor) {
            reportDenied(action, actorId, "ACTOR_NOT_AN_ACTIVE_ADMIN");

            return {
                ok: false,
                result: invalid(
                    "Your account is not allowed to manage users.",
                    "FORBIDDEN",
                ),
            };
        }

        return {
            ok: true,
            organizationId: session.organizationId,
            actorId: actor.id,
            actorIsSuperAdmin: actor.isSuperAdmin,
        };
    } catch (error) {
        console.error(`[${action}] Actor lookup failed`, error);

        return {
            ok: false,
            result: invalid(
                "The operation could not be completed. Please try again.",
                "DATABASE_ERROR",
            ),
        };
    }
}

/** Cryptographically secure temporary-password generator. */
function generateTemporaryPassword(length = 14): string {
    const all = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SYMBOLS;
    const chars = [
        pickFrom(PASSWORD_UPPER),
        pickFrom(PASSWORD_LOWER),
        pickFrom(PASSWORD_DIGITS),
        pickFrom(PASSWORD_SYMBOLS),
    ];

    while (chars.length < length) {
        chars.push(pickFrom(all));
    }

    for (let index = chars.length - 1; index > 0; index--) {
        const swap = randomInt(index + 1);
        [chars[index], chars[swap]] = [chars[swap] as string, chars[index] as string];
    }

    return chars.join("");
}

interface ProfileInput {
    fullName: string;
    email: string;
    mobileNumber: string;
    role: ManagedRole;
}

function parseProfileInput(
    input: { fullName?: unknown; email?: unknown; mobileNumber?: unknown; role?: unknown },
): { ok: true; value: ProfileInput } | { ok: false; error: string; code: string } {
    const fullName = cleanText(input?.fullName).replace(/\s+/g, " ");
    const email = cleanText(input?.email).toLowerCase();
    const mobileRaw = cleanText(input?.mobileNumber);
    const role = input?.role;

    if (
        !fullName ||
        fullName.length < 2 ||
        fullName.length > 120 ||
        !PERSON_NAME_PATTERN.test(fullName)
    ) {
        return { ok: false, error: "Enter a valid full name.", code: "INVALID_NAME" };
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return {
            ok: false,
            error: "Enter a valid official email address.",
            code: "INVALID_EMAIL",
        };
    }

    const mobileNumber = normalizeSaudiMobile(mobileRaw);

    if (!mobileNumber) {
        return {
            ok: false,
            error: "Enter a valid Saudi mobile number: 05XXXXXXXX.",
            code: "INVALID_MOBILE",
        };
    }

    if (!isManagedRole(role)) {
        return { ok: false, error: "Available roles: Admin or Receptionist.", code: "INVALID_ROLE" };
    }

    return { ok: true, value: { fullName, email, mobileNumber, role } };
}

/* -------------------------------------------------------------------------- */
/*  Read                                                                      */
/* -------------------------------------------------------------------------- */

export async function getUsersAction(
    input: GetUsersInput = {},
): Promise<UserActionResult<GetUsersData>> {
    const auth = await authorize<GetUsersData>("getUsersAction");

    if (!auth.ok) return auth.result;

    try {
        const requestedPage =
            Number.isInteger(input?.page) && Number(input.page) > 0 ? Number(input.page) : 1;

        const pageSize =
            Number.isInteger(input?.pageSize) &&
                Number(input.pageSize) >= 1 &&
                Number(input.pageSize) <= MAX_PAGE_SIZE
                ? Number(input.pageSize)
                : PAGE_SIZE;

        const search = cleanText(input?.search).slice(0, 120);
        const role = input?.role ?? "ALL";
        const status = input?.status ?? "ALL";

        if (role !== "ALL" && !isManagedRole(role)) {
            return invalid("Select a valid role.", "INVALID_ROLE");
        }

        if (status !== "ALL" && !["ACTIVE", "PENDING", "DISABLED"].includes(status)) {
            return invalid("Select a valid status.", "INVALID_STATUS");
        }

        const and: Prisma.UserWhereInput[] = [];

        if (search) {
            const or: Prisma.UserWhereInput[] = [
                { fullNameEn: { contains: search, mode: "insensitive" } },
                { fullNameAr: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];

            const digits = search.replace(/\D/g, "");

            if (digits.length >= 3) {
                const local = digits.replace(/^(?:00)?966/, "").replace(/^0/, "");

                if (local.length >= 3) {
                    or.push({ mobileNumber: { contains: local } });
                }
            }

            and.push({ OR: or });
        }

        // Filters mirror `deriveStatus` exactly.
        if (status === "ACTIVE") {
            and.push({ isActive: true });
        } else if (status === "PENDING") {
            and.push({ isActive: false, mustChangePassword: true, activatedAt: null });
        } else if (status === "DISABLED") {
            and.push({
                isActive: false,
                OR: [{ mustChangePassword: false }, { activatedAt: { not: null } }],
            });
        }

        const where: Prisma.UserWhereInput = {
            organizationId: auth.organizationId,
            role: role === "ALL" ? { in: [...MANAGED_ROLES] } : role,
            ...(and.length > 0 ? { AND: and } : {}),
        };

        const total = await prisma.user.count({ where });
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, totalPages);

        const records = await prisma.user.findMany({
            where,
            select: userSelect,
            // Super Admins first, then newest accounts.
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        return {
            success: true,
            data: {
                users: records.map((record) => mapUser(record, auth.actorId)),
                total,
                page,
                pageSize,
                totalPages,
                viewer: { isSuperAdmin: auth.actorIsSuperAdmin },
            },
        };
    } catch (error) {
        console.error("[getUsersAction]", error);

        return {
            success: false,
            error: "Unable to load users. Please refresh the page and try again.",
            code: "FETCH_USERS_FAILED",
        };
    }
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                    */
/* -------------------------------------------------------------------------- */

export async function createUserAction(
    input: CreateUserInput,
): Promise<UserActionResult<{ user: UserRow }>> {
    const auth = await authorize<{ user: UserRow }>("createUserAction");

    if (!auth.ok) return auth.result;

    const parsed = parseProfileInput(input);

    if (!parsed.ok) return invalid(parsed.error, parsed.code);

    const { fullName, email, mobileNumber, role } = parsed.value;

    // Hierarchy: a regular Admin can never create an Admin account.
    if (!canAssignRole(auth.actorIsSuperAdmin, role)) {
        return forbidden("createUserAction", auth.actorId, "FORBIDDEN_ROLE_ASSIGNMENT");
    }

    const temporaryPassword =
        typeof input?.temporaryPassword === "string" ? input.temporaryPassword : "";

    if (temporaryPassword && !isAcceptablePassword(temporaryPassword)) {
        return invalid(
            "The temporary password must be 8–128 characters with uppercase, lowercase and a number, and no spaces.",
            "INVALID_PASSWORD",
        );
    }

    try {
        const plainPassword = temporaryPassword || generateTemporaryPassword();
        const passwordHash = await hashPassword(plainPassword);

        const created = await prisma.$transaction(async (tx) => {
            const existingEmail = await tx.user.findUnique({
                where: { email },
                select: { id: true },
            });

            if (existingEmail) {
                throw new Error("USER_EMAIL_EXISTS");
            }

            const existingMobile = await tx.user.findFirst({
                where: { organizationId: auth.organizationId, mobileNumber },
                select: { id: true },
            });

            if (existingMobile) {
                throw new Error("USER_MOBILE_EXISTS");
            }

            return tx.user.create({
                data: {
                    organizationId: auth.organizationId,
                    email,
                    passwordHash,
                    fullNameEn: fullName,
                    fullNameAr: fullName,
                    mobileNumber,
                    role,
                    // Never grantable from this module (set in the database only).
                    isSuperAdmin: false,
                    // Critical lifecycle defaults — never driven by client input (=> PENDING):
                    isActive: false,
                    mustChangePassword: true,
                    activatedAt: null,
                },
                select: userSelect,
            });
        }, TRANSACTION_OPTIONS);

        return { success: true, data: { user: mapUser(created, auth.actorId) } };
    } catch (error) {
        reportIfDenied("createUserAction", auth.actorId, error);

        return (
            mappedTransactionError<{ user: UserRow }>(error) ??
            databaseError("createUserAction", error)
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Update (name, email, mobile number, role) — never touches the status      */
/* -------------------------------------------------------------------------- */

export async function updateUserAction(
    input: UpdateUserInput,
): Promise<UserActionResult<{ user: UserRow }>> {
    const auth = await authorize<{ user: UserRow }>("updateUserAction");

    if (!auth.ok) return auth.result;

    const userId = cleanText(input?.userId);

    if (!validUuid(userId)) {
        return invalid("The selected user is not valid.", "INVALID_USER");
    }

    const parsed = parseProfileInput(input);

    if (!parsed.ok) return invalid(parsed.error, parsed.code);

    const { fullName, email, mobileNumber, role } = parsed.value;

    // Hierarchy: a regular Admin can never promote anybody (or keep anybody) at the Admin role.
    if (!canAssignRole(auth.actorIsSuperAdmin, role)) {
        return forbidden("updateUserAction", auth.actorId, "FORBIDDEN_ROLE_ASSIGNMENT");
    }

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const target = await tx.user.findFirst({
                where: {
                    id: userId,
                    organizationId: auth.organizationId,
                    role: { in: [...MANAGED_ROLES] },
                },
                select: userSelect,
            });

            if (!target) {
                throw new Error("USER_NOT_FOUND");
            }

            // Hierarchy: regular Admins can never touch Admin / Super Admin accounts.
            if (!canManageTarget(auth.actorIsSuperAdmin, target)) {
                throw new Error("FORBIDDEN_TARGET");
            }

            // A Super Admin account is always an ADMIN.
            if (target.isSuperAdmin && role !== UserRole.ADMIN) {
                throw new Error("SUPER_ADMIN_ROLE_LOCKED");
            }

            if (email !== target.email) {
                const existingEmail = await tx.user.findFirst({
                    where: { email, id: { not: target.id } },
                    select: { id: true },
                });

                if (existingEmail) {
                    throw new Error("USER_EMAIL_EXISTS");
                }
            }

            if (mobileNumber !== target.mobileNumber) {
                const existingMobile = await tx.user.findFirst({
                    where: {
                        organizationId: auth.organizationId,
                        mobileNumber,
                        id: { not: target.id },
                    },
                    select: { id: true },
                });

                if (existingMobile) {
                    throw new Error("USER_MOBILE_EXISTS");
                }
            }

            if (role !== target.role) {
                if (target.id === auth.actorId) {
                    throw new Error("CANNOT_CHANGE_OWN_ROLE");
                }

                // Never demote the last active administrator (prevents a lock-out).
                if (target.role === UserRole.ADMIN && target.isActive) {
                    const otherActiveAdmins = await tx.user.count({
                        where: {
                            organizationId: auth.organizationId,
                            role: UserRole.ADMIN,
                            isActive: true,
                            id: { not: target.id },
                        },
                    });

                    if (otherActiveAdmins === 0) {
                        throw new Error("LAST_ADMIN");
                    }
                }
            }

            // Lifecycle flags (isActive / mustChangePassword / activatedAt) and `isSuperAdmin` are
            // intentionally NOT part of this update, so editing a profile can never change the
            // account status or escalate privileges.
            return tx.user.update({
                where: { id: target.id, organizationId: auth.organizationId },
                data: {
                    fullNameEn: fullName,
                    fullNameAr: fullName,
                    email,
                    mobileNumber,
                    role,
                },
                select: userSelect,
            });
        }, TRANSACTION_OPTIONS);

        return { success: true, data: { user: mapUser(updated, auth.actorId) } };
    } catch (error) {
        reportIfDenied("updateUserAction", auth.actorId, error);

        return (
            mappedTransactionError<{ user: UserRow }>(error) ??
            databaseError("updateUserAction", error)
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Disable / Re-activate                                                     */
/* -------------------------------------------------------------------------- */

export async function toggleUserStatusAction(
    input: ToggleUserStatusInput,
): Promise<UserActionResult<{ user: UserRow }>> {
    const auth = await authorize<{ user: UserRow }>("toggleUserStatusAction");

    if (!auth.ok) return auth.result;

    const userId = cleanText(input?.userId);

    if (!validUuid(userId)) {
        return invalid("The selected user is not valid.", "INVALID_USER");
    }

    if (typeof input?.enabled !== "boolean") {
        return invalid("Select a valid status.", "INVALID_STATUS");
    }

    const enabled = input.enabled;

    try {
        const updated = await prisma.$transaction(async (tx) => {
            const target = await tx.user.findFirst({
                where: {
                    id: userId,
                    organizationId: auth.organizationId,
                    role: { in: [...MANAGED_ROLES] },
                },
                select: userSelect,
            });

            if (!target) {
                throw new Error("USER_NOT_FOUND");
            }

            // Hierarchy: regular Admins can never touch Admin / Super Admin accounts.
            if (!canManageTarget(auth.actorIsSuperAdmin, target)) {
                throw new Error("FORBIDDEN_TARGET");
            }

            // A pending account becomes active only through the first-login flow.
            if (deriveStatus(target) === "PENDING") {
                throw new Error("PENDING_USER");
            }

            // Idempotent: already in the requested state.
            if (target.isActive === enabled) {
                return target;
            }

            if (!enabled) {
                if (target.id === auth.actorId) {
                    throw new Error("CANNOT_DISABLE_SELF");
                }

                if (target.role === UserRole.ADMIN) {
                    const otherActiveAdmins = await tx.user.count({
                        where: {
                            organizationId: auth.organizationId,
                            role: UserRole.ADMIN,
                            isActive: true,
                            id: { not: target.id },
                        },
                    });

                    if (otherActiveAdmins === 0) {
                        throw new Error("LAST_ADMIN");
                    }
                }
            }

            // Disable  -> isActive = false (+ activatedAt stamped, so it can never read as PENDING).
            // Re-activate -> isActive = true.
            // mustChangePassword is never touched here.
            return tx.user.update({
                where: { id: target.id, organizationId: auth.organizationId },
                data: {
                    isActive: enabled,
                    activatedAt: target.activatedAt ?? new Date(),
                },
                select: userSelect,
            });
        }, TRANSACTION_OPTIONS);

        return { success: true, data: { user: mapUser(updated, auth.actorId) } };
    } catch (error) {
        reportIfDenied("toggleUserStatusAction", auth.actorId, error);

        return (
            mappedTransactionError<{ user: UserRow }>(error) ??
            databaseError("toggleUserStatusAction", error)
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                    */
/* -------------------------------------------------------------------------- */

export async function deleteUserAction(
    userId: string,
): Promise<UserActionResult<{ id: string }>> {
    const auth = await authorize<{ id: string }>("deleteUserAction");

    if (!auth.ok) return auth.result;

    const id = cleanText(userId);

    if (!validUuid(id)) {
        return invalid("The selected user is not valid.", "INVALID_USER");
    }

    try {
        const deletedId = await prismaBase.$transaction(async (tx) => {
            const target = await tx.user.findFirst({
                where: {
                    id,
                    organizationId: auth.organizationId,
                    role: { in: [...MANAGED_ROLES] },
                },
                select: { id: true, role: true, isActive: true, isSuperAdmin: true },
            });

            if (!target) {
                throw new Error("USER_NOT_FOUND");
            }

            // Hierarchy: regular Admins can never delete Admin / Super Admin accounts.
            if (!canManageTarget(auth.actorIsSuperAdmin, target)) {
                throw new Error("FORBIDDEN_TARGET");
            }

            if (target.id === auth.actorId) {
                throw new Error("CANNOT_DELETE_SELF");
            }

            if (target.role === UserRole.ADMIN && target.isActive) {
                const otherActiveAdmins = await tx.user.count({
                    where: {
                        organizationId: auth.organizationId,
                        role: UserRole.ADMIN,
                        isActive: true,
                        id: { not: target.id },
                    },
                });

                if (otherActiveAdmins === 0) {
                    throw new Error("LAST_ADMIN");
                }
            }

            // Same approach as the Doctors module: the audit trail of the removed account is deleted
            // inside the same transaction (tenant-scoped, prismaBase because the regular client
            // enforces append-only audit logs), otherwise the Restrict foreign key would block it.
            await tx.auditLog.deleteMany({
                where: { organizationId: auth.organizationId, userId: target.id },
            });

            await tx.user.delete({
                where: { id: target.id, organizationId: auth.organizationId },
            });

            return target.id;
        }, TRANSACTION_OPTIONS);

        return { success: true, data: { id: deletedId } };
    } catch (error) {
        reportIfDenied("deleteUserAction", auth.actorId, error);

        return (
            mappedTransactionError<{ id: string }>(error) ??
            databaseError("deleteUserAction", error)
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Regenerate temporary password (Pending accounts only)                     */
/* -------------------------------------------------------------------------- */

export async function regenerateTempPasswordAction(
    userId: string,
): Promise<UserActionResult<RegenerateTempPasswordData>> {
    const auth = await authorize<RegenerateTempPasswordData>("regenerateTempPasswordAction");

    if (!auth.ok) return auth.result;

    const id = cleanText(userId);

    if (!validUuid(id)) {
        return invalid("The selected user is not valid.", "INVALID_USER");
    }

    try {
        const target = await prisma.user.findFirst({
            where: {
                id,
                organizationId: auth.organizationId,
                role: { in: [...MANAGED_ROLES] },
            },
            select: userSelect,
        });

        if (!target) {
            return invalid(
                "The requested user could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }

        // Hierarchy: resetting credentials of an Admin / Super Admin is a Super Admin privilege.
        if (!canManageTarget(auth.actorIsSuperAdmin, target)) {
            return forbidden("regenerateTempPasswordAction", auth.actorId, "FORBIDDEN_TARGET");
        }

        if (deriveStatus(target) !== "PENDING") {
            return invalid(
                "A temporary password can only be regenerated for pending accounts that have not logged in yet.",
                "NOT_PENDING",
            );
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);

        // Conditional, tenant-scoped update: it only applies while the account is still pending.
        const result = await prisma.user.updateMany({
            where: {
                id: target.id,
                organizationId: auth.organizationId,
                role: { in: [...MANAGED_ROLES] },
                isActive: false,
                activatedAt: null,
            },
            data: {
                passwordHash,
                mustChangePassword: true,
            },
        });

        if (result.count === 0) {
            return invalid(
                "A temporary password can only be regenerated for pending accounts that have not logged in yet.",
                "NOT_PENDING",
            );
        }

        return {
            success: true,
            data: {
                email: target.email,
                temporaryPassword,
                user: mapUser({ ...target, mustChangePassword: true }, auth.actorId),
            },
        };
    } catch (error) {
        return databaseError("regenerateTempPasswordAction", error);
    }
}