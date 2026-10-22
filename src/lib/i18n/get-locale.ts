import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/types";

export type Portal = "admin" | "reception" | "doctor";

export function defaultLocaleForPortal(portal: Portal | null): Locale {
  return portal === "doctor" ? "en" : "ar";
}

export function portalFromPathname(pathname: string): Portal | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/reception")) return "reception";
  if (pathname.startsWith("/doctor")) return "doctor";
  return null;
}

export async function getLocale(portal?: Portal | null): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const stored = cookieStore.get(LOCALE_COOKIE)?.value;
    if (isLocale(stored)) {
      return stored;
    }
  } catch (error) {
    
  }

  return defaultLocaleForPortal(portal ?? null);
}

export function directionForLocale(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}