import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardPlus,
  ShieldCheck,
} from "lucide-react";

import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/get-locale";
import { BrandLogo } from "@/components/brand/logo";

export const instant = false;


const portals = [
  {
    id: "admin",
    href: "/admin/login",
    icon: ShieldCheck,
    color: "blue",
  },
  {
    id: "doctor",
    href: "/doctor/login",
    icon: ClipboardPlus,
    color: "teal",
  },
  {
    id: "reception",
    href: "/reception/login",
    icon: CalendarDays,
    color: "teal",
  },
] as const;

export default async function HomePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const isArabic = locale === "ar";

  const portalContent = {
    admin: t.portals.admin,
    doctor: t.portals.doctor,
    reception: t.portals.reception,
  };

  // ترتيب البطاقات في الواجهة العربية مطابق للصورة المرجعية.
  const orderedPortals = isArabic
    ? ["admin", "doctor", "reception"] as const
    : ["admin", "doctor", "reception"] as const;

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      lang={locale}
      className="flex min-h-dvh flex-col bg-[#F8FAFC] text-[#1E293B] transition-colors dark:bg-slate-950 dark:text-slate-100"
    >
      <header className="flex w-full items-center justify-between gap-4 py-4 lg:px-4 ">
        <div className={isArabic ? "flex items-center gap-3 sm: mr-2" : "flex items-center gap-3 sm: ml-2"}>
          <BrandLogo />
        </div>
        <div className={isArabic ? "flex items-center gap-3 sm: ml-2 gap-0" : "flex items-center gap-3 sm: mr-2 gap-0"} dir="ltr">
          <LanguageToggle locale={locale} />
          <span className="hidden h-6 w-px bg-[#E2E8F0] sm:block" />
          <ThemeToggle
            lightLabel={t.lightMode}
            darkLabel={t.darkMode}
            variant="compact"
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col justify-center px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-12 lg:px-[55px]">
        <section className="mb-9 text-center sm:mb-11">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-[#0F1F38] dark:text-white sm:text-4xl lg:text-[48px]">
            {isArabic
              ? "مرحباً بك في نظام مجديتال الطبي"
              : "Welcome to Mjdital Medical System"}
          </h1>

          <p className="mt-4 text-base leading-relaxed text-[#718096] dark:text-slate-400 sm:text-xl lg:text-[27px]">
            {isArabic
              ? "اختر بوابتك للمتابعة إلى النظام"
              : "Choose your portal to continue"}
          </p>
        </section>

        <section
          aria-label={isArabic ? "بوابات النظام" : "System portals"}
          className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3 md:gap-4 lg:gap-6"
        >
          {orderedPortals.map((portalId) => {
            const portal = portals.find(
              (item) => item.id === portalId,
            );

            if (!portal) {
              return null;
            }

            const content = portalContent[portalId];
            const Icon = portal.icon;
            const isAdmin = portal.id === "admin";

            return (
              <article
                key={portal.id}
                className="flex min-w-0 flex-col items-center rounded-2xl border border-[#DCE7F2] bg-white px-5 py-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 sm:px-6 sm:py-8 lg:px-7 lg:py-9"
              >
                <div
                  className={`flex size-36 shrink-0 items-center justify-center rounded-full sm:size-40 lg:size-[185px] ${isAdmin
                    ? "bg-[#E4F0FF] dark:bg-blue-950"
                    : "bg-[#E7F6F5] dark:bg-teal-950"
                    }`}
                >
                  <Icon
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className={`size-[68px] sm:size-[78px] lg:size-[94px] ${isAdmin
                      ? "text-[#0066CC]"
                      : "text-[#0D9488]"
                      }`}
                  />
                </div>

                <h2 className="mt-5 min-h-[58px] text-center text-xl font-bold leading-relaxed text-[#0F1F38] dark:text-white sm:text-[23px] lg:text-[27px]">
                  {content.title}
                </h2>

                <p className="mt-1 min-h-[48px] text-center text-base leading-7 text-[#718096] dark:text-slate-400 sm:text-lg">
                  {content.description}
                </p>

                <Link
                  href={portal.href}
                  className={`mt-6 flex min-h-[62px] w-full items-center justify-center gap-4 rounded-xl px-4 text-base font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 sm:text-lg lg:mt-7 lg:text-xl ${isAdmin
                    ? "bg-[#0066CC]"
                    : "bg-gradient-to-r from-[#0D9488] to-[#149A9D]"
                    }`}
                >
                  <span>{content.cta}</span>

                  <ArrowRight
                    aria-hidden="true"
                    className={`size-6 shrink-0 ${isArabic ? "rotate-180" : ""
                      }`}
                  />
                </Link>
              </article>
            );
          })}
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1920px] flex-col items-center justify-between gap-3 border-t border-[#DCE5EF] px-4 py-5 text-sm text-[#718096] dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:px-6 sm:text-base lg:px-[42px]">
        <p dir="ltr">© Mjdital Medical System</p>

        <p>
          {isArabic
            ? "خصوصيتك ورعايتك أولويتنا"
            : "Your privacy and care come first"}
        </p>
      </footer>
    </div>
  );
}
