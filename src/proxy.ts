
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

  if (session.role === UserRole.DOCTOR) {
    let doctorAccount: {
      isActive: boolean;
      mustChangePassword: boolean;
      doctor: { isActive: boolean } | null;
    } | null;

    try {
      doctorAccount = await prisma.user.findFirst({
        where: {
          id: session.userId,
          organizationId: session.organizationId,
          role: UserRole.DOCTOR,
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
    } catch (error) {
      console.error("[proxy] Doctor status lookup failed", error);

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

    if (
      !doctorAccount ||
      !doctorAccount.isActive ||
      !doctorAccount.doctor?.isActive
    ) {
      return redirectTo(
        request,
        portalLoginPath("doctor"),
        portal,
      );
    }

    if (doctorAccount.mustChangePassword) {
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
