// ============================================================================
// FILE: app/admin/clinical/providers/components/doctors/DeleteDoctorDialog.tsx
// ============================================================================

"use client";

import { Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n/types";
import type { DoctorRow } from "../../types";
import type { Messages } from "./messages";
import { outlineButton } from "./ui";
import { displayName } from "./utils";

export default function DeleteDoctorDialog({
    doctor,
    locale,
    t,
    onCancel,
    onConfirm,
}: {
    doctor: DoctorRow;
    locale: Locale;
    t: Messages;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm dark:bg-slate-950/80"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel();
            }}
        >
            <section
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-doctor-title"
                className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-2xl shadow-black/60"
            >
                <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-400">
                        <Trash2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                        <h2
                            id="delete-doctor-title"
                            className="text-lg font-bold text-slate-900 dark:text-white"
                        >
                            {t.deleteTitle}
                        </h2>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {displayName(doctor.fullName, locale)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.deleteBody}</p>
                    </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} className={`${outlineButton} h-11 px-6`}>
                        {t.cancel}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        {t.deleteConfirm}
                    </button>
                </div>
            </section>
        </div>
    );
}