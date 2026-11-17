// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/useDoctorsView.ts
// Filter state + derived (filtered / paginated) list.
// ============================================================================

"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/types";
import type { DoctorRow } from "../../types";
import { PAGE_SIZE } from "./constants";
import { toListItem } from "./utils";

export function useDoctorFilters() {
    const [query, setQuery] = useState("");
    const [clinicFilter, setClinicFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [page, setPage] = useState(1);

    // Page resets happen in the handlers, so there is no extra effect-driven re-render.
    function changeQuery(value: string) {
        setQuery(value);
        setPage(1);
    }

    function changeClinicFilter(value: string) {
        setClinicFilter(value);
        setPage(1);
    }

    function changeStatusFilter(value: string) {
        setStatusFilter(value);
        setPage(1);
    }

    function resetFilters() {
        setQuery("");
        setClinicFilter("ALL");
        setStatusFilter("ALL");
        setPage(1);
    }

    function goToFirstPage() {
        setPage(1);
    }

    return {
        query,
        clinicFilter,
        statusFilter,
        page,
        setPage,
        changeQuery,
        changeClinicFilter,
        changeStatusFilter,
        resetFilters,
        goToFirstPage,
    };
}

export function useVisibleDoctors({
    doctors,
    query,
    clinicFilter,
    statusFilter,
    page,
    locale,
}: {
    doctors: DoctorRow[];
    query: string;
    clinicFilter: string;
    statusFilter: string;
    page: number;
    locale: Locale;
}) {
    const deferredQuery = useDeferredValue(query);

    const displayDoctors = useMemo(
        () => doctors.map((doctor) => toListItem(doctor, locale)),
        [doctors, locale],
    );

    const doctorById = useMemo(
        () => new Map(doctors.map((doctor) => [doctor.id, doctor] as const)),
        [doctors],
    );

    const filteredDoctors = useMemo(() => {
        const normalized = deferredQuery.trim().toLocaleLowerCase(locale);

        return displayDoctors.filter(
            (doctor) =>
                (!normalized || doctor.searchText.includes(normalized)) &&
                (clinicFilter === "ALL" || doctor.clinicId === clinicFilter) &&
                (statusFilter === "ALL" || doctor.accountStatus === statusFilter),
        );
    }, [displayDoctors, deferredQuery, clinicFilter, statusFilter, locale]);

    const totalPages = Math.max(1, Math.ceil(filteredDoctors.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visibleDoctors = filteredDoctors.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );

    const showingFrom = filteredDoctors.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const showingTo = Math.min(currentPage * PAGE_SIZE, filteredDoctors.length);

    return {
        doctorById,
        filteredDoctors,
        visibleDoctors,
        totalPages,
        currentPage,
        showingFrom,
        showingTo,
    };
}