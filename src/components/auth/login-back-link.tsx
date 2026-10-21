import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Locale } from "@/lib/i18n/types";

export function LoginBackLink({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar";

  return (
    <div className="mb-5 flex justify-end">
      <Link
        href="/"
        aria-label={isArabic ? "رجوع إلى اختيار البوابة" : "Back to portal selection"}
        className="inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        {isArabic ? (
          <>
            <span>رجوع</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        ) : (
          <>
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Back</span>
          </>
        )}
      </Link>
    </div>
  );
}
