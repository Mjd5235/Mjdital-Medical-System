import { NextResponse, type NextRequest } from "next/server";
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

async function readSession(request: NextRequest): Promise<SessionUser | null> {
  try {
    return await parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    console.error("Failed to parse portal session", error);
    return null;
  }
}

function applyLocaleCookie(
  request: NextRequest,
  response: NextResponse,
  portal: Portal | null,
) {
  const stored = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) {
    return;
  }
  response.cookies.set(LOCALE_COOKIE, defaultLocaleForPortal(portal), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function withRequestContext(
  request: NextRequest,
  session: SessionUser | null,
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  if (session) {
    requestHeaders.set("x-clinic-id", session.clinicId);
    requestHeaders.set("x-user-role", session.role);
    requestHeaders.set("x-user-id", session.userId);
  }
  return requestHeaders;
}

export async function proxy(request: NextRequest) {
  const portal = portalFromPathname(request.nextUrl.pathname);
  const session = await readSession(request);

  const passThrough = () => {
    const response = NextResponse.next({
      request: { headers: withRequestContext(request, session) },
    });
    applyLocaleCookie(request, response, portal);
    return response;
  };

  if (!portal) {
    return passThrough();
  }

  const isLogin = request.nextUrl.pathname === portalLoginPath(portal);

  if (isLogin) {
    if (session && portalAllowsRole(portal, session.role) && session.clinicId) {
      const url = request.nextUrl.clone();
      url.pathname = portalHomePath(portal);
      url.search = "";
      return NextResponse.redirect(url);
    }
    return passThrough();
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    return passThrough();
  }

  if (!session || !session.clinicId) {
    const url = request.nextUrl.clone();
    url.pathname = portalLoginPath(portal);
    url.search = "";
    const intended = request.nextUrl.pathname;
    if (intended.startsWith(`/${portal}/`) && !intended.includes("//")) {
      url.searchParams.set("next", intended);
    }
    const redirectResponse = NextResponse.redirect(url);
    applyLocaleCookie(request, redirectResponse, portal);
    return redirectResponse;
  }

  if (!portalAllowsRole(portal, session.role)) {
    const url = request.nextUrl.clone();
    url.pathname = homePathForRole(session.role);
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    applyLocaleCookie(request, redirectResponse, portal);
    return redirectResponse;
  }

  const response = NextResponse.next({
    request: { headers: withRequestContext(request, session) },
  });
  applyLocaleCookie(request, response, portal);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
