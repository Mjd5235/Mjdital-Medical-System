"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/types";

export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    throw new Error("Unsupported locale");
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
