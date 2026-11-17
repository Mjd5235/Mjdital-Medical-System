// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsPageHeader.tsx
// ============================================================================

import { Plus } from "lucide-react";
import type { Messages } from "./messages";
import { tealButton } from "./ui";

export default function DoctorsPageHeader({
    t,
    onAdd,
}: {
    t: Messages;
    onAdd: () => void;
}) {
    return (
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>{t.breadcrumbRoot}</span>
                    <span>/</span>
                    <span>{t.title}</span>
                </div>

                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                    {t.title}
                </h1>

                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{t.subtitle}</p>
            </div>

            <button type="button" onClick={onAdd} className={`${tealButton} h-12 px-6 text-base`}>
                <Plus className="h-5 w-5" />
                {t.add}
            </button>
        </header>
    );
}