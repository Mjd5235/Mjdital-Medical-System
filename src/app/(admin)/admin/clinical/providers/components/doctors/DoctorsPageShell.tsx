// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsPageShell.tsx
// SERVER COMPONENT (drop-in replacement for the previous client shell).
// Same props as before, so page.tsx and DoctorsWorkspace.tsx keep working:
//   <DoctorsPageShell initialLocale={locale}>...</DoctorsPageShell>
//   import { useDoctorsLocale } from "./DoctorsPageShell";
// ============================================================================

import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/types";
import AdminShell from "@/components/AdminPortalShell/AdminShell";
import DoctorsLocaleProvider from "./DoctorsLocaleContext";

export { useDoctorsLocale } from "./DoctorsLocaleContext";

export default function DoctorsPageShell({
    initialLocale,
    children,
}: {
    initialLocale: Locale;
    children: ReactNode;
}) {
    return (
        <AdminShell locale={initialLocale} activeHref="/admin/clinical/providers">
            <DoctorsLocaleProvider locale={initialLocale}>{children}</DoctorsLocaleProvider>
        </AdminShell>
    );
}