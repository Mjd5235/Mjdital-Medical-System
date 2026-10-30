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

const RESET_PATH = "/doctor/reset-password";
const DOCTOR_HOME = "/doctor/dashboard";
const INACTIVE_PATH = "/doctor/inactive-account";

type AccountStatus = {
  isActive: boolean;
  mustChangePassword: boolean;
  doctor: { isActive: boolean } | null;
};

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

  response.cookies.set(
    LOCALE_COOKIE,
    defaultLocaleForPortal(portal),
    {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    },
  );
}

function withRequestContext(
  request: NextRequest,
  session: SessionUser | null,
): Headers {
  const headers = new Headers(request.headers);

  headers.set("x-pathname", request.nextUrl.pathname);

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

function redirectTo(
  request: NextRequest,
  pathname: string,
  portal: Portal | null,
  next?: string,
): NextResponse {
  const url = request.nextUrl.clone();

  url.pathname = pathname;
  url.search = "";

  if (next) {
    url.searchParams.set("next", next);
  }

  const response = NextResponse.redirect(url);

  applyLocaleCookie(request, response, portal);

  return response;
}

/**
 * Sends a deactivated account to /doctor/inactive-account.
 *
 * The session cookie is intentionally kept: the inactive page itself verifies
 * (against the database) that the signed-in account really is inactive, which
 * is what restricts that page to redirected users only.
 */
function redirectToInactive(
  request: NextRequest,
  portal: Portal | null,
): NextResponse {
  const response = redirectTo(request, INACTIVE_PATH, portal);

  response.headers.set("Cache-Control", "no-store");

  return response;
}

/**
 * Sends an authenticated session whose account no longer exists back to the
 * login page with the stale cookie cleared (prevents redirect loops).
 */
function redirectToLoginClearingSession(
  request: NextRequest,
  portal: Portal,
): NextResponse {
  const response = redirectTo(request, portalLoginPath(portal), portal);

  response.cookies.delete(SESSION_COOKIE);
  response.headers.set("Cache-Control", "no-store");

  return response;
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
): Promise<AccountStatus | null> {
  return prisma.user.findFirst({
    where: {
      id: session.userId,
      organizationId: session.organizationId,
    },
    select: {
      isActive: true,
      mustChangePassword: true,
      doctor: {
        select: {
          isActive: true,
        },
      },
    },
  });
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

  const passThrough = (): NextResponse => {
    const response = NextResponse.next({
      request: {
        headers: withRequestContext(request, session),
      },
    });

    applyLocaleCookie(request, response, portal);

    return response;
  };

  // ---------------------------------------------------------------------
  // /doctor/inactive-account is only reachable by an authenticated account
  // that is genuinely inactive (i.e. someone who was redirected here).
  // Everyone else is sent to /doctor/login.
  // ---------------------------------------------------------------------
  if (pathname === INACTIVE_PATH) {
    const toLogin = (): NextResponse =>
      redirectTo(request, portalLoginPath("doctor"), "doctor");

    if (!session || !session.organizationId) {
      return toLogin();
    }

    let account: AccountStatus | null;

    try {
      account = await lookupAccount(session);
    } catch (error) {
      console.error("[proxy] Account status lookup failed", error);

      return verificationUnavailable();
    }

    if (!account || !isAccountInactive(session.role, account)) {
      return toLogin();
    }

    const response = passThrough();

    response.headers.set("Cache-Control", "no-store");

    return response;
  }

  if (!portal) {
    return passThrough();
  }

  const isLogin = pathname === portalLoginPath(portal);
  const isReset = pathname === RESET_PATH;

  if (!session || !session.organizationId) {
    if (isLogin || isPublicPath(pathname)) {
      return passThrough();
    }

    const next =
      pathname.startsWith(`/${portal}/`) &&
        !pathname.includes("//")
        ? pathname
        : undefined;

    return redirectTo(
      request,
      portalLoginPath(portal),
      portal,
      next,
    );
  }

  if (!portalAllowsRole(portal, session.role)) {
    if (isLogin || isPublicPath(pathname)) {
      return passThrough();
    }

    return redirectTo(
      request,
      homePathForRole(session.role),
      portal,
    );
  }

  // ---------------------------------------------------------------------
  // Account activity enforcement (all authenticated roles).
  // The database is the source of truth so that deactivation takes effect
  // immediately, even for sessions that were issued before the suspension.
  // ---------------------------------------------------------------------
  let account: AccountStatus | null;

  try {
    account = await lookupAccount(session);
  } catch (error) {
    console.error("[proxy] Account status lookup failed", error);

    return verificationUnavailable();
  }

  if (!account) {
    // The session points to an account that no longer exists.
    if (isLogin || isPublicPath(pathname)) {
      return passThrough();
    }

    return redirectToLoginClearingSession(request, portal);
  }

  if (isAccountInactive(session.role, account)) {
    // Public/login routes stay reachable (no redirect loop); every
    // protected route is intercepted and sent to /doctor/inactive-account.
    if (isLogin || isPublicPath(pathname)) {
      return passThrough();
    }

    return redirectToInactive(request, portal);
  }

  // ---------------------------------------------------------------------
  // Active account: normal flow.
  // ---------------------------------------------------------------------
  if (session.role === UserRole.DOCTOR) {
    if (account.mustChangePassword) {
      if (isReset) {
        return passThrough();
      }

      return redirectTo(request, RESET_PATH, portal);
    }

    if (isReset) {
      return redirectTo(request, DOCTOR_HOME, portal);
    }
  }

  if (isLogin) {
    return redirectTo(
      request,
      portalHomePath(portal),
      portal,
    );
  }

  if (isPublicPath(pathname)) {
    return passThrough();
  }

  return passThrough();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};