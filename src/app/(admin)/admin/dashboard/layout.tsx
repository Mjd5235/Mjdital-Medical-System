import { Suspense } from "react";
import { ProtectedPortalShell } from "@/components/portal/protected-portal-shell";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <ProtectedPortalShell portal="admin">{children}</ProtectedPortalShell>
    </Suspense>
  );
}
