// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/StatusBadge.tsx
// ============================================================================

import type { DoctorListItem } from "../../types";
import type { Messages } from "./messages";

export default function StatusBadge({
    status,
    t,
}: {
    status: DoctorListItem["accountStatus"];
    t: Messages;
}) {
    const config =
        status === "ACTIVE"
            ? {
                label: t.active,
                wrap: "bg-emerald-500/10 text-emerald-400",
                dot: "bg-emerald-400",
            }
            : status === "INVITED"
                ? {
                    label: t.invited,
                    wrap: "bg-sky-500/10 text-sky-400",
                    dot: "bg-sky-400",
                }
                : status === "INACTIVE"
                    ? {
                        label: t.inactive,
                        wrap: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        dot: "bg-amber-500 dark:bg-amber-400",
                    }
                    : {
                        label: t.noAccount,
                        wrap: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
                        dot: "bg-slate-500 dark:bg-slate-400",
                    };

    return (
        <span
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold ${config.wrap}`}
        >
            <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
            {config.label}
        </span>
    );
}