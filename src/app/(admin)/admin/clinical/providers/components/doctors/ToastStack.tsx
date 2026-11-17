// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/ToastStack.tsx
// ============================================================================

"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import type { ToastItem } from "../../types";
import type { Messages } from "./messages";

export default function ToastStack({
    toasts,
    t,
    onDismiss,
}: {
    toasts: ToastItem[];
    t: Messages;
    onDismiss: (id: number) => void;
}) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed bottom-6 end-6 z-[200] flex flex-col items-end gap-3"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border bg-white dark:bg-slate-900 p-4 text-sm shadow-2xl shadow-black/50 ${toast.kind === "success" ? "border-teal-600/40" : "border-rose-500/40"
                        }`}
                >
                    {toast.kind === "success" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-500" />
                    ) : (
                        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                    )}

                    <p className="min-w-0 flex-1 break-words text-slate-900 dark:text-slate-100">
                        {toast.message}
                    </p>

                    <button
                        type="button"
                        onClick={() => onDismiss(toast.id)}
                        aria-label={t.close}
                        className="rounded-md p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}