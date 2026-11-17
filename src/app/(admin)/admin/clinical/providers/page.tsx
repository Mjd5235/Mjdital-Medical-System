// ============================================================================
// FILE: app/admin/clinical/providers/page.tsx
// Server Component. Fetches data on the server (Prisma, in parallel) and streams
// the interactive workspace in. The shell + skeleton paint immediately.
// ============================================================================

import { Suspense } from "react";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDoctorsSnapshot } from "./queries";
import DoctorsPageShell from "./components/doctors/DoctorsPageShell";
import DoctorsWorkspace from "./components/doctors/DoctorsWorkspace";
import { DoctorsContentSkeleton } from "./components/doctors/DoctorSkeleton";

export const instant = false;

async function DoctorsData() {
    const { doctors, options } = await getDoctorsSnapshot();

    return <DoctorsWorkspace initialDoctors={doctors} initialOptions={options} />;
}

export default async function AdminDashboardPage() {
    const locale = await getLocale();

    return (
        <DoctorsPageShell initialLocale={locale}>
            <Suspense fallback={<DoctorsContentSkeleton locale={locale} />}>
                <DoctorsData />
            </Suspense>
        </DoctorsPageShell>
    );
}