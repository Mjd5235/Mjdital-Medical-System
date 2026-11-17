import { getLocale } from "@/lib/i18n/get-locale";
import DoctorsManagementPage from "./DoctorsManagement";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <DoctorsManagementPage initialLocale={locale} />;
}