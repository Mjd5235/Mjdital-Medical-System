import { PortalShell } from "@/components/portal/portal-shell";
import { requirePortalSession } from "@/lib/auth/guard";
import { getLocale, type Portal } from "@/lib/i18n/get-locale";

type ProtectedPortalShellProps = {
  portal: Portal;
  children: React.ReactNode;
};

export async function ProtectedPortalShell({
  portal,
  children,
}: ProtectedPortalShellProps) {
  const locale = await getLocale(portal);
  const session = await requirePortalSession(portal);
  const displayName =
    locale === "ar" ? session.fullNameAr : session.fullNameEn;

  return (
    <PortalShell portal={portal} locale={locale} displayName={displayName}>
      {children}
    </PortalShell>
  );
}
