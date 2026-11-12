import { getLocale } from "@/lib/i18n/get-locale";
import ZatcaIntegrationPage from "./zatca";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <ZatcaIntegrationPage initialLocale={locale} />;
}