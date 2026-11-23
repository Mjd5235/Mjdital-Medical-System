import { getLocale } from "@/lib/i18n/get-locale";
import FrontDeskToday from "./FrontDeskToday";

export const instant = false;

export default async function ReceptionFrontDeskPage() {
    const locale = await getLocale();

    return <FrontDeskToday initialLocale={locale} />;
}