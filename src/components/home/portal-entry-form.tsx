import { enterPortalAction } from "@/actions/auth";
import type { Portal } from "@/lib/i18n/get-locale";

type PortalEntryFormProps = {
  portal: Portal;
  title: string;
  description: string;
  cta: string;
};

export function PortalEntryForm({
  portal,
  title,
  description,
  cta,
}: PortalEntryFormProps) {
  async function action() {
    "use server";
    await enterPortalAction(portal);
  }

  return (
    <form
      action={action}
      className="rounded-2xl border border-border bg-card p-6 shadow-md"
    >
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
      <button
        type="submit"
        className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm ${
          portal === "doctor" ? "bg-teal" : "bg-primary"
        }`}
      >
        {cta}
      </button>
    </form>
  );
}
