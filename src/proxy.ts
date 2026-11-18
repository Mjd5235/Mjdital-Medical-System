// proxy.ts
// Next.js 16: keep this file name and export (`proxy`).
// Next.js 15: rename the file to middleware.ts. The default export below is picked up
// as the middleware, and Prisma requires the Node.js runtime for it.
//
// Pages in use (and the only ones handled here):
//   /auth/reset-password     -> forced password change (all roles)
//   /auth/inactive-account   -> explicitly disabled accounts (?portal=admin|reception|doctor)

import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { portalAllowsRole } from "@/lib/auth/roles";
import {
  homePathForRole,
  isPublicPath,
  portalHomePath,
  portalLoginPath,
} from "@/lib/auth/safe-path";
import {
  parseSessionToken,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth/session-token";
import {
  defaultLocaleForPortal,
  portalFromPathname,
  type Portal,
} from "@/lib/i18n/get-locale";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/types";

const RESET_PATH = "/auth/reset-password";
const INACTIVE_PATH = "/auth/inactive-account";

/**
 * Query parameter carrying the origin portal (admin | reception | doctor)
 * to the inactive-account page.
 */
const ORIGIN_PORTAL_PARAM = "portal";

/**
 * Remembers the portal whose login page the user last opened. It is what lets
 * pages that live outside any portal (/auth/...) know where the user came from.
 * It is only a UI hint: it is validated against the user's role before use.
 */
const ORIGIN_PORTAL_COOKIE = "mjdital-origin-portal";

/**
 * Used only when no portal can be derived at all.
 */
const FALLBACK_LOGIN_PORTAL: Portal = "doctor";

const ALL_PORTALS = ["admin", "reception", "doctor"] as Portal[];

type AccountStatus = {
  isActive: boolean;
  mustChangePassword: boolean;
  doctor: { isActive: boolean } | null;
};

type AccountLookup =
  | { ok: true; account: AccountStatus | null }
  | { ok: false };

function hasSession(
  session: SessionUser | null,
): session is SessionUser {
  return Boolean(session && session.organizationId);
}

/**
 * Validates an untrusted value against the portal allow-list.
 */
function parsePortal(value: string | null | undefined): Portal | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  return (ALL_PORTALS as string[]).includes(normalized)
    ? (normalized as Portal)
    : null;
}

/**
 * Resolves the portal the user belongs to / signed in from.
 * Priority:
 *   1. the portal of the current URL (if the role may use it)
 *   2. the portal whose login page the user opened (cookie, if the role may use it)
 *   3. the first portal the role is allowed to use
 *   4. the fallback portal
 */
function resolveOriginPortal(
  request: NextRequest,
  role: SessionUser["role"],
  requestPortal: Portal | null,
): Portal {
  const candidates: Array<Portal | null> = [
    requestPortal,
    parsePortal(request.cookies.get(ORIGIN_PORTAL_COOKIE)?.value),
    ...ALL_PORTALS,
  ];

  for (const candidate of candidates) {
    if (candidate && portalAllowsRole(candidate, role)) {
      return candidate;
    }
  }

  return FALLBACK_LOGIN_PORTAL;
}

async function readSession(
  request: NextRequest,
): Promise<SessionUser | null> {
  try {
    return await parseSessionToken(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
  } catch (error) {
    console.error("[proxy] Session verification failed", error);
    return null;
  }
}

function applyLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  portal: Portal | null,
): void {
  const stored = request.cookies.get(LOCALE_COOKIE)?.value;

  if (isLocale(stored)) return;

  response.cookies.set(LOCALE_COOKIE, defaultLocaleForPortal(portal), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function applyOriginPortalCookie(
  response: NextResponse,
  portal: Portal,
): void {
  response.cookies.set(ORIGIN_PORTAL_COOKIE, portal, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function withRequestContext(
  request: NextRequest,
  session: SessionUser | null,
): Headers {
  const headers = new Headers(request.headers);

  headers.set("x-pathname", request.nextUrl.pathname);

  // Never trust identity headers coming from the client.
  headers.delete("x-organization-id");
  headers.delete("x-user-role");
  headers.delete("x-user-id");

  if (session) {
    headers.set("x-organization-id", session.organizationId);
    headers.set("x-user-role", session.role);
    headers.set("x-user-id", session.userId);
  }

  return headers;
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function redirectTo(
  request: NextRequest,
  pathname: string,
  portal: Portal | null,
  params?: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();

  url.pathname = pathname;
  url.search = "";

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = NextResponse.redirect(url);

  applyLocaleCookie(request, response, portal);

  return response;
}

/** Priority 1: every account with a temporary password goes to the reset page. */
function redirectToReset(
  request: NextRequest,
  portal: Portal | null,
): NextResponse {
  return noStore(redirectTo(request, RESET_PATH, portal));
}

/**
 * Priority 2: accounts explicitly disabled by an administrator.
 * Always appends the origin portal (?portal=admin|reception|doctor) so the
 * inactive page knows which login page to send the user back to.
 */
function redirectToInactive(
  request: NextRequest,
  role: SessionUser["role"],
  requestPortal: Portal | null,
): NextResponse {
  const origin = resolveOriginPortal(request, role, requestPortal);

  return noStore(
    redirectTo(request, INACTIVE_PATH, origin, {
      [ORIGIN_PORTAL_PARAM]: origin,
    }),
  );
}

/** Priority 3: active account with a permanent password goes to its own dashboard. */
function redirectToRoleHome(
  request: NextRequest,
  role: SessionUser["role"],
  portal: Portal | null,
): NextResponse {
  return noStore(redirectTo(request, homePathForRole(role), portal));
}

/**
 * Session points to an account that no longer exists: back to login with the
 * stale cookie cleared (prevents redirect loops).
 */
function redirectToLoginClearingSession(
  request: NextRequest,
  portal: Portal,
): NextResponse {
  const response = redirectTo(request, portalLoginPath(portal), portal);

  response.cookies.delete(SESSION_COOKIE);

  return noStore(response);
}

function verificationUnavailable(): NextResponse {
  return new NextResponse(
    "Unable to verify account access. Please try again.",
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function lookupAccount(
  session: SessionUser,
): Promise<AccountLookup> {
  try {
    // ONE round trip (user + linked doctor) instead of two sequential Prisma
    // queries. Same semantics as before: no row -> account is null; no doctor
    // row -> doctor is null. Both ids are bound parameters and the userId /
    // organizationId were already validated as UUIDs by parseSessionToken.
    const rows = await prisma.$queryRaw<
      Array<{
        isActive: boolean;
        mustChangePassword: boolean;
        hasDoctor: boolean;
        doctorIsActive: boolean | null;
      }>
    >`
      SELECT
        u.is_active AS "isActive",
        u.must_change_password AS "mustChangePassword",
        (d.id IS NOT NULL) AS "hasDoctor",
        d.is_active AS "doctorIsActive"
      FROM users u
      LEFT JOIN doctors d ON d.user_id = u.id
      WHERE u.id = ${session.userId}::uuid
        AND u.organization_id = ${session.organizationId}::uuid
      LIMIT 1
    `;

    const row = rows[0];

    const account: AccountStatus | null = row
      ? {
        isActive: row.isActive,
        mustChangePassword: row.mustChangePassword,
        doctor: row.hasDoctor
          ? { isActive: Boolean(row.doctorIsActive) }
          : null,
      }
      : null;

    return { ok: true, account };
  } catch (error) {
    console.error("[proxy] Account status lookup failed", error);
    return { ok: false };
  }
}

function isAccountInactive(
  role: SessionUser["role"],
  account: AccountStatus,
): boolean {
  return (
    !account.isActive ||
    (role === UserRole.DOCTOR && !account.doctor?.isActive)
  );
}

export async function proxy(
  request: NextRequest,
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const portal = portalFromPathname(pathname);
  const session = await readSession(request);

  const passThrough = (
    localePortal: Portal | null = portal,
  ): NextResponse => {
    const response = NextResponse.next({
      request: {
        headers: withRequestContext(request, session),
      },
    });

    applyLocaleCookie(request, response, localePortal);

    // Remember which portal's login page the user opened, so that pages
    // outside the portals (/auth/inactive-account) can send them back to it.
    if (portal && pathname === portalLoginPath(portal)) {
      applyOriginPortalCookie(response, portal);
    }

    return response;
  };

  // ---------------------------------------------------------------------
  // /auth/inactive-account
  // Only reachable by an authenticated account that was explicitly disabled
  // (isActive/doctor.isActive false AND mustChangePassword false).
  //   - no session                   -> login of the portal named in ?portal
  //   - deleted account              -> login (stale cookie cleared)
  //   - temporary password pending   -> reset page (activation flow)
  //   - active account               -> own dashboard
  // The ?portal parameter is always normalised to the user's origin portal,
  // so it cannot be spoofed or left missing.
  // ---------------------------------------------------------------------
  if (pathname === INACTIVE_PATH) {
    const requested = parsePortal(
      request.nextUrl.searchParams.get(ORIGIN_PORTAL_PARAM),
    );

    if (!hasSession(session)) {
      const loginPortal =
        requested ??
        parsePortal(request.cookies.get(ORIGIN_PORTAL_COOKIE)?.value) ??
        FALLBACK_LOGIN_PORTAL;

      return redirectTo(
        request,
        portalLoginPath(loginPortal),
        loginPortal,
      );
    }

    const origin = resolveOriginPortal(request, session.role, null);
    const lookup = await lookupAccount(session);

    if (!lookup.ok) return verificationUnavailable();

    const { account } = lookup;

    if (!account) {
      return redirectToLoginClearingSession(request, origin);
    }

    if (account.mustChangePassword) {
      return redirectToReset(request, origin);
    }

    if (!isAccountInactive(session.role, account)) {
      return redirectToRoleHome(request, session.role, origin);
    }

    if (requested !== origin) {
      // Missing / wrong parameter: rewrite the URL once with the right value.
      return redirectToInactive(request, session.role, null);
    }

    return noStore(passThrough(origin));
  }

  // ---------------------------------------------------------------------
  // /auth/reset-password (all roles).
  // Reachable only while the database record has mustChangePassword === true.
  // This also covers disabled-but-pending accounts: changing the password for
  // the first time is what activates them.
  //   - no session / deleted account       -> login
  //   - password already permanent
  //       - explicitly disabled            -> inactive page (?portal=...)
  //       - active                         -> own dashboard
  // ---------------------------------------------------------------------
  if (pathname === RESET_PATH) {
    if (!hasSession(session)) {
      const loginPortal =
        parsePortal(request.cookies.get(ORIGIN_PORTAL_COOKIE)?.value) ??
        FALLBACK_LOGIN_PORTAL;

      return redirectTo(
        request,
        portalLoginPath(loginPortal),
        loginPortal,
      );
    }

    const origin = resolveOriginPortal(request, session.role, null);
    const lookup = await lookupAccount(session);

    if (!lookup.ok) return verificationUnavailable();

    const { account } = lookup;

    if (!account) {
      return redirectToLoginClearingSession(request, origin);
    }

    if (!account.mustChangePassword) {
      if (isAccountInactive(session.role, account)) {
        return redirectToInactive(request, session.role, null);
      }

      return redirectToRoleHome(request, session.role, origin);
    }

    return noStore(passThrough(origin));
  }

  // Anything outside the three portals (and the pages above) is not guarded here.
  if (!portal) {
    return passThrough();
  }

  const isLogin = pathname === portalLoginPath(portal);

  // Public, non-login routes (sign-out, locale endpoints, ...) are always
  // reachable so that nobody is ever trapped.
  if (isPublicPath(pathname) && !isLogin) {
    return passThrough();
  }

  // ---------------------------------------------------------------------
  // No session: only the login page is reachable.
  // ---------------------------------------------------------------------
  if (!hasSession(session)) {
    if (isLogin) {
      return passThrough();
    }

    const next =
      pathname.startsWith(`/${portal}/`) && !pathname.includes("//")
        ? pathname
        : undefined;

    return redirectTo(
      request,
      portalLoginPath(portal),
      portal,
      next ? { next } : undefined,
    );
  }

  // The database is the source of truth so that every change (deactivation,
  // temporary password issued, ...) takes effect immediately, even for
  // sessions issued earlier.
  const lookup = await lookupAccount(session);

  if (!lookup.ok) return verificationUnavailable();

  const { account } = lookup;

  if (!account) {
    if (isLogin) {
      return passThrough();
    }

    return redirectToLoginClearingSession(request, portal);
  }

  // ---------------------------------------------------------------------
  // Priority 1: temporary password -> reset page, whatever portal was
  // requested and whatever the isActive flag says (pending accounts activate
  // themselves by changing the password).
  // ---------------------------------------------------------------------
  if (account.mustChangePassword) {
    return redirectToReset(request, portal);
  }

  // ---------------------------------------------------------------------
  // Priority 2: mustChangePassword === false and the account is disabled
  // -> explicitly disabled by an admin -> static inactive page, carrying the
  // origin portal (?portal=admin|reception|doctor).
  // The login page stays reachable (no redirect loop).
  // ---------------------------------------------------------------------
  if (isAccountInactive(session.role, account)) {
    if (isLogin) {
      return passThrough();
    }

    return redirectToInactive(request, session.role, portal);
  }

  // ---------------------------------------------------------------------
  // Priority 3: active account with a permanent password.
  // Block cross-portal access (e.g. a receptionist opening /admin) by sending
  // the user to the home of their own role.
  // ---------------------------------------------------------------------
  if (!portalAllowsRole(portal, session.role)) {
    return redirectToRoleHome(request, session.role, portal);
  }

  // Already signed in: the login page just forwards to the portal home.
  if (isLogin) {
    return redirectTo(request, portalHomePath(portal), portal);
  }

  return passThrough();
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};