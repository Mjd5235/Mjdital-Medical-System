import { getLocale } from "@/lib/i18n/get-locale";
import CenterSettingsPage from "./settings";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <CenterSettingsPage initialLocale={locale} />;
}