import { Suspense } from "react";
import AdminDashboardPage from "./page";
import { getLocale } from "@/lib/i18n/get-locale";

export default async function AdminDashboardLayout() {

  const locale = await getLocale()
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <AdminDashboardPage initialLocale={locale} />
    </Suspense>
  );
}
