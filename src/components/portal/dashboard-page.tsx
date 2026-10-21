import { Suspense } from "react";
import { DashboardView } from "@/components/portal/dashboard-view";
import { getLocale, type Portal } from "@/lib/i18n/get-locale";

async function DashboardBody({ portal }: { portal: Portal }) {
  const locale = await getLocale(portal);
  return <DashboardView portal={portal} locale={locale} />;
}

export function PortalDashboardPage({ portal }: { portal: Portal }) {
  return (
    <Suspense fallback={<div className="h-40 rounded-2xl bg-card" />}>
      <DashboardBody portal={portal} />
    </Suspense>
  );
}
