import { getLocale } from "@/lib/i18n/get-locale";
import PricingTaxesPage from "./pricing";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <PricingTaxesPage initialLocale={locale} />;
}