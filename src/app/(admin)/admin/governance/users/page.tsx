import { getLocale } from "@/lib/i18n/get-locale";
import UsersRolesPage from "./users";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <UsersRolesPage initialLocale={locale} />;
}