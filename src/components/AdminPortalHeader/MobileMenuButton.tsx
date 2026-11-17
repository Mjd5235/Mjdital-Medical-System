// ============================================================================
// FILE: components/AdminPortalHeader/MobileMenuButton.tsx
// LEAF client component: the only interactive piece of the header that is ours.
// ============================================================================

"use client";

import { Menu } from "lucide-react";
import { openMobileNav, useMobileNavOpen } from "@/components/AdminPortalSidebar/mobile-nav-store";

export default function MobileMenuButton({ label }: { label: string }) {
    const open = useMobileNavOpen();

    return (
        <button
            type="button"
            aria-label={label}
            aria-controls="admin-sidebar"
            aria-expanded={open}
            onClick={openMobileNav}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
            <Menu size={21} />
        </button>
    );
}