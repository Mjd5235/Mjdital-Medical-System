// ============================================================================
// FILE: components/AdminPortalShell/AdminShell.tsx
// SERVER COMPONENT. Replaces the old client shell: no state, no effects, no
// MutationObserver. Locale/dir come from the server (getLocale) as props.
//
// IMPORTANT: the language switch must change the locale on the server
// (cookie + router.refresh() / revalidation inside <LanguageToggle />), because the
// old client-side MutationObserver on <html lang> is intentionally removed.
// ============================================================================

import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/types";
import AdminSidebar from "@/components/AdminPortalSidebar/Sidebar";
import AdminHeader from "@/components/AdminPortalHeader/Header";

export default function AdminShell({
    locale,
    activeHref,
    children,
}: {
    locale: Locale;
    activeHref: string;
    children: ReactNode;
}) {
    const isRtl = locale === "ar";

    return (
        <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={locale}
            className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100"
        >
            <div className="flex min-h-screen">
                <AdminSidebar locale={locale} activeHref={activeHref} />

                <main className="min-w-0 flex-1">
                    <AdminHeader locale={locale} />

                    <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 xl:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}