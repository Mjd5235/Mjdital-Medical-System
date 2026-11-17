// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsTableHead.tsx
// Shared by the real table and the skeleton, so both have identical columns
// (zero layout shift when the data streams in).
// ============================================================================

import type { Messages } from "./messages";

export default function DoctorsTableHead({ t }: { t: Messages }) {
    return (
        <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100">
                <th className="px-6 py-5 text-start align-middle">{t.profile}</th>
                <th className="px-4 py-5 text-start align-middle">{t.nationalId}</th>
                <th className="px-4 py-5 text-start align-middle">{t.license}</th>
                <th className="px-4 py-5 text-start align-middle">{t.clinic}</th>
                <th className="px-4 py-5 text-start align-middle">{t.services}</th>
                <th className="px-4 py-5 text-center align-middle">{t.commission}</th>
                <th className="px-4 py-5 text-start align-middle">{t.status}</th>
                <th className="w-16 px-4 py-5 align-middle">
                    <span className="sr-only">{t.rowActions}</span>
                </th>
            </tr>
        </thead>
    );
}