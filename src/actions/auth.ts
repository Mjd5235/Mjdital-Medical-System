"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { portalLoginPath, safeNextPath } from "@/lib/auth/safe-path";
import {
  createSessionToken,
  SESSION_COOKIE,
} from "@/lib/auth/session-token";
import { authenticatePortalUser } from "@/lib/services/auth.service";
import type { Portal } from "@/lib/i18n/get-locale";

const SHORT_SESSION_SECONDS = 60 * 60 * 8;
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 30;

export type LoginFormState = {
  status: "idle" | "error" | "success";
  message: string;
};

const PORTALS: readonly Portal[] = ["admin", "reception", "doctor"];

function isPortal(value: string): value is Portal {
  return PORTALS.includes(value as Portal);
}

function loginMessage(portal: Portal, code: string): string {
  const arabic = portal !== "doctor";
  if (code === "unauthorized_portal") {
    return arabic
      ? "ليس لديك صلاحية الوصول إلى هذه البوابة"
      : "You are not authorized to access this portal.";
  }
  if (code === "inactive") {
    return arabic
      ? "هذا الحساب غير نشط. تواصل مع الإدارة."
      : "This account is inactive. Contact administration.";
  }
  if (code === "misconfigured") {
    return arabic
      ? "تعذر إكمال تسجيل الدخول حالياً. حاول مرة أخرى."
      : "Unable to complete sign-in right now. Please try again.";
  }
  return arabic
    ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
    : "Email or password is incorrect.";
}

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const portalValue = String(formData.get("portal") ?? "");
  if (!isPortal(portalValue)) {
    return {
      status: "error",
      message: "Invalid portal.",
    };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const nextPath = safeNextPath(
    portalValue,
    String(formData.get("next") ?? "") || null,
  );

  try {
    const headerStore = await headers();
    const result = await authenticatePortalUser({
      email,
      password,
      portal: portalValue,
      ipAddress: headerStore.get("x-forwarded-for") ?? undefined,
      userAgent: headerStore.get("user-agent") ?? undefined,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: loginMessage(portalValue, result.code),
      };
    }

    const maxAge = remember ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS;
    const token = await createSessionToken(result.session, maxAge);
    if (!token) {
      return {
        status: "error",
        message: loginMessage(portalValue, "misconfigured"),
      };
    }

    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge,
    });
  } catch (error) {
    console.error("Portal login failed", error);
    return {
      status: "error",
      message: loginMessage(portalValue, "misconfigured"),
    };
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

export async function signOutAction(
  portal?: Portal | FormData,
): Promise<void> {
  const resolved =
    typeof portal === "string" && isPortal(portal) ? portal : undefined;
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect(resolved ? portalLoginPath(resolved) : "/");
}

export async function signOutFromPortalAction(portal: Portal): Promise<void> {
  await signOutAction(portal);
}

export async function enterPortalAction(portal: Portal): Promise<void> {
  redirect(portalLoginPath(portal));
}
