import { getLocale } from "@/lib/i18n/get-locale";
import SchedulesShiftsPage from "./schedules";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <SchedulesShiftsPage initialLocale={locale} />;
}