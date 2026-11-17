// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsTable.tsx
// Rows + pagination.
// ============================================================================

"use client";

import type { Locale } from "@/lib/i18n/types";
import type { DoctorListItem, DoctorRow } from "../../types";
import { rankLabels } from "./constants";
import DoctorActionsMenu from "./DoctorActionsMenu";
import DoctorsPagination from "./DoctorsPagination";
import DoctorsTableHead from "./DoctorsTableHead";
import type { Messages } from "./messages";
import StatusBadge from "./StatusBadge";
import { displayName, initials, isTempId, maskIdentity } from "./utils";

export default function DoctorsTable({
    doctors,
    doctorById,
    locale,
    t,
    isRtl,
    busyId,
    total,
    currentPage,
    totalPages,
    showingFrom,
    showingTo,
    onPageChange,
    onEdit,
    onDelete,
    onToggleStatus,
    onRegenerate,
}: {
    doctors: DoctorListItem[];
    doctorById: Map<string, DoctorRow>;
    locale: Locale;
    t: Messages;
    isRtl: boolean;
    busyId: string | null;
    total: number;
    currentPage: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    onPageChange: (page: number) => void;
    onEdit: (doctor: DoctorRow) => void;
    onDelete: (doctor: DoctorRow) => void;
    onToggleStatus: (doctor: DoctorRow) => void;
    onRegenerate: (doctor: DoctorRow) => void;
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xl shadow-black/20">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-start">
                    <caption className="sr-only">{t.title}</caption>

                    <DoctorsTableHead t={t} />

                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {doctors.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="h-56 text-center align-middle text-sm text-slate-500 dark:text-slate-400"
                                >
                                    {t.empty}
                                </td>
                            </tr>
                        ) : (
                            doctors.map((doctor) => {
                                const source = doctorById.get(doctor.id);
                                const pendingCreate = isTempId(doctor.id);

                                return (
                                    <tr
                                        key={doctor.id}
                                        className={`transition hover:bg-slate-100 dark:hover:bg-slate-800/30 ${pendingCreate ? "opacity-70" : ""
                                            }`}
                                    >
                                        <td className="px-6 py-5 align-middle">
                                            <div className="flex items-center gap-4">
                                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-100 dark:bg-slate-700/60 text-base font-bold text-slate-900 dark:text-slate-100">
                                                    {initials(doctor.fullName)}
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="max-w-56 truncate text-base font-bold text-slate-900 dark:text-white">
                                                        {displayName(doctor.fullName, locale)}
                                                    </p>
                                                    <p className="mt-1 max-w-56 truncate text-sm text-slate-500 dark:text-slate-400">
                                                        {rankLabels[doctor.professionalRank][locale]} ·{" "}
                                                        {doctor.specialty}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                            <span dir="ltr">{maskIdentity(doctor.nationalId)}</span>
                                        </td>

                                        <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                            <span dir="ltr">{doctor.scfhsLicenseNumber}</span>
                                        </td>

                                        <td className="px-4 py-5 align-middle text-base text-slate-900 dark:text-slate-100">
                                            {doctor.clinicName}
                                        </td>

                                        <td className="px-4 py-5 align-middle">
                                            <div className="flex max-w-64 flex-wrap gap-2">
                                                {doctor.services.map((service) => (
                                                    <span
                                                        key={service.id}
                                                        className="inline-flex max-w-40 items-center gap-2 rounded-lg bg-teal-600/10 px-3 py-2 text-sm text-teal-300"
                                                    >
                                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500" />
                                                        <span className="truncate">{service.name}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>

                                        <td className="px-4 py-5 text-center align-middle text-base font-semibold text-slate-900 dark:text-slate-100">
                                            <span dir="ltr">{doctor.commissionRate}%</span>
                                        </td>

                                        <td className="px-4 py-5 align-middle">
                                            <StatusBadge status={doctor.accountStatus} t={t} />
                                        </td>

                                        <td className="px-4 py-5 text-end align-middle">
                                            {source && (
                                                <DoctorActionsMenu
                                                    doctor={doctor}
                                                    t={t}
                                                    isRtl={isRtl}
                                                    busy={busyId === doctor.id}
                                                    disabled={pendingCreate}
                                                    onEdit={() => onEdit(source)}
                                                    onDelete={() => onDelete(source)}
                                                    onToggleStatus={() => onToggleStatus(source)}
                                                    onRegenerate={() => onRegenerate(source)}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <DoctorsPagination
                t={t}
                isRtl={isRtl}
                currentPage={currentPage}
                totalPages={totalPages}
                showingFrom={showingFrom}
                showingTo={showingTo}
                total={total}
                onPageChange={onPageChange}
            />
        </section>
    );
}