// ============================================================================
// FILE: components/AdminPortalSidebar/SidebarDrawer.tsx
// LEAF client component: only the drawer frame (aside + backdrop + open/close).
// The navigation content is passed as `children` and is rendered on the server.
//
// Link clicks and the close button are handled with ONE delegated onClick on the
// <aside>, so no per-link client components are needed.
// ============================================================================

"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";
import { closeMobileNav, useMobileNavOpen } from "./mobile-nav-store";

function cn(...classes: Array<string | false | undefined>): string {
    return classes.filter(Boolean).join(" ");
}

export default function SidebarDrawer({
    isRtl,
    closeLabel,
    children,
}: {
    isRtl: boolean;
    closeLabel: string;
    children: ReactNode;
}) {
    const open = useMobileNavOpen();

    // Listener exists only while the drawer is open and is removed on close/unmount,
    // so nothing stays attached to the document (bfcache friendly).
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeMobileNav();
        };

        document.addEventListener("keydown", onKeyDown);

        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    function handleClick(event: MouseEvent<HTMLElement>) {
        const target = event.target;

        if (!(target instanceof Element)) return;

        // Any link, or any element marked data-sidebar-close, closes the drawer.
        if (target.closest("a, [data-sidebar-close]")) closeMobileNav();
    }

    return (
        <>
            {open && (
                <button
                    type="button"
                    aria-label={closeLabel}
                    onClick={closeMobileNav}
                    className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
                />
            )}

            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <aside
                id="admin-sidebar"
                onClick={handleClick}
                className={cn(
                    "fixed inset-y-0 z-50 flex h-screen w-[290px] flex-col border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950 lg:sticky lg:top-0 lg:z-20 lg:w-[264px] lg:translate-x-0",
                    isRtl ? "right-0 border-l" : "left-0 border-r",
                    open
                        ? "translate-x-0"
                        : isRtl
                            ? "translate-x-full lg:translate-x-0"
                            : "-translate-x-full lg:translate-x-0",
                )}
            >
                {children}
            </aside>
        </>
    );
}