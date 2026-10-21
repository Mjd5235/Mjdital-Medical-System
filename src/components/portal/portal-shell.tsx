import { signOutFromPortalAction } from "@/actions/auth";
import { LanguageToggle } from "@/components/portal/language-toggle";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Portal } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";

type PortalShellProps = {
  portal: Portal;
  locale: Locale;
  displayName: string;
  children: React.ReactNode;
};

export function PortalShell({
  portal,
  locale,
  displayName,
  children,
}: PortalShellProps) {
  const t = getDictionary(locale);
  const nav = t.nav[portal];

  return (
    <div className="min-h-full bg-background">
      <div className="grid grid-cols-1 md:grid-cols-12">
        <aside className="border-border bg-card md:col-span-2 md:min-h-screen md:border-e">
          <div className="flex items-center gap-3 px-5 py-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-lg font-bold text-teal-foreground shadow-sm">
              +
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">{t.clinicName}</p>
              <p className="text-xs text-muted">{t.city}</p>
            </div>
          </div>
          <nav className="space-y-1 px-3 pb-6">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-slate-clean hover:text-primary dark:hover:bg-charcoal"
              >
                {item.label}
              </a>
            ))}
            <a
              href={`/${portal}/dashboard`}
              className="block rounded-xl px-3 py-2.5 text-sm font-medium text-muted"
            >
              {t.settings}
            </a>
            <form action={signOutFromPortalAction.bind(null, portal)}>
              <button
                type="submit"
                className="w-full rounded-xl px-3 py-2.5 text-start text-sm font-medium text-status-cancelled"
              >
                {t.logout}
              </button>
            </form>
          </nav>
        </aside>

        <div className="md:col-span-10">
          <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-sm text-muted">
                {t.welcome}
                {locale === "ar" ? "، " : ", "}
                {displayName}
              </p>
              <div className="mt-2 flex w-full max-w-xl items-center rounded-2xl border border-border bg-background px-4 py-2.5 shadow-sm">
                <span className="text-sm text-muted">{t.searchPlaceholder}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageToggle locale={locale} />
              <ThemeToggle lightLabel={t.lightMode} darkLabel={t.darkMode} />
            </div>
          </header>
          <main className="px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
