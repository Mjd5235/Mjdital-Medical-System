export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "mjdital_locale";

export function isLocale(value: string | undefined): value is Locale {
  return value === "ar" || value === "en";
}
