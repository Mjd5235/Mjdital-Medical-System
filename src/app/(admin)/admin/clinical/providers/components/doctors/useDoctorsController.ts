// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/useDoctorsController.ts
// Optimistic mutation engine:
//  - UI updates in the same frame, the server syncs in the background
//  - per-row queue so rapid clicks never race
//  - failure => rollback + error toast
// ============================================================================

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/types";
import {
    createDoctorAction,
    deleteDoctorAction,
    getDoctorFormOptions,
    getDoctorsSnapshotAction,
    regenerateTempPasswordAction,
    setDoctorActiveStatusAction,
    updateDoctorAction,
} from "../../actions";
import type {
    CreateDoctorInput,
    DoctorFormOptions,
    DoctorRow,
    ModalState,
    Notice,
    ToastItem,
} from "../../types";
import { EMPTY_OPTIONS, MAX_TOASTS, OPTIONS_STALE_MS, TOAST_MS } from "./constants";
import { messages, type Messages } from "./messages";
import {
    buildOptimisticRow,
    copyText,
    deriveAccountStatus,
    isTempId,
    makeTempId,
} from "./utils";

export function useDoctorsController({
    initialDoctors,
    initialOptions,
    locale,
    onDoctorCreated,
}: {
    initialDoctors: DoctorRow[];
    initialOptions: DoctorFormOptions;
    locale: Locale;
    onDoctorCreated: () => void;
}) {
    const t = messages[locale];

    const [doctors, setDoctors] = useState<DoctorRow[]>(initialDoctors);
    const [options, setOptions] = useState<DoctorFormOptions>(initialOptions);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [optionsError, setOptionsError] = useState("");
    const [modal, setModal] = useState<ModalState>(null);
    const [deleteTarget, setDeleteTarget] = useState<DoctorRow | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    // Always-fresh mirrors so background tasks never read stale closures.
    const tRef = useRef<Messages>(t);
    const doctorsRef = useRef<DoctorRow[]>(initialDoctors);
    const optionsRef = useRef<DoctorFormOptions>(initialOptions);
    const optionsLoadedRef = useRef(initialOptions !== EMPTY_OPTIONS);
    const optionsFetchedAtRef = useRef(0);
    const optionsInflightRef = useRef(false);
    const queueRef = useRef(new Map<string, Promise<void>>());
    const toastIdRef = useRef(0);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    useEffect(() => {
        // Options arrived with the server render, so they are fresh right now.
        optionsFetchedAtRef.current = Date.now();
    }, []);

    /* ---------------------------- toasts ---------------------------- */

    const dismissNotice = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const pushNotice = useCallback(
        (notice: Notice): number => {
            const id = ++toastIdRef.current;

            setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...notice, id }]);
            window.setTimeout(() => dismissNotice(id), TOAST_MS);

            return id;
        },
        [dismissNotice],
    );

    /* ------------------------ local data store ----------------------- */

    // Single entry point for every local change: updates the ref synchronously
    // (so rapid actions see the latest rows) and schedules the React render.
    const updateDoctors = useCallback(
        (updater: (current: DoctorRow[]) => DoctorRow[]): DoctorRow[] => {
            const next = updater(doctorsRef.current);

            doctorsRef.current = next;
            setDoctors(next);

            return next;
        },
        [],
    );

    // Server calls for the same row run strictly in order.
    const enqueue = useCallback((id: string, task: () => Promise<void>) => {
        const previous = queueRef.current.get(id) ?? Promise.resolve();
        const next: Promise<void> = previous
            .then(task)
            .catch(() => undefined)
            .then(() => {
                if (queueRef.current.get(id) === next) queueRef.current.delete(id);
            });

        queueRef.current.set(id, next);
    }, []);

    /* ----------------------------- loaders --------------------------- */

    // Silent reconciliation with the server, used only after a conflicting rollback.
    const resyncDoctors = useCallback(async () => {
        try {
            const result = await getDoctorsSnapshotAction();

            if (result.success && result.data) {
                const fresh = result.data.doctors;

                updateDoctors((current) => [
                    ...current.filter((item) => isTempId(item.id)),
                    ...fresh,
                ]);
            }
        } catch {
            // Keep the current local state if the background sync fails.
        }
    }, [updateDoctors]);

    // `background` refreshes never show loaders and are skipped while the cache is fresh.
    const loadOptions = useCallback(async (background = false) => {
        const hasData = optionsLoadedRef.current;

        if (
            background &&
            hasData &&
            Date.now() - optionsFetchedAtRef.current < OPTIONS_STALE_MS
        ) {
            return;
        }

        if (optionsInflightRef.current) return;

        optionsInflightRef.current = true;

        const showBlocking = !background || !hasData;

        if (showBlocking) {
            setOptionsLoading(true);
            setOptionsError("");
        }

        try {
            const result = await getDoctorFormOptions();

            if (!result.success || !result.data) {
                if (showBlocking) {
                    setOptionsError(result.error ?? tRef.current.optionsError);

                    if (!optionsLoadedRef.current) {
                        optionsRef.current = EMPTY_OPTIONS;
                        setOptions(EMPTY_OPTIONS);
                    }
                }
                return;
            }

            optionsRef.current = result.data;
            optionsLoadedRef.current = true;
            optionsFetchedAtRef.current = Date.now();
            setOptions(result.data);
            setOptionsError("");
        } catch {
            if (showBlocking) {
                setOptionsError(tRef.current.optionsError);

                if (!optionsLoadedRef.current) {
                    optionsRef.current = EMPTY_OPTIONS;
                    setOptions(EMPTY_OPTIONS);
                }
            }
        } finally {
            optionsInflightRef.current = false;

            if (showBlocking) setOptionsLoading(false);
        }
    }, []);

    /* --------------------- optimistic settle / rollback -------------- */

    const settleRow = useCallback(
        (optimistic: DoctorRow, confirmed: DoctorRow) => {
            // Only replace the row if no newer optimistic change has superseded it.
            updateDoctors((list) => list.map((item) => (item === optimistic ? confirmed : item)));
        },
        [updateDoctors],
    );

    const rollbackRow = useCallback(
        (optimistic: DoctorRow, previous: DoctorRow, toastId: number, message: string) => {
            dismissNotice(toastId);

            const next = updateDoctors((list) =>
                list.map((item) => (item === optimistic ? previous : item)),
            );

            // A newer local change superseded this one: reconcile with the server.
            if (!next.includes(previous)) void resyncDoctors();

            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, resyncDoctors, updateDoctors],
    );

    const removeTempRow = useCallback(
        (tempId: string, toastId: number, message: string) => {
            dismissNotice(toastId);
            updateDoctors((list) => list.filter((item) => item.id !== tempId));
            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, updateDoctors],
    );

    const restoreDeletedRow = useCallback(
        (snapshot: DoctorRow, index: number, toastId: number, message: string) => {
            dismissNotice(toastId);
            updateDoctors((list) => {
                if (list.some((item) => item.id === snapshot.id)) return list;

                const next = [...list];
                next.splice(Math.min(Math.max(index, 0), next.length), 0, snapshot);

                return next;
            });
            pushNotice({ kind: "error", message });
        },
        [dismissNotice, pushNotice, updateDoctors],
    );

    const announceGeneratedPassword = useCallback(
        async (email: string | null, password: string, base: string) => {
            const copied = await copyText(`Email: ${email ?? ""} | Temporary Password: ${password}`);
            const current = tRef.current;

            pushNotice(
                copied
                    ? { kind: "success", message: `${base} ${current.generatedCopied}` }
                    : { kind: "error", message: `${base} ${current.copyFailed} ${password}` },
            );
        },
        [pushNotice],
    );

    /* -------------------------- modal handlers ----------------------- */

    const closeModal = useCallback(() => setModal(null), []);

    function openCreate() {
        setModal({ mode: "create" });
        void loadOptions(true);
    }

    function openEdit(doctor: DoctorRow) {
        setModal({ mode: "edit", doctor });
        void loadOptions(true);
    }

    function requestDelete(doctor: DoctorRow) {
        setDeleteTarget(doctor);
    }

    function cancelDelete() {
        setDeleteTarget(null);
    }

    /* ----------------------- optimistic mutations -------------------- */

    function submitDoctor(input: CreateDoctorInput) {
        const currentModal = modal;

        // Close instantly — the row below is already updated in this same frame.
        setModal(null);

        if (currentModal?.mode === "edit") {
            const base =
                doctorsRef.current.find((item) => item.id === currentModal.doctor.id) ??
                currentModal.doctor;
            const optimistic = buildOptimisticRow(input, base, base.id, optionsRef.current);

            updateDoctors((list) => list.map((item) => (item.id === base.id ? optimistic : item)));

            const toastId = pushNotice({ kind: "success", message: t.updated });

            enqueue(base.id, async () => {
                try {
                    const result = await updateDoctorAction({ ...input, doctorId: base.id });

                    if (!result.success || !result.data) {
                        rollbackRow(optimistic, base, toastId, result.error ?? tRef.current.failed);
                        return;
                    }

                    const updated = result.data.doctor;

                    settleRow(optimistic, updated);

                    if (result.data.generatedPassword) {
                        await announceGeneratedPassword(
                            updated.email,
                            result.data.generatedPassword,
                            tRef.current.updated,
                        );
                    }
                } catch {
                    rollbackRow(optimistic, base, toastId, tRef.current.failed);
                }
            });

            return;
        }

        const tempId = makeTempId();
        const optimistic = buildOptimisticRow(input, null, tempId, optionsRef.current);

        updateDoctors((list) => [optimistic, ...list]);
        onDoctorCreated();

        const toastId = pushNotice({ kind: "success", message: t.success });

        enqueue(tempId, async () => {
            try {
                const result = await createDoctorAction(input);

                if (!result.success || !result.data) {
                    removeTempRow(tempId, toastId, result.error ?? tRef.current.failed);
                    return;
                }

                const created: DoctorRow = {
                    ...result.data.doctor,
                    accountStatus: "INVITED",
                    mustChangePassword: true,
                };

                updateDoctors((list) => list.map((item) => (item.id === tempId ? created : item)));

                if (result.data.generatedPassword) {
                    await announceGeneratedPassword(
                        created.email,
                        result.data.generatedPassword,
                        tRef.current.success,
                    );
                }
            } catch {
                removeTempRow(tempId, toastId, tRef.current.failed);
            }
        });
    }

    function handleToggleStatus(doctor: DoctorRow) {
        if (isTempId(doctor.id)) return;

        const current = doctorsRef.current.find((item) => item.id === doctor.id) ?? doctor;
        const nextActive = !current.isActive;
        const optimistic: DoctorRow = {
            ...current,
            isActive: nextActive,
            accountStatus: deriveAccountStatus(
                nextActive,
                current.email !== null,
                current.mustChangePassword,
            ),
        };

        updateDoctors((list) => list.map((item) => (item.id === current.id ? optimistic : item)));

        const toastId = pushNotice({
            kind: "success",
            message: nextActive ? t.activated : t.deactivated,
        });

        enqueue(current.id, async () => {
            try {
                const result = await setDoctorActiveStatusAction(current.id, nextActive);

                if (!result.success || !result.data) {
                    rollbackRow(optimistic, current, toastId, result.error ?? tRef.current.failed);
                    return;
                }

                settleRow(optimistic, result.data.doctor);
            } catch {
                rollbackRow(optimistic, current, toastId, tRef.current.failed);
            }
        });
    }

    function confirmDelete() {
        if (!deleteTarget) return;

        const target = deleteTarget;
        const index = doctorsRef.current.findIndex((item) => item.id === target.id);
        const snapshot = index >= 0 ? (doctorsRef.current[index] as DoctorRow) : target;

        // Dialog closes and the row disappears immediately.
        setDeleteTarget(null);
        updateDoctors((list) => list.filter((item) => item.id !== target.id));

        const toastId = pushNotice({ kind: "success", message: t.deleted });

        enqueue(target.id, async () => {
            try {
                const result = await deleteDoctorAction(target.id);

                // A record that is already gone on the server is the outcome we wanted.
                if (!result.success && result.code !== "RECORD_NOT_FOUND") {
                    restoreDeletedRow(snapshot, index, toastId, result.error ?? tRef.current.failed);
                }
            } catch {
                restoreDeletedRow(snapshot, index, toastId, tRef.current.failed);
            }
        });
    }

    // The only action that must wait for the server: the password is generated there.
    function handleRegenerate(doctor: DoctorRow) {
        if (isTempId(doctor.id)) return;

        setBusyId(doctor.id);

        enqueue(doctor.id, async () => {
            try {
                const result = await regenerateTempPasswordAction(doctor.id);

                if (!result.success || !result.data) {
                    pushNotice({ kind: "error", message: result.error ?? tRef.current.failed });
                    return;
                }

                const { email, temporaryPassword } = result.data;
                const copied = await copyText(`Email: ${email} | Temporary Password: ${temporaryPassword}`);

                pushNotice(
                    copied
                        ? { kind: "success", message: tRef.current.regenerated }
                        : { kind: "error", message: `${tRef.current.copyFailed} ${temporaryPassword}` },
                );
            } catch {
                pushNotice({ kind: "error", message: tRef.current.failed });
            } finally {
                setBusyId((current) => (current === doctor.id ? null : current));
            }
        });
    }

    return {
        doctors,
        options,
        optionsLoading,
        optionsError,
        modal,
        deleteTarget,
        busyId,
        toasts,
        dismissNotice,
        reloadOptions: () => void loadOptions(),
        openCreate,
        openEdit,
        closeModal,
        requestDelete,
        cancelDelete,
        submitDoctor,
        handleToggleStatus,
        confirmDelete,
        handleRegenerate,
    };
}