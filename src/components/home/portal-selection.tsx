import type { ReactNode } from "react";
import Image from "next/image";
import { enterPortalAction } from "@/actions/auth";
import {
  AdminPortalIcon,
  DoctorPortalIcon,
  ReceptionPortalIcon,
} from "@/components/home/portal-icons";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { directionForLocale, type Portal } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";
import { ArrowRight } from "lucide-react";

type PortalSelectionProps = {
  locale: Locale;
};

type PortalCardConfig = {
  portal: Portal;
  accent: "blue" | "teal";
  icon: ReactNode;
};

const PORTAL_CARDS: readonly PortalCardConfig[] = [
  {
    portal: "admin",
    accent: "blue",
    icon: <AdminPortalIcon className="size-14" />,
  },
  {
    portal: "doctor",
    accent: "teal",
    icon: <DoctorPortalIcon className="size-14" />,
  },
  {
    portal: "reception",
    accent: "teal",
    icon: <ReceptionPortalIcon className="size-14" />,
  },
];

function PortalCard({
  portal,
  accent,
  icon,
  title,
  description,
  cta,
}: {
  portal: Portal;
  accent: "blue" | "teal";
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  const iconWrap =
    accent === "blue"
      ? "bg-[#E8F3FC] text-[#0066CC] dark:bg-sky-950/70 dark:text-sky-300"
      : "bg-[#E6F6F4] text-[#0D9488] dark:bg-teal-950/70 dark:text-teal-300";
  const buttonClass =
    accent === "blue"
      ? "bg-[#0066CC] hover:bg-[#005bb8] focus-visible:ring-blue-200"
      : "bg-[#0D9488] hover:bg-[#0b8379] focus-visible:ring-teal-200";

  return (
    <form action={enterPortalAction.bind(null, portal)} className="h-full">
      <button
        type="submit"
        className="flex h-full w-full flex-col items-center rounded-[28px] border border-[#EEF2F6] bg-white px-6 pb-8 pt-10 text-center shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-22px_rgba(15,23,42,0.38)] dark:border-slate-700 dark:bg-slate-800 sm:px-8"
      >
        <span
          className={`mb-7 flex size-[104px] items-center justify-center rounded-full ${iconWrap}`}
        >
          {icon}
        </span>
        <h3 className="text-[22px] font-extrabold leading-snug text-[#0F172A] dark:text-white sm:text-[24px]">
          {title}
        </h3>
        <p className="mt-2 min-h-12 text-[15px] leading-7 text-[#64748B] dark:text-slate-300">
          {description}
        </p>
        <span
          className={`mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 ${buttonClass}`}
        >
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          <span>{cta}</span>
        </span>
      </button>
    </form>
  );
}

export function PortalSelection({ locale }: PortalSelectionProps) {
  const t = getDictionary(locale);
  const dir = directionForLocale(locale);

  return (
    <div
      dir={dir}
      lang={locale}
      className="min-h-dvh bg-[#F7FAFC] text-[#0F172A] dark:bg-slate-950 dark:text-slate-50"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col px-4 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4 py-6 sm:py-8">
          <div className="flex items-center">
            <Image
              src="/mjdital_logo.png"
              alt="Mjdital"
              width={168}
              height={42}
              priority
              className="h-10 w-auto sm:h-11"
            />
          </div>
          <div className="flex items-center gap-3" dir="ltr">
            <LanguageToggle locale={locale} variant="header" />
            <ThemeToggle
              lightLabel={t.lightMode}
              darkLabel={t.darkMode}
              variant="header"
            />
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          <div className="mx-auto max-w-3xl pb-10 pt-2 text-center sm:pb-14 sm:pt-4">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F172A] dark:text-white sm:text-[40px] lg:text-[44px]">
              {t.home.title}
            </h1>
            <p className="mt-3 text-base text-[#94A3B8] dark:text-slate-400 sm:text-lg">
              {t.home.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {PORTAL_CARDS.map((card) => {
              const copy = t.portals[card.portal];
              return (
                <PortalCard
                  key={card.portal}
                  portal={card.portal}
                  accent={card.accent}
                  icon={card.icon}
                  title={copy.title}
                  description={copy.description}
                  cta={copy.cta}
                />
              );
            })}
          </div>
        </main>

        <footer className="mt-auto flex flex-col gap-2 border-t border-[#EEF2F6] py-6 text-sm text-[#94A3B8] dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{t.home.privacy}</p>
          <p>{t.home.copyright}</p>
        </footer>
      </div>
    </div>
  );
}
