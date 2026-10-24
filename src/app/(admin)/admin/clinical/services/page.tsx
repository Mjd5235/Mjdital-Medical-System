import { getLocale } from "@/lib/i18n/get-locale";
import ClinicsServicesPage from "./clinics-services";

export const instant = false;

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return <ClinicsServicesPage initialLocale={locale} />;
}