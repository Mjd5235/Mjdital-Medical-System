import { getLocale } from "@/lib/i18n/get-locale";
import PatientsDirectoryPage from "./patients";

export const instant = false;

export default async function ReceptionFrontDeskPage() {
    const locale = await getLocale();

    return <PatientsDirectoryPage initialLocale={locale} />;
}