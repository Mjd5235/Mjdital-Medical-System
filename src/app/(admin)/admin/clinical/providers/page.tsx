import { getLocale } from "@/lib/i18n/get-locale";
import { getDoctorsPageDataAction } from "./actions";
import DoctorsManagementPage from "./DoctorsManagement";

// Next 16: allow this route to block while the session/DB data is read.
export const instant = false;

export default async function AdminDashboardPage() {

    const [locale, result] = await Promise.all([
        getLocale(),
        getDoctorsPageDataAction(),
    ]);

    return (
        <DoctorsManagementPage
            initialLocale={locale}
            initialDoctors={result.success && result.data ? result.data.doctors : []}
            initialOptions={
                result.success && result.data
                    ? result.data.options
                    : { clinics: [], services: [] }
            }
            initialError={result.success ? null : (result.error ?? "LOAD_FAILED")}
        />
    );
}