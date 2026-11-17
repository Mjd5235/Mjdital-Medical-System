// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/FormPrimitives.tsx
// Tiny presentational building blocks (no hooks, no client directive needed).
// ============================================================================

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Field({
    id,
    label,
    error,
    required = true,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    required?: boolean;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-slate-900 dark:text-slate-100"
            >
                {label}
                {required && <span className="ms-1 text-teal-400">*</span>}
            </label>
            {children}
            {error && (
                <span role="alert" className="mt-1 block text-xs text-rose-400">
                    {error}
                </span>
            )}
        </div>
    );
}

export function SectionTitle({
    icon: Icon,
    children,
}: {
    icon: LucideIcon;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <Icon className="h-7 w-7 shrink-0 text-teal-400" strokeWidth={1.6} />
            <h3 className="shrink-0 text-base font-bold text-slate-900 dark:text-slate-100">
                {children}
            </h3>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700/70" />
        </div>
    );
}