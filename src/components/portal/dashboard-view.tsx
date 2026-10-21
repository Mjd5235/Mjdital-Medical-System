import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Portal } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";

type DashboardViewProps = {
  portal: Portal;
  locale: Locale;
};

export function DashboardView({ portal, locale }: DashboardViewProps) {
  const t = getDictionary(locale);
  const copy = t.dashboards[portal];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
        <p className="mt-1 text-muted">{copy.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {copy.kpis.map((kpi) => (
          <article
            key={kpi.label}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-4"
          >
            <p className="text-sm text-muted">{kpi.label}</p>
            <p className="mt-2 text-4xl font-bold text-primary">{kpi.value}</p>
            <p className="mt-2 text-sm text-teal">{kpi.hint}</p>
          </article>
        ))}
      </div>

      <article className="rounded-2xl border border-border bg-card p-6 shadow-md">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {locale === "ar" ? "مؤكد" : "Confirmed"}
          </span>
          <span className="rounded-full bg-teal px-4 py-2 text-sm font-medium text-teal-foreground">
            {locale === "ar" ? "مكتمل" : "Completed"}
          </span>
          <span className="rounded-full bg-status-waiting px-4 py-2 text-sm font-medium text-white">
            {locale === "ar" ? "قيد الانتظار" : "Waiting"}
          </span>
          <span className="rounded-full bg-status-cancelled px-4 py-2 text-sm font-medium text-white">
            {locale === "ar" ? "ملغي" : "Cancelled"}
          </span>
        </div>
      </article>
    </section>
  );
}
