// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorActionsMenu.tsx
// Row dropdown menu: edit / toggle status / delete / regenerate password.
// ============================================================================

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    KeyRound,
    LoaderCircle,
    MoreHorizontal,
    Pencil,
    Trash2,
    UserCheck,
    UserX,
} from "lucide-react";
import type { DoctorListItem } from "../../types";
import type { Messages } from "./messages";

export default function DoctorActionsMenu({
    doctor,
    t,
    isRtl,
    busy,
    disabled,
    onEdit,
    onDelete,
    onToggleStatus,
    onRegenerate,
}: {
    doctor: DoctorListItem;
    t: Messages;
    isRtl: boolean;
    busy: boolean;
    disabled: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onToggleStatus: () => void;
    onRegenerate: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const reposition = useCallback(() => {
        const button = buttonRef.current;
        const menu = menuRef.current;

        if (!button || !menu) return;

        const rect = button.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const margin = 8;
        const gap = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = isRtl ? rect.left : rect.right - width;
        left = Math.min(Math.max(margin, left), viewportWidth - width - margin);

        const spaceBelow = viewportHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        let top =
            height + gap <= spaceBelow || spaceBelow >= spaceAbove
                ? rect.bottom + gap
                : rect.top - height - gap;

        top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - height - margin));

        setPosition({ top, left });
    }, [isRtl]);

    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    useEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;

            if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
                return;
            }

            setOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
                buttonRef.current?.focus();
            }
        };

        const onViewportChange = () => reposition();

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("touchstart", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("resize", onViewportChange);
        window.addEventListener("scroll", onViewportChange, true);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("touchstart", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("resize", onViewportChange);
            window.removeEventListener("scroll", onViewportChange, true);
        };
    }, [open, reposition]);

    const choose = (handler: () => void) => {
        setOpen(false);
        handler();
    };

    const menuItemBase =
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start font-medium transition focus:outline-none";

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.rowActions}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={busy || disabled}
                onClick={() => setOpen((value) => !value)}
                className={`grid h-11 w-11 place-items-center rounded-lg border text-slate-600 dark:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 ${open
                    ? "border-teal-500 bg-teal-600/10 text-teal-400"
                    : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
            >
                {busy ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-teal-400" />
                ) : (
                    <MoreHorizontal className="h-5 w-5" />
                )}
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        dir={isRtl ? "rtl" : "ltr"}
                        style={{
                            position: "fixed",
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? "visible" : "hidden",
                        }}
                        className="z-[150] w-[300px] max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 shadow-2xl shadow-black/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onEdit)}
                            className={`${menuItemBase} text-slate-900 hover:bg-teal-600/10 hover:text-teal-600 focus:bg-teal-600/10 focus:text-teal-600 dark:text-slate-100 dark:hover:text-teal-400 dark:focus:text-teal-400`}
                        >
                            <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuEdit}
                        </button>

                        {doctor.isActive ? (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => choose(onToggleStatus)}
                                className={`${menuItemBase} text-amber-600 hover:bg-amber-500/10 focus:bg-amber-500/10 dark:text-amber-400`}
                            >
                                <UserX className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                {t.menuDeactivate}
                            </button>
                        ) : (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => choose(onToggleStatus)}
                                className={`${menuItemBase} text-teal-600 hover:bg-teal-600/10 focus:bg-teal-600/10 dark:text-teal-400`}
                            >
                                <UserCheck className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                {t.menuActivate}
                            </button>
                        )}

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => choose(onDelete)}
                            className={`${menuItemBase} text-rose-400 hover:bg-rose-500/10 focus:bg-rose-500/10`}
                        >
                            <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                            {t.menuDelete}
                        </button>

                        {doctor.mustChangePassword && (
                            <>
                                <div className="my-2 h-px bg-slate-200 dark:bg-slate-700/70" />
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => choose(onRegenerate)}
                                    className={`${menuItemBase} text-teal-400 hover:bg-teal-600/10 focus:bg-teal-600/10`}
                                >
                                    <KeyRound className="h-5 w-5 shrink-0" strokeWidth={1.6} />
                                    {t.menuRegenerate}
                                </button>
                            </>
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
}