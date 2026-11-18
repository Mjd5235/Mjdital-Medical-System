import { Suspense } from "react";
import { getLocale } from "@/lib/i18n/get-locale";
import type { Locale } from "@/lib/i18n/types";
import { getDoctorsPageDataAction } from "./actions";
import DoctorsManagementPage from "./DoctorsManagement";

// Next 16: allow this route to read the session/cookies dynamically.
export const instant = false;

const EMPTY_OPTIONS = { clinics: [], services: [] };

// Streams in after the shell: the slow part (session check + DB) happens here.
async function DoctorsData({ locale }: { locale: Locale }) {
    const result = await getDoctorsPageDataAction();
    const ok = result.success && result.data;

    return (
        <DoctorsManagementPage
            initialLocale={locale}
            initialDoctors={ok ? result.data!.doctors : []}
            initialOptions={ok ? result.data!.options : EMPTY_OPTIONS}
            initialError={result.success ? null : (result.error ?? "LOAD_FAILED")}
        />
    );
}

export default async function AdminDashboardPage() {
    // Only a cookie read happens before the first byte, so navigation from the
    // sidebar shows the page frame (sidebar, header, skeleton rows) immediately
    // while the data streams in behind it.
    const locale = await getLocale();

    return (
        <Suspense
            fallback={
                <DoctorsManagementPage
                    initialLocale={locale}
                    initialDoctors={[]}
                    initialOptions={EMPTY_OPTIONS}
                    initialError={null}
                    initialLoading
                />
            }
        >
            <DoctorsData locale={locale} />
        </Suspense>
    );
}