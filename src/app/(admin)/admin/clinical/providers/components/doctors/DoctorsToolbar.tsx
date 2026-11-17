// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsToolbar.tsx
// ============================================================================

"use client";

import { Building2, Filter, Search, UserRound } from "lucide-react";
import type { DropdownOption } from "../../types";
import Dropdown from "./Dropdown";
import type { Messages } from "./messages";
import { baseInput, outlineButton } from "./ui";

export default function DoctorsToolbar({
    t,
    isRtl,
    query,
    onQueryChange,
    clinicFilter,
    onClinicChange,
    clinicOptions,
    statusFilter,
    onStatusChange,
    statusOptions,
    onReset,
}: {
    t: Messages;
    isRtl: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    clinicFilter: string;
    onClinicChange: (value: string) => void;
    clinicOptions: DropdownOption[];
    statusFilter: string;
    onStatusChange: (value: string) => void;
    statusOptions: DropdownOption[];
    onReset: () => void;
}) {
    return (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1.7fr)_minmax(180px,1fr)_minmax(180px,.95fr)_auto]">
            <label className="relative block">
                <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600 dark:text-slate-300" />
                <input
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={t.search}
                    aria-label={t.search}
                    className={`${baseInput} h-[54px] bg-white dark:bg-slate-900/60 ps-12`}
                />
            </label>

            <Dropdown
                value={clinicFilter}
                onChange={onClinicChange}
                options={clinicOptions}
                placeholder={t.allClinics}
                ariaLabel={t.allClinics}
                icon={Building2}
                isRtl={isRtl}
                variant="filter"
                className="h-[54px] bg-white dark:bg-slate-900/60"
            />

            <Dropdown
                value={statusFilter}
                onChange={onStatusChange}
                options={statusOptions}
                placeholder={t.allStatuses}
                ariaLabel={t.allStatuses}
                icon={UserRound}
                isRtl={isRtl}
                variant="filter"
                className="h-[54px] bg-white dark:bg-slate-900/60"
            />

            <button
                type="button"
                title={t.resetFilters}
                onClick={onReset}
                className={`${outlineButton} h-[54px] bg-white dark:bg-slate-900/60 px-6`}
            >
                <Filter className="h-5 w-5" />
                {t.filters}
            </button>
        </section>
    );
}