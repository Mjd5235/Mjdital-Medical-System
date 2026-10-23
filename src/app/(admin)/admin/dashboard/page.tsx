import { getLocale } from "@/lib/i18n/get-locale";
import AdminDashboardClientView from "./dashboard";

export const instant = false;

export default async function AdminDashboardPage() {
  const locale = await getLocale();

  return <AdminDashboardClientView initialLocale={locale} />;
}