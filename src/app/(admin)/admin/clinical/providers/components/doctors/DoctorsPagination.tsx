// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsPagination.tsx
// ============================================================================

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Messages } from "./messages";
import { pageWindow } from "./utils";

export default function DoctorsPagination({
    t,
    isRtl,
    currentPage,
    totalPages,
    showingFrom,
    showingTo,
    total,
    onPageChange,
}: {
    t: Messages;
    isRtl: boolean;
    currentPage: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    total: number;
    onPageChange: (page: number) => void;
}) {
    const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
    const NextIcon = isRtl ? ChevronLeft : ChevronRight;

    return (
        <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {t.showing}{" "}
                <strong className="text-slate-900 dark:text-slate-100">
                    {showingFrom}–{showingTo}
                </strong>{" "}
                {t.of} <strong className="text-slate-900 dark:text-slate-100">{total}</strong>{" "}
                {t.doctors}
            </p>

            <nav aria-label="Doctor pagination" className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label={t.previous}
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-teal-500 hover:text-teal-400 disabled:opacity-40"
                >
                    <PrevIcon className="h-4 w-4" />
                </button>

                {pageWindow(currentPage, totalPages).map((pageNumber) => (
                    <button
                        type="button"
                        key={pageNumber}
                        aria-current={pageNumber === currentPage ? "page" : undefined}
                        onClick={() => onPageChange(pageNumber)}
                        className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-semibold transition ${pageNumber === currentPage
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-400"
                            }`}
                    >
                        {pageNumber}
                    </button>
                ))}

                <button
                    type="button"
                    aria-label={t.next}
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition hover:border-teal-500 hover:text-teal-400 disabled:opacity-40"
                >
                    <NextIcon className="h-4 w-4" />
                </button>
            </nav>
        </div>
    );
}