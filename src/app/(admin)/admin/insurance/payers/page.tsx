import { getLocale } from "@/lib/i18n/get-locale";
import InsurancePayersPage from "./payers";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <InsurancePayersPage initialLocale={locale} />;
}