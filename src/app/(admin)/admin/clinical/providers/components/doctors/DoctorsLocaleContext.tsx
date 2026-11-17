// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsLocaleContext.tsx
// LEAF client component: only passes the server locale down to client children.
// No state, no effects, no observers.
// ============================================================================

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/types";

const DoctorsLocaleContext = createContext<Locale>("ar");

export function useDoctorsLocale(): Locale {
    return useContext(DoctorsLocaleContext);
}

export default function DoctorsLocaleProvider({
    locale,
    children,
}: {
    locale: Locale;
    children: ReactNode;
}) {
    return <DoctorsLocaleContext.Provider value={locale}>{children}</DoctorsLocaleContext.Provider>;
}