// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DoctorsWorkspace.tsx
// Client composition root: wires hooks to the leaf components.
// Receives server-fetched data as props (no client fetch on first load).
// ============================================================================

"use client";

import { useMemo } from "react";
import type { DoctorFormOptions, DoctorRow, DropdownOption } from "../../types";
import AddEditDoctorModal from "./AddEditDoctorModal";
import DeleteDoctorDialog from "./DeleteDoctorDialog";
import DoctorsPageHeader from "./DoctorsPageHeader";
import { useDoctorsLocale } from "./DoctorsPageShell";
import DoctorsTable from "./DoctorsTable";
import DoctorsToolbar from "./DoctorsToolbar";
import { messages } from "./messages";
import ToastStack from "./ToastStack";
import { useDoctorsController } from "./useDoctorsController";
import { useDoctorFilters, useVisibleDoctors } from "./useDoctorsView";

export default function DoctorsWorkspace({
    initialDoctors,
    initialOptions,
}: {
    initialDoctors: DoctorRow[];
    initialOptions: DoctorFormOptions;
}) {
    const locale = useDoctorsLocale();
    const t = messages[locale];
    const isRtl = locale === "ar";

    const filters = useDoctorFilters();

    const controller = useDoctorsController({
        initialDoctors,
        initialOptions,
        locale,
        onDoctorCreated: filters.goToFirstPage,
    });

    const view = useVisibleDoctors({
        doctors: controller.doctors,
        query: filters.query,
        clinicFilter: filters.clinicFilter,
        statusFilter: filters.statusFilter,
        page: filters.page,
        locale,
    });

    const clinicFilterOptions = useMemo<DropdownOption[]>(
        () => [
            { value: "ALL", label: t.allClinics },
            ...controller.options.clinics.map((clinic) => ({
                value: clinic.id,
                label: isRtl ? clinic.nameAr : clinic.nameEn,
            })),
        ],
        [controller.options.clinics, t.allClinics, isRtl],
    );

    const statusFilterOptions = useMemo<DropdownOption[]>(
        () => [
            { value: "ALL", label: t.allStatuses },
            { value: "ACTIVE", label: t.active },
            { value: "INVITED", label: t.invited },
            { value: "INACTIVE", label: t.inactive },
            { value: "NO_ACCOUNT", label: t.noAccount },
        ],
        [t.allStatuses, t.active, t.invited, t.inactive, t.noAccount],
    );

    const { modal, deleteTarget } = controller;

    return (
        <>
            <DoctorsPageHeader t={t} onAdd={controller.openCreate} />

            <DoctorsToolbar
                t={t}
                isRtl={isRtl}
                query={filters.query}
                onQueryChange={filters.changeQuery}
                clinicFilter={filters.clinicFilter}
                onClinicChange={filters.changeClinicFilter}
                clinicOptions={clinicFilterOptions}
                statusFilter={filters.statusFilter}
                onStatusChange={filters.changeStatusFilter}
                statusOptions={statusFilterOptions}
                onReset={filters.resetFilters}
            />

            <DoctorsTable
                doctors={view.visibleDoctors}
                doctorById={view.doctorById}
                locale={locale}
                t={t}
                isRtl={isRtl}
                busyId={controller.busyId}
                total={view.filteredDoctors.length}
                currentPage={view.currentPage}
                totalPages={view.totalPages}
                showingFrom={view.showingFrom}
                showingTo={view.showingTo}
                onPageChange={filters.setPage}
                onEdit={controller.openEdit}
                onDelete={controller.requestDelete}
                onToggleStatus={controller.handleToggleStatus}
                onRegenerate={controller.handleRegenerate}
            />

            {modal && (
                <AddEditDoctorModal
                    key={modal.mode === "edit" ? modal.doctor.id : "create"}
                    doctor={modal.mode === "edit" ? modal.doctor : null}
                    options={controller.options}
                    optionsLoading={controller.optionsLoading}
                    optionsError={controller.optionsError}
                    locale={locale}
                    t={t}
                    onClose={controller.closeModal}
                    onSubmit={controller.submitDoctor}
                    onReloadOptions={controller.reloadOptions}
                />
            )}

            {deleteTarget && (
                <DeleteDoctorDialog
                    doctor={deleteTarget}
                    locale={locale}
                    t={t}
                    onCancel={controller.cancelDelete}
                    onConfirm={controller.confirmDelete}
                />
            )}

            <ToastStack toasts={controller.toasts} t={t} onDismiss={controller.dismissNotice} />
        </>
    );
}