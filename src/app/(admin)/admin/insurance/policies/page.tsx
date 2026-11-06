import { getLocale } from "@/lib/i18n/get-locale";
import PoliciesTiersPage from "./policies";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <PoliciesTiersPage initialLocale={locale} />;
}