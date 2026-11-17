// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorSkeleton.tsx
// Server-renderable skeletons used as the <Suspense> fallback in page.tsx.
// ============================================================================

import type { Locale } from "@/lib/i18n/types";
import { PAGE_SIZE } from "./constants";
import DoctorsTableHead from "./DoctorsTableHead";
import { messages, type Messages } from "./messages";

export function SkeletonRows() {
    return (
        <>
            {Array.from({ length: PAGE_SIZE }, (_, row) => (
                <tr key={row} className="animate-pulse">
                    <td className="px-6 py-5 align-middle">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-slate-800" />
                            <div className="space-y-2">
                                <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                                <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                            </div>
                        </div>
                    </td>
                    {[96, 96, 112, 160, 48, 96].map((width, cell) => (
                        <td key={cell} className="px-4 py-5 align-middle">
                            <div
                                className="h-4 rounded bg-slate-200 dark:bg-slate-800"
                                style={{ width }}
                            />
                        </td>
                    ))}
                    <td className="px-4 py-5 align-middle">
                        <div className="ms-auto h-11 w-11 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    </td>
                </tr>
            ))}
        </>
    );
}

export function DoctorsTableSkeleton({ t }: { t: Messages }) {
    return (
        <section
            aria-busy="true"
            className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xl shadow-black/20"
        >
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-start">
                    <caption className="sr-only">{t.loading}</caption>
                    <DoctorsTableHead t={t} />
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        <SkeletonRows />
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="flex items-center gap-2">
                    {Array.from({ length: 3 }, (_, index) => (
                        <div
                            key={index}
                            className="h-10 w-10 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

export function DoctorsContentSkeleton({ locale }: { locale: Locale }) {
    const t = messages[locale];

    return (
        <>
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

                <div className="h-12 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            </header>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1.7fr)_minmax(180px,1fr)_minmax(180px,.95fr)_auto]">
                <div className="h-[54px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-[54px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-[54px] animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-[54px] w-36 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            </section>

            <DoctorsTableSkeleton t={t} />
        </>
    );
}