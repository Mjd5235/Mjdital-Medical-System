// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsPageShell.tsx
// Thin client shell: sidebar open state + live locale sync (html lang/dir).
// `children` are Server Components, so they stay on the server.
// ============================================================================

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";

const DoctorsLocaleContext = createContext<Locale>("ar");

export function useDoctorsLocale(): Locale {
    return useContext(DoctorsLocaleContext);
}

export default function DoctorsPageShell({
    initialLocale,
    children,
}: {
    initialLocale: Locale;
    children: ReactNode;
}) {
    const [locale, setLocale] = useState<Locale>(initialLocale);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const isRtl = locale === "ar";

    useEffect(() => {
        const root = document.documentElement;
        const syncLocale = () => {
            setLocale(root.lang === "en" ? "en" : "ar");
        };

        syncLocale();

        const observer = new MutationObserver(syncLocale);
        observer.observe(root, { attributes: true, attributeFilter: ["lang", "dir"] });

        return () => observer.disconnect();
    }, []);

    return (
        <DoctorsLocaleContext.Provider value={locale}>
            <div
                dir={isRtl ? "rtl" : "ltr"}
                lang={locale}
                className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
            >
                <div className="flex min-h-screen">
                    <AdminSidebar
                        locale={locale}
                        activeHref="/admin/clinical/providers"
                        open={sidebarOpen}
                        onClose={() => setSidebarOpen(false)}
                    />

                    <main className="min-w-0 flex-1">
                        <AdminHeader locale={locale} onMenuOpen={() => setSidebarOpen(true)} />

                        <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </DoctorsLocaleContext.Provider>
    );
}