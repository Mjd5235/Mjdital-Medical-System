import Image from "next/image";
import { BrandLogo } from "@/components/brand/logo";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { directionForLocale, type Portal } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";
import { LoginBackLink } from "@/components/auth/login-back-link";

type LoginScreenProps = {
  portal: Portal;
  locale: Locale;
  nextPath: string;
  demoHint: { email: string; password: string } | null;
};

export function LoginScreen({
  portal,
  locale,
  nextPath,
  demoHint,
}: LoginScreenProps) {
  const t = getDictionary(locale);
  const dir = directionForLocale(locale);
  const caption = t.portals[portal].badge;
  const isArabic = locale === "ar";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-white dark:bg-background">
      <div className="flex min-h-dvh" dir={isArabic ? "rtl" : "ltr"}>
        <section className="relative hidden min-h-dvh w-1/2 overflow-hidden bg-[#D7ECFB] lg:block">
          <Image
            src="/medical_portal_left_illustration_v1.png"
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover object-left"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#9fd0f3]/90 to-transparent px-10 pb-12 pt-24">
            <p
              dir={dir}
              className="text-2xl font-extrabold text-[#0F172A]"
            >
              {locale === "ar"
                ? "رعاية صحية متكاملة، بأمان وسهولة"
                : "Complete care, safely and simply"}
            </p>
            <p dir={dir} className="mt-2 text-sm font-medium text-[#334155]">
              {caption}
            </p>
          </div>
        </section>

        <section
          dir={dir}
          lang={locale}
          className="flex w-full min-h-dvh flex-col bg-white px-5 py-6 dark:bg-background sm:px-10 lg:w-1/2 lg:px-16"
        >
          <header className="flex items-center justify-between gap-3">
            <BrandLogo />
            <div className="flex items-center gap-3" dir="ltr">
              <LanguageToggle locale={locale} variant="compact" />
              <span className="hidden h-6 w-px bg-[#E2E8F0] sm:block" />
              <ThemeToggle
                lightLabel={t.lightMode}
                darkLabel={t.darkMode}
                variant="compact"
              />
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-10">
            <LoginBackLink locale={locale} />
            <p className="mb-3 text-sm font-bold text-[#0066CC] dark:text-primary">
              {caption}
            </p>
            <h1 className="text-3xl font-extrabold leading-snug text-[#0F172A] dark:text-white sm:text-[34px]">
              {t.login.title}
            </h1>
            <p className="mt-2 text-base text-[#64748B] dark:text-muted">
              {t.login.subtitle}
            </p>

            <LoginForm
              portal={portal}
              locale={locale}
              nextPath={nextPath}
              demoHint={demoHint}
            />

            <p className="mt-8 text-center text-sm text-[#64748B]">
              {t.login.supportPrompt}{" "}
              <a
                href="mailto:support@mjdital.com"
                className="font-semibold text-[#0D9488] hover:underline"
              >
                {t.login.supportLink}
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
